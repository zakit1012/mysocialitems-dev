"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CloudUpload, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
  priceYearlyUsd: number;
  /** What customers in India pay; blank = Dodo converts the dollar price. */
  priceInr: number | null;
  priceYearlyInr: number | null;
  dodoMonthlyIdTest: string | null;
  dodoMonthlyIdLive: string | null;
  dodoYearlyIdTest: string | null;
  dodoYearlyIdLive: string | null;
  /** Rupee products, for customers in India: made on save when a rupee price is set. */
  dodoMonthlyInrIdTest: string | null;
  dodoMonthlyInrIdLive: string | null;
  dodoYearlyInrIdTest: string | null;
  dodoYearlyInrIdLive: string | null;
};

/** Product id columns: [field, header]. */
const PRODUCT_FIELDS: [keyof Plan, string][] = [
  ["dodoMonthlyIdTest", "Monthly test id"],
  ["dodoMonthlyIdLive", "Monthly live id"],
  ["dodoYearlyIdTest", "Yearly test id"],
  ["dodoYearlyIdLive", "Yearly live id"],
  ["dodoMonthlyInrIdTest", "Monthly ₹ test id"],
  ["dodoMonthlyInrIdLive", "Monthly ₹ live id"],
  ["dodoYearlyInrIdTest", "Yearly ₹ test id"],
  ["dodoYearlyInrIdLive", "Yearly ₹ live id"],
];

type Draft = Omit<Plan, "views"> & { views: string };

const toDraft = (p: Plan): Draft => ({ ...p, views: p.views >= UNLIMITED ? "" : String(p.views) });

