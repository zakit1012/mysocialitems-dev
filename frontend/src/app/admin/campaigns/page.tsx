"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Gauge, Plus, Send, TriangleAlert, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader } from "@/components/Loader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminTable } from "../_components/AdminTable";
import { EmailPreview, StatusBadge, type EmailFields } from "./_ui";
import {
  duration,
  fmt,
  openRate,
  when,
  type AudienceOptions,
  type CampaignSummary,
  type Template,
  type TemplateSummary,
} from "./_lib";

type List = { campaigns: CampaignSummary[]; perMinute: number; mailReady: boolean };

export default function CampaignsPage() {
  return (
    <Suspense fallback={<Loader label="Loading campaigns" />}>
      <Campaigns />
    </Suspense>
  );
}

function Campaigns() {
  const { token } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [composing, setComposing] = useState(Boolean(params.get("new")));

  const sending = data?.campaigns.some((c) => c.status === "SENDING") ?? false;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () =>
      api<List>("/admin/mailing/campaigns", { token })
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError("");
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Could not load campaigns");
        });
    void load();
    // While something is sending, keep the progress moving.
    const timer = sending ? setInterval(load, 4000) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [token, reload, sending]);

  if (!data) return error ? <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p> : <Loader label="Loading campaigns" />;

  return (
    <div className="space-y-5">
      {!data.mailReady && (
        <p className="flex items-start gap-2 rounded-xl border border-amber/40 bg-amber-wash px-4 py-3 text-[13px] text-amber-dark">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Email is not set up on the server, so nothing can be sent yet. See{" "}
            <Link href="/admin/emails" className="font-semibold underline">
              Emails
            </Link>
            .
          </span>
        </p>
      )}

      {composing ? (
        <NewCampaign
          token={token}
          perMinute={data.perMinute}
          mailReady={data.mailReady}
          initialTemplate={params.get("new") ?? ""}
          onClose={() => setComposing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-[13px] text-muted">
            Send a template to your users by plan, and to your own categories. It goes out in the background, a few at a
            time; you can watch it and stop it.
          </p>
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white shadow-glow"
          >
            <Plus className="h-4 w-4" /> New campaign
          </button>
        </div>
      )}

      {error && <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}

      <AdminTable head={["Campaign", "Status", "Recipients", "Sent", "Opened", "Not sent", "Started"]} empty={!data.campaigns.length}>
        {data.campaigns.map((c) => (
          <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-sand/50">
            <td className="px-4 py-3">
              <Link href={`/admin/campaigns/${c.id}`} className="font-semibold hover:text-brand">
                {c.name}
              </Link>
              <p className="max-w-[22rem] truncate text-[12px] text-muted">{c.subject}</p>
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={c.status} counts={c.counts} />
              {c.lastError && c.status === "SENDING" && <p className="mt-1 text-[11px] text-amber-dark">Waiting on the mail server</p>}
            </td>
            <td className="px-4 py-3 tabular-nums">{fmt(c.counts.total)}</td>
            <td className="px-4 py-3 tabular-nums">{fmt(c.counts.sent)}</td>
            <td className="px-4 py-3 tabular-nums">
              {fmt(c.counts.opened)} <span className="text-muted">· {openRate(c.counts)}</span>
            </td>
            <td className="px-4 py-3 tabular-nums">{fmt(c.counts.failed + c.counts.skipped)}</td>
            <td className="px-4 py-3 text-muted">{when(c.createdAt)}</td>
          </tr>
        ))}
      </AdminTable>

      <Speed token={token} perMinute={data.perMinute} onSaved={() => setReload((n) => n + 1)} />
    </div>
  );
}

function Speed({ token, perMinute, onSaved }: { token: string | null; perMinute: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(perMinute));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <p className="flex items-center gap-1.5 font-semibold">
        <Gauge className="h-4 w-4 text-brand" /> Sending speed
      </p>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">
        Emails a minute, for every campaign. Mail servers limit how many they take: Gmail about 500 a day, most hosting
        mail 100 to 500 an hour. Too fast and emails get refused or land in spam. If the server says &quot;not now&quot;,
        sending waits a minute and carries on.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setNote(null);
          api("/admin/mailing/speed", { method: "PUT", token, body: JSON.stringify({ perMinute: Number(value) }) })
            .then(() => {
              setNote({ ok: true, text: "Saved." });
              onSaved();
            })
            .catch((err) => setNote({ ok: false, text: err instanceof Error ? err.message : "Could not save" }));
        }}
      >
        <input
          type="number"
          min={1}
          max={600}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Emails a minute"
          className="w-24 rounded-xl border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
        />
        <span className="text-[13px] text-muted">a minute ({fmt(Number(value) * 60 || 0)} an hour)</span>
        <button type="submit" className="rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] font-semibold hover:bg-sand">
          Save
        </button>
        {note && <span className={`text-[13px] ${note.ok ? "text-emerald-dark" : "text-coral"}`}>{note.text}</span>}
      </form>
    </section>
  );
}

