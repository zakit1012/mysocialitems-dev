"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, CircleHelp, RefreshCw, Send, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { Loader } from "@/components/Loader";
import { AdminCard, AdminTable } from "../_components/AdminTable";

type Smtp = {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  from: string;
  ok: boolean | null;
  at: string | null;
  error: string | null;
  hint: string | null;
  /** Why it may not be set up: setting names and the file read, never values. */
  setup?: { envFile: string; passwordCut: boolean; fromInvalid?: boolean };
};

/** Reading the sending mailbox for "could not deliver" reports. */
type Bounces = {
  enabled: boolean;
  host: string;
  user: string;
  ok: boolean | null;
  at: string | null;
  error: string | null;
  found: number;
};

type EmailRow = {
  id: string;
  to: string;
  subject: string;
  kind: string;
  status: "SENT" | "FAILED" | "SKIPPED" | "BOUNCED";
  error: string | null;
  /** The usual fix for this row's problem. */
  hint?: string | null;
  /** What the email said, codes masked. Null for emails logged before it was kept. */
  preview: string | null;
  createdAt: string;
};

const KIND: Record<string, string> = {
  login: "Login code",
  signup: "Sign-up code",
  email: "Email change code",
  notice: "Notice",
  test: "Test",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

/**
 * Is email working, and what happened to each one: the mail server's own
 * error for every failure, the usual fix under it, and a test send.
 */
export default function AdminEmailsPage() {
  const { token, user } = useAuth();
  const [smtp, setSmtp] = useState<Smtp | null>(null);
  const [emails, setEmails] = useState<EmailRow[] | null>(null);
  const [bounces, setBounces] = useState<Bounces | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const [checking, setChecking] = useState(false);
  // The row whose email is open.
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ smtp: Smtp; emails: EmailRow[]; bounces?: Bounces }>("/admin/email", { token })
      .then((r) => {
        if (cancelled) return;
        setError("");
        setSmtp(r.smtp);
        setEmails(r.emails);
        setBounces(r.bounces ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the email log");
      });
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  async function checkAgain() {
    setChecking(true);
    setError("");
    try {
      setSmtp(await api<Smtp>("/admin/email/check", { method: "POST", token }));
      // The check also reads the inbox for bounces: show what it found.
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the mail server");
    } finally {
      setChecking(false);
    }
  }

  const shown = (emails ?? []).filter((e) => !failedOnly || e.status !== "SENT" || e.error);
  const failures = (emails ?? []).filter((e) => e.status === "FAILED" || e.status === "BOUNCED").length;

  // One loader for the whole page: status and log come in one answer.
  if (!smtp || !emails) {
    return error ? (
      <div className="rounded-2xl border border-coral/25 bg-coral/5 p-5">
        <p className="font-bold text-coral">The email page could not load</p>
        <p className="mt-1 break-words font-mono text-[12.5px] text-ink">{error}</p>
        <p className="mt-2 text-[13px] text-ink-soft">
          If the backend was just updated, run <code className="font-mono">npx prisma db push</code> and restart it.
        </p>
        <button
          type="button"
          onClick={() => setReload((n) => n + 1)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] font-semibold hover:text-brand"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    ) : (
      <Loader label="Loading emails" />
    );
  }

  const state = !smtp.configured ? "unset" : smtp.ok === true ? "ok" : smtp.ok === false ? "bad" : "unknown";

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}

      <AdminCard>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {state === "ok" ? (
                <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald" />
              ) : state === "unknown" ? (
                <CircleHelp className="h-8 w-8 shrink-0 text-hint" />
              ) : (
                <XCircle className="h-8 w-8 shrink-0 text-coral" />
              )}
              <div>
                <p className="text-lg font-black tracking-tight">
                  {state === "unset"
                    ? "SMTP is not set up"
                    : state === "ok"
                      ? "Email is working"
                      : state === "bad"
                        ? "Email is not working"
                        : "Not checked yet"}
                </p>
                <p className="text-[12.5px] text-muted">
                  {state === "unset" ? "No email is being sent." : `Last checked ${when(smtp.at)}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void checkAgain()}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] font-semibold transition hover:border-brand/40 hover:text-brand disabled:opacity-60"
            >
              {checking ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Check again
            </button>
          </div>

          {state === "unset" ? (
            <div className="mt-4 rounded-xl border border-amber/30 bg-amber-wash p-4 text-[13px] leading-relaxed text-ink-soft">
              {smtp.hint && (
                <p className="mb-3 break-words">
                  <b className="text-ink">What is wrong:</b> {smtp.hint}
                </p>
              )}
              Put exactly these lines in{" "}
              <code className="break-all font-mono">{smtp.setup?.envFile ?? "backend/.env"}</code> (the password in
              quotes), then restart the backend:
              <pre className="mt-2 overflow-x-auto rounded-lg bg-card p-3 font-mono text-[12px] text-ink">{`SMTP_HOST=mail.widgetpop.com
SMTP_PORT=587
SMTP_USER=support@widgetpop.com
SMTP_PASS="your mailbox password"
SMTP_FROM="WidgetPop <support@widgetpop.com>"`}</pre>
            </div>
          ) : (
            state === "bad" && (
              <div className="mt-4 rounded-xl border border-coral/25 bg-coral/5 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-coral">What the mail server said</p>
                <p className="mt-1 break-words font-mono text-[12.5px] text-ink">{smtp.error}</p>
                {smtp.hint && (
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
                    <b className="text-ink">Likely fix:</b> {smtp.hint}
                  </p>
                )}
              </div>
            )
          )}

          {smtp.setup?.fromInvalid && (
            <p className="mt-4 rounded-xl border border-amber/30 bg-amber-wash p-3 text-[13px] text-ink-soft">
              <b className="text-ink">Check SMTP_FROM:</b> it is not a valid sender (often a missing closing quote), so
              emails go out as {smtp.from}. Write it as SMTP_FROM=&quot;WidgetPop &lt;support@widgetpop.com&gt;&quot; or
              leave it out.
            </p>
          )}

          {smtp.configured && smtp.setup?.passwordCut && (
            <p className="mt-4 rounded-xl border border-amber/30 bg-amber-wash p-3 text-[13px] text-ink-soft">
              <b className="text-ink">Check SMTP_PASS:</b> it has a # without quotes, so only the part before the # is
              read. Put the password in double quotes: SMTP_PASS=&quot;your#password&quot;.
            </p>
          )}

          {smtp.configured && (
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
              <Detail label="Server" value={`${smtp.host}:${smtp.port}`} />
              <Detail label="Security" value={smtp.port === 465 ? "SSL" : smtp.port === 587 ? "STARTTLS" : "-"} />
              <Detail label="Login" value={smtp.user || "-"} />
              <Detail label="Sent from" value={smtp.from} />
            </dl>
          )}

          {bounces && smtp.configured && (
            <div
              className={`mt-4 rounded-xl border p-3 text-[13px] leading-relaxed ${
                bounces.ok === false ? "border-coral/25 bg-coral/5" : "border-line bg-sand/50"
              }`}
            >
              <b className="text-ink">Refusals by Gmail and others:</b>{" "}
              {!bounces.enabled ? (
                <span className="text-ink-soft">not checked (IMAP_BOUNCES is off).</span>
              ) : bounces.ok === false ? (
                <span className="text-ink-soft">
                  could not read the {bounces.user} inbox ({bounces.host}), so refused emails cannot show as Bounced.{" "}
                  <span className="break-words font-mono text-[12px] text-ink">{bounces.error}</span>
                </span>
              ) : (
                <span className="text-ink-soft">
                  read from the {bounces.user} inbox every few minutes
                  {bounces.at ? `, last ${when(bounces.at)}` : ", first look shortly after start"}.
                  {bounces.found > 0 && ` ${bounces.found} refused since the backend started.`}
                </span>
              )}
            </div>
          )}
        </div>
      </AdminCard>

      <TestEmail token={token} defaultTo={user?.email ?? ""} onSent={() => setReload((n) => n + 1)} />

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            The last 200 emails, kept for 30 days. Open one to see what it said. Sent means our mail server took it;
            if Gmail or another server refuses it after that, it turns into Bounced within a few minutes.
            {failures > 0 && <b className="text-coral"> {failures} failed or bounced.</b>}
          </p>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
              Only problems
            </label>
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] font-medium hover:text-brand"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card px-4 py-10 text-center text-[13px] text-muted">
            {emails.length === 0 ? "No emails yet. Send a test above, or ask for a login code." : "No problems. Every email was sent."}
          </div>
        ) : (
          <AdminTable head={["When", "To", "Email", "Result"]}>
            {shown.map((e) => {
              const open = openId === e.id;
              return (
                <Fragment key={e.id}>
                  <tr
                    onClick={() => setOpenId(open ? null : e.id)}
                    className="cursor-pointer border-b border-line/60 align-top last:border-0 hover:bg-sand/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{when(e.createdAt)}</td>
                    <td className="px-4 py-3">{e.to}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        aria-expanded={open}
                        className="flex items-start gap-1.5 text-left"
                      >
                        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
                        <span>
                          <span className="block font-medium">{e.subject}</span>
                          <span className="block text-[12px] text-muted">{KIND[e.kind] ?? e.kind}</span>
                        </span>
                      </button>
                    </td>
                    <td className="max-w-[420px] px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          e.status === "SENT"
                            ? e.error
                              ? "bg-amber-wash text-amber-700"
                              : "bg-emerald-wash text-emerald-dark"
                            : e.status === "FAILED" || e.status === "BOUNCED"
                              ? "bg-coral/10 text-coral"
                              : "bg-sand text-muted"
                        }`}
                      >
                        {e.status === "SENT"
                          ? e.error
                            ? "Delayed"
                            : "Sent"
                          : e.status === "FAILED"
                            ? "Failed"
                            : e.status === "BOUNCED"
                              ? "Bounced"
                              : "Not sent"}
                      </span>
                      {e.error && <p className="mt-1 break-words font-mono text-[12px] text-ink-soft">{e.error}</p>}
                      {e.hint && (
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                          <b className="text-ink">Likely fix:</b> {e.hint}
                        </p>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-line/60 bg-sand/40">
                      <td colSpan={4} className="px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">What the email said</p>
                        {e.preview ? (
                          <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{e.preview}</p>
                        ) : (
                          <p className="mt-1.5 text-[13px] text-muted">Not kept for emails sent before this was added.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </AdminTable>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-all font-medium">{value}</dd>
    </div>
  );
}

/** Sends one email now and shows exactly what the mail server answered. */
function TestEmail({ token, defaultTo, onSent }: { token: string | null; defaultTo: string; onSent: () => void }) {
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error: string | null; hint: string | null } | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      setResult(
        await api<{ ok: boolean; error: string | null; hint: string | null }>("/admin/email/test", {
          method: "POST",
          token,
          body: JSON.stringify({ to }),
        }),
      );
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Could not send", hint: null });
    } finally {
      setBusy(false);
      onSent();
    }
  }

  return (
    <AdminCard>
      <form onSubmit={send} className="p-5">
        <p className="font-bold">Send a test email</p>
        <p className="mt-0.5 text-[12.5px] text-muted">Goes out right now; the mail server&apos;s answer shows here.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            aria-label="Send the test to"
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-[13px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2.5 text-[13px] font-bold text-white transition hover:shadow-glow disabled:opacity-60"
          >
            {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Send test
          </button>
        </div>
        {result &&
          (result.ok ? (
            <p className="mt-3 rounded-xl bg-emerald-wash px-4 py-2.5 text-[13px] text-emerald-dark">
              Sent. Check the inbox (and the spam folder) of {to}.
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-coral/25 bg-coral/5 p-4">
              <p className="break-words font-mono text-[12.5px] text-ink">{result.error}</p>
              {result.hint && (
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                  <b className="text-ink">Likely fix:</b> {result.hint}
                </p>
              )}
            </div>
          ))}
      </form>
    </AdminCard>
  );
}
