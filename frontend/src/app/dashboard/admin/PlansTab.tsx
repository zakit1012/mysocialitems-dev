"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CloudUpload, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

const UNLIMITED = 1_000_000_000;

type Plan = {
  key: string;
  name: string;
  priceUsd: number;
  sources: number;
  widgets: number;
  reviews: number;
  views: number;
  refreshHours: number;
  active: boolean;
  sortOrder: number;
  paypalPlanIdSandbox: string | null;
  paypalPlanIdLive: string | null;
  priceYearlyUsd: number;
  paypalYearlyIdSandbox: string | null;
  paypalYearlyIdLive: string | null;
};

type Draft = Omit<Plan, "views"> & { views: string };

const toDraft = (p: Plan): Draft => ({ ...p, views: p.views >= UNLIMITED ? "" : String(p.views) });

export function PlansTab({ token }: { token: string | null }) {
  const [mode, setMode] = useState("sandbox");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ mode: string; plans: Plan[] }>("/admin/billing/plans", { token });
    setMode(r.mode);
    setDrafts(r.plans.map(toDraft));
  }, [token]);

  useEffect(() => {
    load().catch((e) => setMsg({ ok: false, text: e.message }));
  }, [load]);

  function edit(key: string, field: keyof Draft, value: string | boolean) {
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, [field]: value } : d)));
  }

  async function save(d: Draft) {
    setBusy(`save:${d.key}`);
    setMsg(null);
    try {
      const r = await api<{ warnings: string[] }>(`/admin/billing/plans/${d.key}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          name: d.name,
          priceUsd: d.priceUsd,
          sources: d.sources,
          widgets: d.widgets,
          reviews: d.reviews,
          views: d.views.trim() === "" ? "unlimited" : Number(d.views),
          refreshHours: d.refreshHours,
          active: d.active,
          sortOrder: d.sortOrder,
          paypalPlanIdSandbox: d.paypalPlanIdSandbox ?? "",
          paypalPlanIdLive: d.paypalPlanIdLive ?? "",
          // blank = 10x the monthly price
          priceYearlyUsd: String(d.priceYearlyUsd ?? "").trim() === "" ? "" : Number(d.priceYearlyUsd),
          paypalYearlyIdSandbox: d.paypalYearlyIdSandbox ?? "",
          paypalYearlyIdLive: d.paypalYearlyIdLive ?? "",
        }),
      });
      setMsg(
        r.warnings.length
          ? { ok: false, text: `Saved, but PayPal said: ${r.warnings.join("; ")}` }
          : { ok: true, text: `${d.name} saved.` },
      );
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy("");
    }
  }

  async function pushToPaypal(d: Draft, interval: "month" | "year") {
    setBusy(`pp:${interval}:${d.key}`);
    setMsg(null);
    try {
      await api(`/admin/billing/plans/${d.key}/paypal`, { method: "POST", token, body: JSON.stringify({ mode, interval }) });
      setMsg({ ok: true, text: `${d.name}${interval === "year" ? " yearly" : ""} created on PayPal ${mode}.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "PayPal failed" });
    } finally {
      setBusy("");
    }
  }

  async function addPlan() {
    const key = prompt("Key for the new plan (e.g. AGENCY):");
    if (!key) return;
    setBusy("add");
    try {
      await api(`/admin/billing/plans/${encodeURIComponent(key)}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ name: key, priceUsd: 20, sources: 10, widgets: 10, reviews: 50, views: "unlimited", refreshHours: 12, active: false }),
      });
      setMsg({ ok: true, text: `${key.toUpperCase()} added as inactive - set it up, then switch it on.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not add" });
    } finally {
      setBusy("");
    }
  }

  const input = "w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-brand";

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">
          Price changes on a plan that is already on PayPal are pushed there too. PayPal tells existing
          subscribers and applies the new price from their next cycle. Blank views = unlimited.
          Refresh = hours between automatic review updates (2-168). Yearly $ blank = 10x monthly (two months free).
          Monthly and yearly are separate plans on PayPal.
        </p>
        <button type="button" onClick={addPlan} disabled={busy === "add"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold hover:border-brand/40 hover:text-brand">
          <Plus className="h-3.5 w-3.5" /> New plan
        </button>
      </div>

      {msg && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] ${msg.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
          {msg.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1600px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
              {["Key", "Name", "Price $", "Yearly $", "Sources", "Widgets", "Reviews", "Views/mo", "Refresh h", "On", "PayPal sandbox id", "PayPal live id", "Yearly sandbox id", "Yearly live id", ""].map((h) => (
                <th key={h} className="px-2 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => {
              const idForMode = mode === "live" ? d.paypalPlanIdLive : d.paypalPlanIdSandbox;
              const yearlyIdForMode = mode === "live" ? d.paypalYearlyIdLive : d.paypalYearlyIdSandbox;
              return (
                <tr key={d.key} className="border-b border-line/60 align-middle last:border-0">
                  <td className="px-2 py-2 font-mono font-semibold">{d.key}</td>
                  <td className="px-2 py-2 w-36"><input className={input} value={d.name} onChange={(e) => edit(d.key, "name", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} type="number" step="0.01" min={0} value={d.priceUsd} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "priceUsd", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} type="number" step="0.01" min={0} placeholder="10x" value={d.priceYearlyUsd ?? ""} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "priceYearlyUsd", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={0} value={d.sources} onChange={(e) => edit(d.key, "sources", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={0} value={d.widgets} onChange={(e) => edit(d.key, "widgets", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={1} max={50} value={d.reviews} onChange={(e) => edit(d.key, "reviews", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} placeholder="unlimited" value={d.views} onChange={(e) => edit(d.key, "views", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={2} max={168} value={d.refreshHours} onChange={(e) => edit(d.key, "refreshHours", e.target.value)} /></td>
                  <td className="px-2 py-2"><input type="checkbox" checked={d.active} onChange={(e) => edit(d.key, "active", e.target.checked)} className="h-4 w-4 accent-brand" /></td>
                  <td className="px-2 py-2 w-40"><input className={`${input} font-mono`} placeholder="P-..." value={d.paypalPlanIdSandbox ?? ""} onChange={(e) => edit(d.key, "paypalPlanIdSandbox", e.target.value)} /></td>
                  <td className="px-2 py-2 w-40"><input className={`${input} font-mono`} placeholder="P-..." value={d.paypalPlanIdLive ?? ""} onChange={(e) => edit(d.key, "paypalPlanIdLive", e.target.value)} /></td>
                  <td className="px-2 py-2 w-40"><input className={`${input} font-mono`} placeholder="P-..." value={d.paypalYearlyIdSandbox ?? ""} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "paypalYearlyIdSandbox", e.target.value)} /></td>
                  <td className="px-2 py-2 w-40"><input className={`${input} font-mono`} placeholder="P-..." value={d.paypalYearlyIdLive ?? ""} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "paypalYearlyIdLive", e.target.value)} /></td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <button type="button" onClick={() => save(d)} disabled={Boolean(busy)}
                      className="inline-flex items-center gap-1 rounded-lg gradient-brand px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                      {busy === `save:${d.key}` ? <Spinner className="h-3 w-3" /> : <Check className="h-3.5 w-3.5" />} Save
                    </button>
                    {d.key !== "FREE" && !idForMode && (
                      <button type="button" onClick={() => pushToPaypal(d, "month")} disabled={Boolean(busy)}
                        title={`Create the monthly plan on PayPal ${mode}`}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:border-brand/40 hover:text-brand disabled:opacity-50">
                        {busy === `pp:month:${d.key}` ? <Spinner className="h-3 w-3" /> : <CloudUpload className="h-3.5 w-3.5" />} Monthly on {mode}
                      </button>
                    )}
                    {d.key !== "FREE" && !yearlyIdForMode && (
                      <button type="button" onClick={() => pushToPaypal(d, "year")} disabled={Boolean(busy)}
                        title={`Create the yearly plan on PayPal ${mode}`}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:border-brand/40 hover:text-brand disabled:opacity-50">
                        {busy === `pp:year:${d.key}` ? <Spinner className="h-3 w-3" /> : <CloudUpload className="h-3.5 w-3.5" />} Yearly on {mode}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