export function PlansTab({ token }: { token: string | null }) {
  const [mode, setMode] = useState("test");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchPlans = useCallback(
    () => api<{ mode: string; plans: Plan[] }>("/admin/billing/plans", { token }),
    [token],
  );
  const show = useCallback((r: { mode: string; plans: Plan[] }) => {
    setMode(r.mode);
    setDrafts(r.plans.map(toDraft));
  }, []);
  /** The plans again, after a change. */
  const load = useCallback(async () => show(await fetchPlans()), [fetchPlans, show]);

  useEffect(() => {
    fetchPlans()
      .then(show)
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [fetchPlans, show]);

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
          // blank = 10x the monthly price
          priceYearlyUsd: String(d.priceYearlyUsd ?? "").trim() === "" ? "" : Number(d.priceYearlyUsd),
          // blank = no rupee price; yearly blank = 10x the monthly rupee price
          priceInr: String(d.priceInr ?? "").trim() === "" ? null : Number(d.priceInr),
          priceYearlyInr: String(d.priceYearlyInr ?? "").trim() === "" ? null : Number(d.priceYearlyInr),
          dodoMonthlyIdTest: d.dodoMonthlyIdTest ?? "",
          dodoMonthlyIdLive: d.dodoMonthlyIdLive ?? "",
          dodoYearlyIdTest: d.dodoYearlyIdTest ?? "",
          dodoYearlyIdLive: d.dodoYearlyIdLive ?? "",
          dodoMonthlyInrIdTest: d.dodoMonthlyInrIdTest ?? "",
          dodoMonthlyInrIdLive: d.dodoMonthlyInrIdLive ?? "",
          dodoYearlyInrIdTest: d.dodoYearlyInrIdTest ?? "",
          dodoYearlyInrIdLive: d.dodoYearlyInrIdLive ?? "",
        }),
      });
      setMsg(
        r.warnings.length
          ? { ok: false, text: `Saved, but Dodo said: ${r.warnings.join("; ")}` }
          : { ok: true, text: `${d.name} saved.` },
      );
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy("");
    }
  }

  async function pushToDodo(d: Draft, interval: "month" | "year") {
    setBusy(`dodo:${interval}:${d.key}`);
    setMsg(null);
    try {
      await api(`/admin/billing/plans/${d.key}/dodo`, { method: "POST", token, body: JSON.stringify({ mode, interval }) });
      setMsg({ ok: true, text: `${d.name}${interval === "year" ? " yearly" : ""} created on Dodo (${mode}).` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Dodo failed" });
    } finally {
      setBusy("");
    }
  }

  // The new plan's key while its dialog is open; null when closed.
  const [newKey, setNewKey] = useState<string | null>(null);

  async function addPlan(raw: string) {
    const key = raw.trim();
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
          Each paid plan is a product on Dodo Payments, one for monthly and one for yearly, in test and in live
          mode. Press &quot;Monthly on …&quot; / &quot;Yearly on …&quot; at the end of a row to create them; the ids
          fill in by themselves. A new price is sent to Dodo for new subscribers - people already paying keep
          their price. Price ₹ is what customers in India see and pay; blank = they are shown dollars. Blank views = unlimited. Refresh = hours between review updates (2-168). Yearly $ blank =
          10x monthly (two months free). The Free plan never goes to Dodo.
        </p>
        <button type="button" onClick={() => setNewKey("")} disabled={busy === "add"}
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
        <table className="w-full min-w-[2240px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
              {["Key", "Name", "Price $", "Yearly $", "Price ₹", "Yearly ₹", "Sources", "Widgets", "Reviews", "Views/mo", "Refresh h", "On", ...PRODUCT_FIELDS.map(([, h]) => h), ""].map((h) => (
                <th key={h} className="px-2 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => {
              const idForMode = mode === "live" ? d.dodoMonthlyIdLive : d.dodoMonthlyIdTest;
              const yearlyIdForMode = mode === "live" ? d.dodoYearlyIdLive : d.dodoYearlyIdTest;
              return (
                <tr key={d.key} className="border-b border-line/60 align-middle last:border-0">
                  <td className="px-2 py-2 font-mono font-semibold">{d.key}</td>
                  <td className="px-2 py-2 w-36"><input className={input} value={d.name} onChange={(e) => edit(d.key, "name", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} type="number" step="0.01" min={0} value={d.priceUsd} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "priceUsd", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} type="number" step="0.01" min={0} placeholder="10x" value={d.priceYearlyUsd ?? ""} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "priceYearlyUsd", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} type="number" step="1" min={5} placeholder="₹" value={d.priceInr ?? ""} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "priceInr", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} type="number" step="1" min={5} placeholder="10x" value={d.priceYearlyInr ?? ""} disabled={d.key === "FREE"} onChange={(e) => edit(d.key, "priceYearlyInr", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={0} value={d.sources} onChange={(e) => edit(d.key, "sources", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={0} value={d.widgets} onChange={(e) => edit(d.key, "widgets", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={1} max={50} value={d.reviews} onChange={(e) => edit(d.key, "reviews", e.target.value)} /></td>
                  <td className="px-2 py-2 w-24"><input className={input} placeholder="unlimited" value={d.views} onChange={(e) => edit(d.key, "views", e.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={input} type="number" min={2} max={168} value={d.refreshHours} onChange={(e) => edit(d.key, "refreshHours", e.target.value)} /></td>
                  <td className="px-2 py-2"><input type="checkbox" checked={d.active} onChange={(e) => edit(d.key, "active", e.target.checked)} className="h-4 w-4 accent-brand" /></td>
                  {PRODUCT_FIELDS.map(([field]) => (
                    <td key={field} className="px-2 py-2 w-40">
                      <input
                        className={`${input} font-mono`}
                        placeholder={d.key === "FREE" ? "not needed" : "pdt_..."}
                        value={(d[field] as string | null) ?? ""}
                        disabled={d.key === "FREE"}
                        onChange={(e) => edit(d.key, field, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-2">
                    <button type="button" onClick={() => save(d)} disabled={Boolean(busy)}
                      className="inline-flex items-center gap-1 rounded-lg gradient-brand px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                      {busy === `save:${d.key}` ? <Spinner className="h-3 w-3" /> : <Check className="h-3.5 w-3.5" />} Save
                    </button>
                    {d.key !== "FREE" && !idForMode && (
                      <button type="button" onClick={() => pushToDodo(d, "month")} disabled={Boolean(busy)}
                        title={`Create the monthly product on Dodo (${mode})`}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:border-brand/40 hover:text-brand disabled:opacity-50">
                        {busy === `dodo:month:${d.key}` ? <Spinner className="h-3 w-3" /> : <CloudUpload className="h-3.5 w-3.5" />} Monthly on {mode}
                      </button>
                    )}
                    {d.key !== "FREE" && !yearlyIdForMode && (
                      <button type="button" onClick={() => pushToDodo(d, "year")} disabled={Boolean(busy)}
                        title={`Create the yearly product on Dodo (${mode})`}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:border-brand/40 hover:text-brand disabled:opacity-50">
                        {busy === `dodo:year:${d.key}` ? <Spinner className="h-3 w-3" /> : <CloudUpload className="h-3.5 w-3.5" />} Yearly on {mode}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={newKey !== null}
        title="New plan"
        icon={<Plus className="h-5 w-5" />}
        message={
          <label className="mt-2 block">
            <span className="text-[12.5px]">A short key for it, e.g. AGENCY</span>
            <input
              autoFocus
              value={newKey ?? ""}
              onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newKey?.trim()) {
                  const key = newKey;
                  setNewKey(null);
                  void addPlan(key);
                }
              }}
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-brand"
            />
          </label>
        }
        confirmLabel="Add plan"
        onCancel={() => setNewKey(null)}
        onConfirm={() => {
          const key = newKey ?? "";
          setNewKey(null);
          void addPlan(key);
        }}
      />
    </div>
  );
}
