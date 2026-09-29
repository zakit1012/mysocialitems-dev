"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";
import { fmt, isEmail, parseCsv, type Category } from "../_lib";
import { CategoryPicker, Modal } from "../_ui";

export type UploadResult = { added: number; existing: number; invalid: number };

/** The API takes 1000 contacts at a time; a big file goes in parts. */
const PART = 1000;

/**
 * Sends contacts in parts. A new category is made with the first part and
 * reused for the rest, so it is not made twice.
 */
export async function uploadContacts(
  token: string | null,
  people: { email: string; name: string | null }[],
  categoryIds: string[],
  newCategory: string,
  source: "MANUAL" | "IMPORT",
  onProgress?: (done: number) => void,
): Promise<UploadResult> {
  const total: UploadResult = { added: 0, existing: 0, invalid: 0 };
  let ids = categoryIds;
  let newName = newCategory.trim();
  for (let i = 0; i < people.length; i += PART) {
    const r = await api<UploadResult & { categoryIds: string[] }>("/admin/mailing/contacts", {
      method: "POST",
      token,
      body: JSON.stringify({ contacts: people.slice(i, i + PART), categoryIds: ids, newCategory: newName, source }),
    });
    total.added += r.added;
    total.existing += r.existing;
    total.invalid += r.invalid;
    ids = r.categoryIds;
    newName = "";
    onProgress?.(Math.min(people.length, i + PART));
  }
  return total;
}

type Sheet = { name: string; rows: string[][] };

const cellText = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();

async function readFile(file: File): Promise<Sheet[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return [{ name: file.name, rows: parseCsv(await file.text()) }];
  }
  if (lower.endsWith(".xlsx")) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    return sheets.map((s) => ({ name: s.sheet, rows: s.data.map((row) => row.map(cellText)) }));
  }
  if (lower.endsWith(".xls")) {
    throw new Error("Old .xls files cannot be read. In Excel, choose File > Save As > Excel Workbook (.xlsx) or CSV.");
  }
  throw new Error("Choose an Excel (.xlsx) or CSV file. From Google Sheets: File > Download > .xlsx or .csv.");
}

