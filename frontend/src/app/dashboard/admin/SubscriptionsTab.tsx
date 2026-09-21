"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { api } from "@/lib/api";

type Sub = {
  userId: string;
  plan: string;
  status: string;
  paypalSubscriptionId: string | null;
  pendingPlan: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
  viewsThisMonth: number;
  user: { email: string; name: string; role: string };
};

type Event = { id: string; type: string; userId: string | null; createdAt: string };

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "text-emerald-dark bg-emerald-wash",
  CANCELLED: "text-amber-700 bg-amber-50",
  SUSPENDED: "text-coral bg-coral/10",
  EXPIRED: "text-muted bg-sand",
};

export function SubscriptionsTab({ token }: { token: string | null }) {
  const [mode, setMode] = useState("sandbox");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [plans, setPlans] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      api<{ mode: string; subscriptions: Sub[]; events: Event[] }>("/admin/billing/subscriptions", { token }),
      api<{ plans: { key: string }[] }>("/admin/billing/plans", { token }),
    ]);
    setMode(s.mode);
    setSubs(s.subscriptions);
    setEvents(s.events);
    setPlans(p.plans.map((x) => x.key));
  }, [token]);

  useEffect(() => {
    load().catch((e) => setMsg({ ok: false, text: e.message }));
  }, [load]);

  async function act(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy("");
    }
  }

  const paypalUrl = (id: string) =>
    `https://www.${mode === "live" ? "" : "sandbox."}paypal.com/billing/subscriptions/${id}`;

  return (
    <div className="p-4">
      <p className="mb-3 text-[12.5px] text-muted">
        Changing a plan here is a manual override (a comp, a refund, a support fix). If the customer
        has an active PayPal subscription for another plan, it is cancelled so they are not billed twice.
        Mode: <b>{mode}</b>
      </p>
      {msg && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] ${msg.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
          {msg.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
              {["Customer", "Plan", "Status", "PayPal subscription", "Renews / ends", "Views (month)", ""].map((h) => (
                <th key={h} className="px-2 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.userId} className="border-b border-line/60 last:border-0">
                <td className="px-2 py-2.5">
                  <p className="font-semibold">{s.user.name}</p>
                  <p className="text-[11.5px] text-muted">{s.user.email}{s.user.role === "ADMIN" ? " · admin" : ""}</p>
                </td>
                <td className="px-2 py-2.5">
                  <select
                    value={s.plan}
                    disabled={Boolean(busy)}
                    onChange={(e) => {
                      const plan = e.target.value;
                      if (!confirm(`Move ${s.user.email} to ${plan}?`)) return;
                      act(`plan:${s.userId}`, () =>
                        api(`/admin/billing/subscriptions/${s.userId}`, { method: "PATCH", token, body: JSON.stringify({ plan }) }),
                        `${s.user.email} is now on ${plan}.`);
                    }}
                    className="rounded-lg border border-line bg-white px-2 py-1 text-[12.5px] outline-none focus:border-brand"
                  >
                    {plans.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {s.pendingPlan && <span className="ml-1 text-[11px] text-muted">→ {s.pendingPlan}?</span>}
                </td>
                <td className="px-2 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[s.status] ?? "bg-sand"}`}>
                    {s.status.toLowerCase()}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  {s.paypalSubscriptionId ? (
                    <a href={paypalUrl(s.paypalSubscriptionId)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11.5px] text-brand hover:underline">
                      {s.paypalSubscriptionId} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted">manual / none</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-muted">
                  {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "-"}
                </td>
                <td className="px-2 py-2.5">{s.viewsThisMonth.toLocaleString()}</td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right">
                  {s.paypalSubscriptionId && (
                    <button type="button" title="Pull status from PayPal" disabled={Boolean(busy)}
                      onClick={() => act(`ref:${s.userId}`, () =>
                        api(`/admin/billing/subscriptions/${s.userId}/refresh`, { method: "POST", token }), "Synced from PayPal.")}
                      className="mr-1 inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] hover:border-brand/40 hover:text-brand disabled:opacity-50">
                      <RefreshCw className={`h-3 w-3 ${busy === `ref:${s.userId}` ? "animate-spin" : ""}`} /> Sync
                    </button>
                  )}
                  {s.plan !== "FREE" && (
                    <button type="button" disabled={Boolean(busy)}
                      onClick={() => {
                        if (!confirm(`Cancel ${s.user.email}'s subscription now and move them to Free?`)) return;
                        act(`can:${s.userId}`, () =>
                          api(`/admin/billing/subscriptions/${s.userId}/cancel`, { method: "POST", token }), "Cancelled.");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] text-coral hover:bg-coral/5 disabled:opacity-50">
                      <XCircle className="h-3 w-3" /> Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wide text-muted">Recent PayPal events</h3>
      {events.length === 0 ? (
        <p className="text-[12.5px] text-muted">No webhooks received yet.</p>
      ) : (
        <ul className="space-y-1 text-[12px]">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-36 shrink-0 text-muted">{new Date(e.createdAt).toLocaleString()}</span>
              <span className="font-mono">{e.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