function NewCampaign({
  token,
  perMinute,
  mailReady,
  initialTemplate,
  onClose,
}: {
  token: string | null;
  perMinute: number;
  mailReady: boolean;
  initialTemplate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [options, setOptions] = useState<AudienceOptions | null>(null);
  const [templateId, setTemplateId] = useState(initialTemplate);
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [segments, setSegments] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<TemplateSummary[]>("/admin/mailing/templates", { token }),
      api<AudienceOptions>("/admin/mailing/audience", { token }),
    ])
      .then(([t, o]) => {
        setTemplates(t);
        setOptions(o);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [token]);

  useEffect(() => {
    if (!token || !templateId) return;
    let cancelled = false;
    api<Template>(`/admin/mailing/templates/${templateId}`, { token })
      .then((t) => {
        if (!cancelled) setTemplate(t);
      })
      .catch(() => {
        if (!cancelled) setTemplate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, templateId]);

  // How many it reaches, counted a moment after the ticking stops.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (!segments.length && !categoryIds.length) {
        setCount(0);
        return;
      }
      api<{ count: number }>("/admin/mailing/audience/count", {
        method: "POST",
        token,
        body: JSON.stringify({ audience: { segments, categoryIds } }),
      })
        .then((r) => {
          if (!cancelled) setCount(r.count);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, segments, categoryIds]);

  const email = useMemo<EmailFields | null>(
    () =>
      template && template.id === templateId
        ? { subject: template.subject, preheader: template.preheader, heading: template.heading, content: template.content }
        : null,
    [template, templateId],
  );

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function sendTest() {
    if (!email) return;
    setError("");
    setNotice("");
    try {
      await api("/admin/mailing/test", { method: "POST", token, body: JSON.stringify({ ...email, to: user?.email }) });
      setNotice(`Test sent to ${user?.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the test");
    }
  }

  async function send() {
    setConfirming(false);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/admin/mailing/campaigns", {
        method: "POST",
        token,
        body: JSON.stringify({ name, templateId, audience: { segments, categoryIds } }),
      });
      router.push(`/admin/campaigns/${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the campaign");
      setBusy(false);
    }
  }

  if (!templates || !options) return error ? <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p> : <Loader label="Loading" />;

  const chip = (on: boolean) =>
    `flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-[13px] transition ${
      on ? "border-brand bg-brand-wash" : "border-line hover:border-brand/40"
    }`;
  const ready = mailReady && Boolean(email) && (count ?? 0) > 0 && !busy;

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">New campaign</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-sand hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-[13px] text-muted">
          First write the email:{" "}
          <Link href="/admin/campaigns/templates/new" className="font-semibold text-brand">
            make a template
          </Link>
          .
        </p>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[13px] font-semibold">1. The email</span>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
                >
                  <option value="">Choose a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[13px] font-semibold">Campaign name</span>
                <span className="ml-1 text-xs text-muted">optional</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder={template?.name ?? "Same as the template"}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
                />
              </label>
            </div>

            <div>
              <p className="text-[13px] font-semibold">2. Who gets it</p>
              <p className="text-xs text-muted">Tick any mix; each person gets it once.</p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted">Users</p>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {options.segments.map((s) => (
                  <button key={s.key} type="button" aria-pressed={segments.includes(s.key)} onClick={() => toggle(segments, setSegments, s.key)} className={chip(segments.includes(s.key))}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" readOnly tabIndex={-1} checked={segments.includes(s.key)} className="pointer-events-none" />
                      {s.label}
                    </span>
                    <span className="tabular-nums text-muted">{fmt(s.count)}</span>
                  </button>
                ))}
              </div>
              {options.categories.length > 0 && (
                <>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">Your categories</p>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {options.categories.map((c) => (
                      <button key={c.id} type="button" aria-pressed={categoryIds.includes(c.id)} onClick={() => toggle(categoryIds, setCategoryIds, c.id)} className={chip(categoryIds.includes(c.id))}>
                        <span className="flex items-center gap-2">
                          <input type="checkbox" readOnly tabIndex={-1} checked={categoryIds.includes(c.id)} className="pointer-events-none" />
                          {c.name}
                        </span>
                        <span className="tabular-nums text-muted">{fmt(c.count)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {options.unsubscribed > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {fmt(options.unsubscribed)} who unsubscribed or bounced are always left out.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-line bg-sand/50 p-4">
              <p className="text-[13px] font-semibold">3. Send</p>
              <p className="mt-1 text-[13px]">
                {count === null ? (
                  "Counting..."
                ) : (
                  <>
                    <b>{fmt(count)}</b> {count === 1 ? "person" : "people"}
                    {count > 0 && <span className="text-muted"> · {duration(count, perMinute)} at {perMinute} a minute</span>}
                  </>
                )}
              </p>
              {error && <p className="mt-2 rounded-lg bg-coral/10 px-3 py-2 text-[13px] text-coral">{error}</p>}
              {notice && <p className="mt-2 rounded-lg bg-emerald-wash px-3 py-2 text-[13px] text-emerald-dark">{notice}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!email || !mailReady}
                  onClick={() => void sendTest()}
                  className="rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] font-semibold hover:bg-sand disabled:opacity-50"
                >
                  Send a test to me
                </button>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white shadow-glow disabled:opacity-50 disabled:shadow-none"
                >
                  <Send className="h-4 w-4" /> {busy ? "Starting..." : `Send to ${fmt(count ?? 0)}`}
                </button>
              </div>
            </div>
          </div>

          <div>
            {email ? (
              <EmailPreview email={email} token={token} />
            ) : (
              <div className="grid h-full min-h-60 place-items-center rounded-2xl border border-dashed border-line text-[13px] text-muted">
                Choose a template to see the email.
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        icon={<Send className="h-5 w-5" />}
        title={`Send to ${fmt(count ?? 0)} ${count === 1 ? "person" : "people"}?`}
        message={
          <>
            <b className="text-ink">{template?.subject}</b> goes out in the background at {perMinute} a minute (
            {duration(count ?? 0, perMinute)}). You can watch it and stop it any time; what has gone out cannot be taken
            back.
          </>
        }
        confirmLabel="Send now"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void send()}
      />
    </section>
  );
}