/** The column with the most email addresses in it. */
function emailColumn(rows: string[][], width: number) {
  let best = 0;
  let bestCount = -1;
  for (let c = 0; c < width; c++) {
    const n = rows.filter((r) => isEmail(r[c] ?? "")).length;
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/** "name" = one column, "fl" = first name + last name columns, "" = none. */
type NameChoice = string;

function guessName(header: string[]): NameChoice {
  const find = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const full = find(/^(full\s*|contact\s*|customer\s*|your\s*)?name$|^naam$|^names?\b/i);
  if (full >= 0) return String(full);
  if (find(/first/i) >= 0) return "fl";
  return "";
}

export function ImportContacts({
  open,
  categories,
  token,
  onClose,
  onDone,
}: {
  open: boolean;
  categories: Category[];
  token: string | null;
  onClose: () => void;
  onDone: (r: UploadResult) => void;
}) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [emailCol, setEmailCol] = useState(0);
  const [nameChoice, setNameChoice] = useState<NameChoice>("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const rows = useMemo(() => sheets?.[sheetIndex]?.rows ?? [], [sheets, sheetIndex]);
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const header = useMemo(() => (hasHeader && rows[0] ? rows[0] : []), [rows, hasHeader]);
  const body = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);
  const columnName = (c: number) => header[c]?.trim() || `Column ${String.fromCharCode(65 + (c % 26))}${c >= 26 ? Math.floor(c / 26) : ""}`;
  const firstCol = header.findIndex((h) => /first/i.test(h));
  const lastCol = header.findIndex((h) => /last|surname|family/i.test(h));

  function pick(sheetList: Sheet[], index: number) {
    const r = sheetList[index]?.rows ?? [];
    // A first row without an address is a header row.
    const header = r.length > 1 && !r[0].some((cell) => isEmail(cell));
    const w = r.reduce((m, row) => Math.max(m, row.length), 0);
    setSheetIndex(index);
    setHasHeader(header);
    setEmailCol(emailColumn(header ? r.slice(1) : r, w));
    setNameChoice(header ? guessName(r[0]) : "");
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    setSheets(null);
    setFileName(file.name);
    try {
      const read = await readFile(file);
      const withRows = read.filter((s) => s.rows.length);
      if (!withRows.length) throw new Error("That file is empty.");
      setSheets(withRows);
      pick(withRows, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    }
  }

  const people = useMemo(() => {
    const seen = new Set<string>();
    const out: { email: string; name: string | null }[] = [];
    let invalid = 0;
    let repeated = 0;
    for (const r of body) {
      const email = (r[emailCol] ?? "").trim().toLowerCase();
      if (!email && r.every((c) => !c)) continue;
      if (!isEmail(email)) {
        invalid++;
        continue;
      }
      if (seen.has(email)) {
        repeated++;
        continue;
      }
      seen.add(email);
      let name = "";
      if (nameChoice === "fl") {
        name = [firstCol >= 0 ? r[firstCol] : "", lastCol >= 0 ? r[lastCol] : ""].filter(Boolean).join(" ");
      } else if (nameChoice !== "") {
        name = r[Number(nameChoice)] ?? "";
      }
      out.push({ email, name: name.trim() || null });
    }
    return { list: out, invalid, repeated };
  }, [body, emailCol, nameChoice, firstCol, lastCol]);

  function reset() {
    setSheets(null);
    setFileName("");
    setError("");
    setDone(0);
    setCategoryIds([]);
    setNewCategory("");
  }

  async function start() {
    setBusy(true);
    setError("");
    setDone(0);
    let sent = 0;
    try {
      const r = await uploadContacts(token, people.list, categoryIds, newCategory, "IMPORT", (n) => {
        sent = n;
        setDone(n);
      });
      reset();
      onDone(r);
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : "The import stopped"}.${sent ? ` The first ${fmt(sent)} were added; importing the file again skips them.` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const select = "rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] outline-none focus:border-brand";

  return (
    <Modal
      open={open}
      wide
      title="Import contacts"
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
    >
      {!sheets ? (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-sand/50 px-6 py-10 text-center hover:border-brand">
          <FileSpreadsheet className="h-9 w-9 text-brand" />
          <span className="mt-3 font-semibold">{fileName || "Choose an Excel or CSV file"}</span>
          <span className="mt-1 text-xs text-muted">
            .xlsx or .csv, with a column of email addresses (and names, if you have them). Google Sheets: File &gt;
            Download.
          </span>
          <input
            type="file"
            accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 text-[13px]">
            <p className="mr-auto font-semibold">
              {fileName}
              <button type="button" onClick={reset} className="ml-2 text-xs font-medium text-brand hover:underline">
                Choose another
              </button>
            </p>
            {sheets.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Sheet</span>
                <select value={sheetIndex} onChange={(e) => pick(sheets, Number(e.target.value))} className={select}>
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Email column</span>
              <select value={emailCol} onChange={(e) => setEmailCol(Number(e.target.value))} className={select}>
                {Array.from({ length: width }, (_, c) => (
                  <option key={c} value={c}>
                    {columnName(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Name column</span>
              <select value={nameChoice} onChange={(e) => setNameChoice(e.target.value)} className={select}>
                <option value="">No names</option>
                {firstCol >= 0 && <option value="fl">{lastCol >= 0 ? "First + last name" : columnName(firstCol)}</option>}
                {Array.from({ length: width }, (_, c) => (
                  <option key={c} value={String(c)}>
                    {columnName(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 pb-1.5">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              First row is headings
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-sand/60 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Name</th>
                </tr>
              </thead>
              <tbody>
                {people.list.slice(0, 6).map((p) => (
                  <tr key={p.email} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-1.5">{p.email}</td>
                    <td className="px-3 py-1.5 text-muted">{p.name ?? "-"}</td>
                  </tr>
                ))}
                {!people.list.length && (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-center text-muted">
                      No email addresses in that column. Pick the column that has them.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[13px]">
            <b>{fmt(people.list.length)}</b> to import
            {people.list.length > 6 && <span className="text-muted"> (first 6 shown)</span>}
            {people.invalid > 0 && <span className="text-muted"> · {fmt(people.invalid)} rows without a valid address skipped</span>}
            {people.repeated > 0 && <span className="text-muted"> · {fmt(people.repeated)} repeated</span>}
          </p>

          <CategoryPicker
            categories={categories}
            selected={categoryIds}
            onChange={setCategoryIds}
            newName={newCategory}
            onNewName={setNewCategory}
          />
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-[13px] text-coral">{error}</p>}
      {busy && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-brand-wash">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(done / Math.max(1, people.list.length)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {fmt(done)} of {fmt(people.list.length)}...
          </p>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            reset();
            onClose();
          }}
          className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-sand disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !people.list.length}
          onClick={() => void start()}
          className="rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Importing..." : `Import ${fmt(people.list.length)}`}
        </button>
      </div>
    </Modal>
  );
}
