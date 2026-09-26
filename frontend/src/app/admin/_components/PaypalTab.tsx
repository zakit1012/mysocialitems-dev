"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, PlugZap } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

type Key = { value: string; set: boolean; secret: boolean };
type Settings = {
  mode: "sandbox" | "live";
  keys: Record<string, Key>;
  webhookUrl: string;
  webhookEvents: string[];
  configured: { sandbox: boolean; live: boolean };
};

const FIELDS: [string, string][] = [
  ["CLIENT_ID", "Client ID"],
  ["CLIENT_SECRET", "Client secret"],
  ["WEBHOOK_ID", "Webhook ID"],
  ["PRODUCT_ID", "Product ID (auto-created)"],
];

export function PaypalTab({ token }: { token: string | null }) {
  const [data, setData] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const s = await api<Settings>("/admin/billing/paypal", { token });
    setData(s);
    // Secrets start blank: the server never sends them, and blank means "keep".
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.keys)) next[k] = v.secret ? "" : v.value;
    setForm(next);
  }, [token]);

  useEffect(() => {
    load().catch((e) => setMsg({ ok: false, text: e.message }));
  }, [load]);

  async function save(extra: Record<string, string> = {}) {
    setBusy("save");
    setMsg(null);
    try {
      await api("/admin/billing/paypal", { method: "PUT", token, body: JSON.stringify({ ...form, ...extra }) });
      setMsg({ ok: true, text: extra.MODE ? `Switched to ${extra.MODE}.` : "Saved." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy("");
    }
  }

  async function test(mode: "sandbox" | "live") {
    setBusy(`test:${mode}`);
    setMsg(null);
    try {
      await api("/admin/billing/paypal/test", { method: "POST", token, body: JSON.stringify({ mode }) });
      setMsg({ ok: true, text: `${mode} keys work.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setBusy("");
    }
  }

  if (!data) return <p className="flex items-center gap-2 p-4 text-muted"><Spinner /> Loading...</p>;

  const input = "w-full rounded-lg border border-line bg-white px-2.5 py-2 font-mono text-[12.5px] outline-none focus:border-brand";

  return (
    <div className="space-y-5 p-4">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-[12.5px] ${msg.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
          {msg.text}
        </p>
      )}

      {/* mode switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
        <div>
          <p className="text-[13px] font-bold">Mode</p>
          <p className="text-[12.5px] text-muted">
            Sandbox uses fake money. Live charges real cards. Checkout and webhooks use whichever is on.
          </p>
        </div>
        <div className="flex rounded-lg border border-line p-0.5">
          {(["sandbox", "live"] as const).map((m) => (
            <button key={m} type="button" disabled={Boolean(busy) || data.mode === m}
              onClick={() => {
                if (m === "live" && !confirm("Switch to LIVE? Customers will be charged real money.")) return;
                save({ MODE: m });
              }}
              className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold capitalize transition ${
                data.mode === m ? (m === "live" ? "bg-coral text-white" : "gradient-brand text-white") : "text-muted hover:text-ink"
              }`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* keys */}
      <div className="grid gap-4 lg:grid-cols-2">
        {(["SANDBOX", "LIVE"] as const).map((env) => {
          const mode = env.toLowerCase() as "sandbox" | "live";
          return (
            <div key={env} className="rounded-xl border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-bold">
                  {env === "LIVE" ? "Live" : "Sandbox"} keys
                  {data.mode === mode && <span className="ml-2 rounded-full bg-brand-wash px-2 py-0.5 text-[10.5px] text-brand">in use</span>}
                </p>
                <button type="button" onClick={() => test(mode)} disabled={Boolean(busy) || !data.configured[mode]}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[12px] hover:border-brand/40 hover:text-brand disabled:opacity-40">
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
                        type={meta?.secret ? "password" : "text"}
                        autoComplete="off"
                        placeholder={meta?.secret ? (meta.set ? `saved ${meta.value} - type to replace` : "not set") : ""}
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

      <button type="button" onClick={() => save()} disabled={Boolean(busy)}
        className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
        {busy === "save" ? <Spinner /> : <Check className="h-4 w-4" />} Save keys
      </button>

      {/* webhook */}
      <div className="rounded-xl border border-line p-4 text-[12.5px]">
        <p className="text-[13px] font-bold">Webhook</p>
        <p className="mt-1 text-muted">
          In the PayPal developer dashboard, add a webhook with this URL and these events, then paste its
          ID above. Do it once for sandbox and once for live.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-sand px-3 py-2 font-mono">{data.webhookUrl}</code>
          <button type="button" onClick={() => navigator.clipboard.writeText(data.webhookUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            className="rounded-lg border border-line px-2.5 py-2 hover:text-brand">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="mt-2 font-mono text-[11.5px] text-muted">{data.webhookEvents.join("  ·  ")}</p>
      </div>
    </div>
  );
}
