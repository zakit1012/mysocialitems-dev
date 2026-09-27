"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, CircleHelp, RefreshCw, Send, XCircle } from "lucide-react";
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
};

type EmailRow = {
  id: string;
  to: string;
  subject: string;
  kind: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  error: string | null;
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
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ smtp: Smtp; emails: EmailRow[] }>("/admin/email", { token })
      .then((r) => {
        if (cancelled) return;
        setSmtp(r.smtp);
        setEmails(r.emails);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the mail server");
    } finally {
      setChecking(false);
    }
  }

  const shown = (emails ?? []).filter((e) => !failedOnly || e.status !== "SENT");
  const failures = (emails ?? []).filter((e) => e.status === "FAILED").length;

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}

      {!smtp ? (
        <Loader label="Checking email" />
      ) : (
        <>
          <AdminCard>
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {smtp.ok === true ? (
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald" />
                  ) : smtp.ok === false ? (
                    <XCircle className="h-8 w-8 shrink-0 text-coral" />
                  ) : (
                    <CircleHelp className="h-8 w-8 shrink-0 text-hint" />
                  )}
                  <div>
                    <p className="text-lg font-black tracking-tight">
                      {smtp.ok === true
                        ? "Email is working"
                        : smtp.ok === false
                          ? "Email is not working"
                          : "Not checked yet"}
                    </p>
                    <p className="text-[12.5px] text-muted">Last checked {when(smtp.at)}</p>
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

              {smtp.ok === false && (
                <div className="mt-4 rounded-xl border border-coral/25 bg-coral/5 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-coral">What the mail server said</p>
                  <p className="mt-1 break-words font-mono text-[12.5px] text-ink">{smtp.error}</p>
                  {smtp.hint && (
                    <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
                      <b className="text-ink">Likely fix:</b> {smtp.hint}
                    </p>
                  )}
                </div>
              )}

              <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                <Detail label="Server" value={smtp.configured ? `${smtp.host}:${smtp.port}` : "Not set up"} />
                <Detail label="Security" value={smtp.port === 465 ? "SSL" : smtp.port === 587 ? "STARTTLS" : "-"} />
                <Detail label="Login" value={smtp.user || "-"} />
                <Detail label="Sent from" value={smtp.from} />
              </dl>
            </div>
          </AdminCard>

          <TestEmail token={token} defaultTo={user?.email ?? ""} onSent={() => setReload((n) => n + 1)} />
        </>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            The last 200 emails, kept for 30 days.{failures > 0 && <b className="text-coral"> {failures} failed.</b>}
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
        {!emails ? (
          <Loader label="Loading emails" />
        ) : (
          <AdminTable head={["When", "To", "Email", "Result"]} empty={shown.length === 0}>
            {shown.map((e) => (
              <tr key={e.id} className="border-b border-line/60 align-top last:border-0 hover:bg-sand/50">
                <td className="whitespace-nowrap px-4 py-3 text-muted">{when(e.createdAt)}</td>
                <td className="px-4 py-3">{e.to}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{e.subject}</p>
                  <p className="text-[12px] text-muted">{KIND[e.kind] ?? e.kind}</p>
                </td>
                <td className="max-w-[420px] px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      e.status === "SENT"
                        ? "bg-emerald-wash text-emerald-dark"
                        : e.status === "FAILED"
                          ? "bg-coral/10 text-coral"
                          : "bg-sand text-muted"
                    }`}
                  >
                    {e.status === "SENT" ? "Sent" : e.status === "FAILED" ? "Failed" : "Not sent"}
                  </span>
                  {e.error && <p className="mt-1 break-words font-mono text-[12px] text-ink-soft">{e.error}</p>}
                </td>
              </tr>
            ))}
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
