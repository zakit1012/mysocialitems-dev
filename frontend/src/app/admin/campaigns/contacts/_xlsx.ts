/**
 * Reads the cells of an Excel workbook (.xlsx) in the browser, with no
 * library: an .xlsx is a zip of XML files, the browser unzips with
 * DecompressionStream and reads XML with DOMParser. Only what an import
 * needs: every sheet's name and its cells as text.
 */

export type XlsxSheet = { name: string; rows: string[][] };

const BAD_FILE = "That file could not be read as an Excel workbook. Save it again as .xlsx, or as CSV.";

type Entry = { method: number; size: number; offset: number };

/** The files inside the zip, by name, from its central directory. */
function listZip(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-directory record sits in the last 64 KB (after a comment, at most).
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error(BAD_FILE);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map<string, Entry>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error(BAD_FILE);
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { method, size, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One file's contents as text: stored as is, or deflated (the usual). */
async function readEntry(bytes: Uint8Array, entry: Entry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error(BAD_FILE);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.slice(start, start + entry.size);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error(BAD_FILE);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/** Elements by local name, whatever namespace prefix the file uses. */
const tags = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS("*", name));

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(BAD_FILE);
  return doc;
}

/** "B" -> 1, "AA" -> 26: the column of a cell reference like "AA12". */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** All the text of a string item, joining rich-text runs. */
const textOf = (node: Element) =>
  tags(node, "t")
    .map((t) => t.textContent ?? "")
    .join("");

/** A path in a relationship file, made relative to the zip's root. */
function resolve(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `xl/${target}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

export async function readXlsx(file: File): Promise<XlsxSheet[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = listZip(bytes);
  const read = async (name: string) => {
    const entry = files.get(name);
    return entry ? readEntry(bytes, entry) : null;
  };

  const workbook = await read("xl/workbook.xml");
  if (!workbook) throw new Error(BAD_FILE);
  const rels = await read("xl/_rels/workbook.xml.rels");
  const targets = new Map<string, string>();
  if (rels) {
    for (const r of tags(xml(rels), "Relationship")) {
      targets.set(r.getAttribute("Id") ?? "", resolve(r.getAttribute("Target") ?? ""));
    }
  }

  const sharedText = await read("xl/sharedStrings.xml");
  const shared = sharedText ? tags(xml(sharedText), "si").map(textOf) : [];

  const sheets: XlsxSheet[] = [];
  const sheetNodes = tags(xml(workbook), "sheet");
  for (let i = 0; i < sheetNodes.length; i++) {
    const node = sheetNodes[i];
    // r:id, in whichever namespace prefix the file chose.
    const relId =
      Array.from(node.attributes).find((a) => a.localName === "id" && a.name !== "sheetId")?.value ?? "";
    const path = targets.get(relId) ?? `xl/worksheets/sheet${i + 1}.xml`;
    const text = await read(path);
    if (!text) continue;
    // Only rows with something in them: a formatted but empty row a million
    // rows down must not become a million empty rows.
    const rows: string[][] = [];
    for (const row of tags(xml(text), "row")) {
      const cells: string[] = [];
      for (const c of tags(row, "c")) {
        const ref = c.getAttribute("r");
        const col = ref ? columnIndex(ref) : cells.length;
        const type = c.getAttribute("t");
        const v = tags(c, "v")[0]?.textContent ?? "";
        let value: string;
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = tags(c, "is")[0] ? textOf(tags(c, "is")[0]) : "";
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else value = v;
        cells[col] = value.trim();
      }
      const filled = Array.from(cells, (cell) => cell ?? "");
      if (filled.some(Boolean)) rows.push(filled);
    }
    sheets.push({ name: node.getAttribute("name") ?? `Sheet ${i + 1}`, rows });
  }
  if (!sheets.length) throw new Error(BAD_FILE);
  return sheets;
}
