/** What the email campaign pages get from the API (admin/mailing/...). */

export type Category = { id: string; name: string; count: number };

export type Contact = {
  id: string;
  email: string;
  name: string | null;
  /** USER (an account), MANUAL or IMPORT */
  source: string;
  userId: string | null;
  /** The account's plan now; null for contacts without an account. */
  plan: string | null;
  categories: { id: string; name: string }[];
  /** UNSUBSCRIBED, BOUNCED or ADMIN when no campaign goes to them. */
  suppressed: string | null;
  createdAt: string;
};

export type TemplateSummary = { id: string; name: string; subject: string; updatedAt: string };

export type Template = TemplateSummary & {
  preheader: string;
  heading: string;
  content: string;
};

export type Counts = {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  bounced: number;
  skipped: number;
  opened: number;
};

export type CampaignSummary = {
  id: string;
  name: string;
  subject: string;
  /** SENDING, SENT or STOPPED */
  status: string;
  sentBy: string | null;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
  counts: Counts;
};

export type Delivery = {
  id: string;
  email: string;
  name: string | null;
  /** QUEUED, SENDING, SENT, FAILED, BOUNCED or SKIPPED */
  status: string;
  error: string | null;
  sentAt: string | null;
  openedAt: string | null;
  opens: number;
};

export type AudienceOptions = {
  segments: { key: string; label: string; count: number }[];
  categories: { id: string; name: string; count: number }[];
  unsubscribed: number;
};

export const fmt = (n: number) => n.toLocaleString();

/** Opened out of the emails that went out, as a whole percent. */
export const openRate = (c: Counts) => (c.sent ? `${Math.round((c.opened / c.sent) * 100)}%` : "-");

export const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "-";

export const SUPPRESSED: Record<string, string> = {
  UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Bounced",
  ADMIN: "Taken off",
};

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
export const isEmail = (s: string) => EMAIL.test(s.trim());

/**
 * Addresses pasted as text, one person per line: "sam@x.com", "Sam Lee
 * <sam@x.com>", "sam@x.com, Sam Lee" or a row copied from a spreadsheet.
 * Several addresses on one line are all taken, without a name.
 */
export function parsePasted(text: string): { email: string; name: string | null }[] {
  const out: { email: string; name: string | null }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const found = line.match(/[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+/g);
    if (!found) continue;
    if (found.length > 1) {
      found.forEach((email) => out.push({ email, name: null }));
      continue;
    }
    const email = found[0];
    const name = line
      .replace(email, "")
      .replace(/[<>"'\t,;|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ email, name: name || null });
  }
  return out;
}

/**
 * A CSV file as rows of cells: commas or semicolons (Excel in many
 * countries), quoted cells with commas, quotes ("") and line breaks inside.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** How long a number of emails takes at the chosen speed, in words. */
export function duration(emails: number, perMinute: number) {
  const minutes = Math.ceil(emails / Math.max(1, perMinute));
  if (minutes <= 1) return "about a minute";
  if (minutes < 60) return `about ${minutes} minutes`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}
