"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, PlugZap } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SITE } from "@/lib/site";
import { Loader } from "@/components/Loader";

type Mode = "test" | "live";
type Key = { value: string; set: boolean; secret: boolean };
type Settings = {
  mode: Mode;
  keys: Record<string, Key>;
  webhookUrl: string;
  webhookEvents: string[];
  configured: { test: boolean; live: boolean };
};

const FIELDS: [string, string][] = [
  ["API_KEY", "API key"],
  ["WEBHOOK_SECRET", "Webhook secret (whsec_...)"],
];

/** Dodo Payments keys, test/live switch and webhook setup. */
export function DodoTab({ token }: { token: string | null }) {
  const [data, setData] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);

  const fetchSettings = useCallback(() => api<Settings>("/admin/billing/dodo", { token }), [token]);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((s) => !cancelled && setData(s))
      .catch((e) => !cancelled && setMsg({ ok: false, text: e.message }));
    return () => {
      cancelled = true;
    };
  }, [fetchSettings]);

  async function save(extra: Record<string, string> = {}) {
    setBusy("save");
    setMsg(null);
    try {
      // Blank fields mean "keep": the server never sends the saved secrets back.
      const s = await api<Settings>("/admin/billing/dodo", {
        method: "PUT",
        token,
        body: JSON.stringify({ ...form, ...extra }),
      });
      setData(s);
      setForm({});
      setMsg({ ok: true, text: extra.MODE ? `Switched to ${extra.MODE}.` : "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy("");
    }
  }

  async function test(mode: Mode) {
    setBusy(`test:${mode}`);
    setMsg(null);
    try {
      await api("/admin/billing/dodo/test", { method: "POST", token, body: JSON.stringify({ mode }) });
      setMsg({ ok: true, text: `${mode} API key works.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setBusy("");
    }
  }

  if (!data) {
    return (
      msg ? <p className="p-4 text-muted">{msg.text}</p> : <Loader label="Loading payment settings" />
    );
  }

  const input = "w-full rounded-lg border border-line bg-white px-2.5 py-2 font-mono text-[12.5px] outline-none focus:border-brand";

  return (
    <div className="space-y-5 p-4">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-[12.5px] ${msg.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
          {msg.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
        <div>
          <p className="text-[13px] font-bold">Mode</p>
          <p className="text-[12.5px] text-muted">
            Test uses test cards and fake UPI, nothing is charged. Live charges real customers. Checkout uses
            whichever is on - except developer accounts (Admin → Users), which always check out in test mode. So
            on live, keep the test keys, test webhook and test products (Plans tab) set up for them too.
          </p>
        </div>
        <div className="flex rounded-lg border border-line p-0.5">
          {(["test", "live"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={Boolean(busy) || data.mode === m}
              onClick={() => (m === "live" ? setConfirmLive(true) : save({ MODE: m }))}
              className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold capitalize transition ${
                data.mode === m ? (m === "live" ? "bg-coral text-white" : "gradient-brand text-white") : "text-muted hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["TEST", "LIVE"] as const).map((env) => {
          const mode = env.toLowerCase() as Mode;
          return (
            <div key={env} className="rounded-xl border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-bold">
                  {env === "LIVE" ? "Live" : "Test"} keys
                  {data.mode === mode && <span className="ml-2 rounded-full bg-brand-wash px-2 py-0.5 text-[10.5px] text-brand">in use</span>}
                </p>
                <button
                  type="button"
                  onClick={() => test(mode)}
                  disabled={Boolean(busy) || !data.configured[mode]}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[12px] hover:border-brand/40 hover:text-brand disabled:opacity-40"
                >
                  {busy === `test:${mode}` ? <Spinner className="h-3 w-3" /> : <PlugZap className="h-3.5 w-3.5" />} Test
                </button>
              </div>
              <div className="space-y-2.5">
                {FIELDS.map(([f, label]) => {
                  const k = `${env}_${f}`;
                  const meta = data.keys[k];
                  return (
                    <label key={k} className="block">
                      <span className="text-[11.5px] font-semibold text-muted">{label}</span>
                      <input
                        className={input}
                        type="password"
                        autoComplete="off"
                        placeholder={meta?.set ? `saved ${meta.value} - type to replace` : "not set"}
                        value={form[k] ?? ""}
                        onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => save()}
        disabled={Boolean(busy)}
        className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {busy === "save" ? <Spinner /> : <Check className="h-4 w-4" />} Save keys
      </button>

      <div className="rounded-xl border border-line p-4 text-[12.5px]">
        <p className="text-[13px] font-bold">Webhook</p>
        <p className="mt-1 text-muted">
          In the Dodo dashboard, go to Developer → Webhooks, add this URL with the events below, and paste its
          signing secret above. Do it once in test mode and once in live mode.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-sand px-3 py-2 font-mono">{data.webhookUrl}</code>
          <button
            type="button"
            aria-label="Copy the webhook URL"
            onClick={() =>
              navigator.clipboard.writeText(data.webhookUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
            className="rounded-lg border border-line px-2.5 py-2 hover:text-brand"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-muted">{data.webhookEvents.join("  ·  ")}</p>
      </div>

      <div className="rounded-xl border border-line p-4 text-[12.5px] text-muted">
        <p className="text-[13px] font-bold text-ink">Also set in the Dodo dashboard</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>
            <b>Grace period: 5 days</b> (Business settings, subscriptions). A failed renewal keeps the plan for five
            days; after that the account moves to Free limits until it is paid.
          </li>
          <li>Payment retries on, so Dodo tries a failed renewal again before the grace period ends.</li>
          <li>
            Customer emails: Dodo can send its own receipts too. Turn them off if you only want the emails from{" "}
            {SITE.name}.
          </li>
        </ul>
      </div>

      <ConfirmDialog
        open={confirmLive}
        danger
        title="Switch to live?"
        message="Customers will be charged real money from now on. Make sure the live API key, webhook and plans (Plans tab) are set up."
        confirmLabel="Go live"
        cancelLabel="Stay in test"
        onCancel={() => setConfirmLive(false)}
        onConfirm={() => {
          setConfirmLive(false);
          void save({ MODE: "live" });
        }}
      />
    </div>
  );
}
