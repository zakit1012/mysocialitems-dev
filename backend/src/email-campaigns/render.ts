import {
  BRAND,
  BRAND_FROM,
  FONT,
  INK,
  MUTED,
  TEXT,
  WASH,
  escapeHtml,
} from '../mail/brand';

/**
 * A campaign's content, written with a little formatting, as email HTML and
 * as plain text. What the admin can write:
 *
 *   # Big heading / ## Smaller heading
 *   **bold** and *italic*, [a link](https://...), and bare https:// links
 *   - bullet lists / 1. numbered lists
 *   > a highlighted box (a new feature, an alert)
 *   [button: Try it now](https://...)      on its own line
 *   ![description](https://.../image.png)  on its own line
 *   ---                                     a dividing line
 *   {{name}}, {{first_name}}, {{email}}     the recipient's own
 *
 * Everything else is plain text, escaped: nothing typed here can add its own
 * HTML, and links only go to http(s) or mailto.
 */

export type Recipient = { email: string; name: string | null };

/** {{name}}, {{first_name}} and {{email}}; "there" when the name is unknown. */
export function fillVariables(text: string, to: Recipient): string {
  const name = to.name?.trim() ?? '';
  // "Diaz, Maria" is written last name first.
  const given = name.includes(',') ? name.slice(name.indexOf(',') + 1) : name;
  const first =
    given
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[.,;:]+$/, '') ?? '';
  return text.replace(
    /\{\{\s*(name|first_name|email)\s*\}\}/gi,
    (_, key: string) => {
      const k = key.toLowerCase();
      if (k === 'email') return to.email;
      if (k === 'first_name') return first || 'there';
      return name || 'there';
    },
  );
}

/** Only web and mail links; anything else (javascript:, data:) is dropped. */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (/^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

// A URL may hold one level of brackets, like Wikipedia's ..._(planet).
const URL_PART = String.raw`((?:[^()\s]|\([^()\s]*\))+)`;
const LINK = new RegExp(String.raw`\[([^\]\n]+)\]\(${URL_PART}\)`, 'g');
const BUTTON = new RegExp(
  String.raw`^\[button:\s*([^\]]+?)\s*\]\(${URL_PART}\)$`,
  'i',
);
const IMAGE = new RegExp(String.raw`^!\[([^\]]*)\]\(${URL_PART}\)$`);
const BARE_URL = /https?:\/\/[^\s<>"]+/g;
const P = `margin:0 0 14px;font:15px/1.65 ${FONT};color:${TEXT}`;
const A = `color:${BRAND};text-decoration:underline`;

function anchor(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="${A}">${label}</a>`;
}

/** **bold** and *italic*, on text that is already escaped. */
function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, '<em>$1</em>');
}

/** Bare web addresses become links; the rest gets bold and italic. */
function formatText(raw: string): string {
  let out = '';
  let last = 0;
  for (const match of raw.matchAll(BARE_URL)) {
    // A sentence's closing punctuation is not part of the address.
    const url = match[0].replace(/[.,;:!?)\]]+$/, '');
    const start = match.index;
    out += emphasis(escapeHtml(raw.slice(last, start)));
    const safe = safeUrl(url);
    out += safe ? anchor(safe, escapeHtml(url)) : escapeHtml(url);
    last = start + url.length;
  }
  return out + emphasis(escapeHtml(raw.slice(last)));
}

/** One line of text as HTML: [links](...), then bare links and emphasis. */
export function inlineHtml(raw: string): string {
  let out = '';
  let last = 0;
  for (const match of raw.matchAll(LINK)) {
    out += formatText(raw.slice(last, match.index));
    const label = emphasis(escapeHtml(match[1]));
    const url = safeUrl(match[2]);
    out += url ? anchor(url, label) : label;
    last = match.index + match[0].length;
  }
  return out + formatText(raw.slice(last));
}

/** The same line as plain text: "label (https://...)", no stars. */
function inlineText(raw: string): string {
  return raw
    .replace(LINK, (_, label: string, url: string) =>
      safeUrl(url) ? `${label} (${url})` : label,
    )
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1')
    .replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, '$1');
}

function button(label: string, url: string) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr>` +
    `<td style="border-radius:12px;background:${BRAND};background-image:linear-gradient(135deg,${BRAND_FROM},${BRAND})">` +
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;font:700 15px/1 ${FONT};` +
    `color:#FFFFFF;text-decoration:none;border-radius:12px">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

const HEADING_STYLE: Record<number, string> = {
  1: `margin:24px 0 10px;font:800 21px/1.3 ${FONT};color:${INK};letter-spacing:-0.2px`,
  2: `margin:22px 0 8px;font:700 17px/1.35 ${FONT};color:${INK}`,
  3: `margin:18px 0 6px;font:700 15px/1.4 ${FONT};color:${INK}`,
};

/**
 * `base` (the site, https://widgetpop.com) completes links written as a
 * path: [Pricing](/pricing) goes to https://widgetpop.com/pricing.
 */
export function renderContent(
  content: string,
  to: Recipient,
  base = '',
): { html: string; text: string } {
  const filled = fillVariables(content, to);
  const absolute = base
    ? filled.replace(
        /\]\((\/(?!\/)[^)\s]*)\)/g,
        (_, path: string) => `](${base.replace(/\/+$/, '')}${path})`,
      )
    : filled;
  const lines = absolute.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const text: string[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p style="${P}">${paragraph.map(inlineHtml).join('<br>')}</p>`);
    text.push(paragraph.map(inlineText).join('\n'));
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    html.push(
      `<${tag} style="margin:0 0 14px;padding:0 0 0 22px;font:15px/1.65 ${FONT};color:${TEXT}">` +
        list.items
          .map((item) => `<li style="margin:0 0 6px">${inlineHtml(item)}</li>`)
          .join('') +
        `</${tag}>`,
    );
    const ordered = list.ordered;
    text.push(
      list.items
        .map((item, i) => `${ordered ? `${i + 1}.` : '-'} ${inlineText(item)}`)
        .join('\n'),
    );
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    html.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr>` +
        `<td style="padding:14px 18px;background:${WASH};border-left:4px solid ${BRAND};border-radius:10px;` +
        `font:15px/1.65 ${FONT};color:${INK}">${quote.map(inlineHtml).join('<br>')}</td></tr></table>`,
    );
    text.push(quote.map((q) => `> ${inlineText(q)}`).join('\n'));
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const t = line.trim();
    let m: RegExpExecArray | null;
    if (!t) {
      flushAll();
    } else if ((m = /^(#{1,3})\s+(.+)$/.exec(t))) {
      flushAll();
      const level = m[1].length;
      html.push(
        `<h${level + 1} style="${HEADING_STYLE[level]}">${inlineHtml(m[2])}</h${level + 1}>`,
      );
      text.push(inlineText(m[2]));
    } else if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) {
      flushAll();
      html.push(
        `<hr style="border:0;border-top:1px solid #E9EBF0;margin:22px 0">`,
      );
      text.push('---');
    } else if ((m = BUTTON.exec(t))) {
      flushAll();
      const url = safeUrl(m[2]);
      if (url) {
        html.push(button(m[1], url));
        text.push(`${m[1]}: ${url}`);
      } else {
        html.push(`<p style="${P}">${escapeHtml(m[1])}</p>`);
        text.push(m[1]);
      }
    } else if ((m = IMAGE.exec(t))) {
      flushAll();
      const url = safeUrl(m[2]);
      if (url && !url.startsWith('mailto:')) {
        html.push(
          `<img src="${escapeHtml(url)}" alt="${escapeHtml(m[1])}" width="496" ` +
            `style="display:block;width:100%;max-width:496px;height:auto;margin:6px 0 18px;border:0;border-radius:12px">`,
        );
        if (m[1]) text.push(`[${m[1]}]`);
      }
    } else if ((m = /^[-*•]\s+(.+)$/.exec(t))) {
      flushParagraph();
      flushQuote();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = /^\d+[.)]\s+(.+)$/.exec(t))) {
      flushParagraph();
      flushQuote();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = /^>\s?(.*)$/.exec(t))) {
      flushParagraph();
      flushList();
      quote.push(m[1]);
    } else {
      flushList();
      flushQuote();
      paragraph.push(t);
    }
  }
  flushAll();
  return { html: html.join(''), text: text.join('\n\n') };
}

/** The muted line under a test email's heading, so it is not mistaken for the real one. */
export function testBanner(to: string) {
  return (
    `<p style="margin:0 0 18px;padding:8px 12px;border-radius:8px;background:#FEF3C7;` +
    `font:12px/1.5 ${FONT};color:#92400E">Test email for ${escapeHtml(to)}. ` +
    `<span style="color:${MUTED}">Opens are not counted; the unsubscribe link does nothing.</span></p>`
  );
}
