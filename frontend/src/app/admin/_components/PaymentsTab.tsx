"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fmtCents, fmtDay, PAYMENT_STATUS } from "@/lib/payments";

type Mode = "test" | "live";

type Payment = {
  id: string;
  number: string;
  userId: string | null;
  dodoPaymentId: string | null;
  paypalSaleId: string | null;
  invoiceUrl: string | null;
  settlementCents: number | null;
  settlementCurrency: string | null;
  planName: string;
  interval: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  status: string;
  customerName: string;
  customerEmail: string;
  paidAt: string;
};

type Totals = {
  thisMonthCents: number;
  allTimeCents: number;
  refundedCents: number;
  count: number;
};

type Seller = { name: string; address: string; email: string; taxId: string; note: string };

/** Every payment, its invoice, refunds, and who our receipts come from. */
export function PaymentsTab({ token }: { token: string | null }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [rows, setRows] = useState<Payment[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [refund, setRefund] = useState<{ payment: Payment; amount: string } | null>(null);
  const [busy, setBusy] = useState("");

  const fetchPayments = useCallback(
    (m?: Mode | null) =>
      api<{ mode: Mode; totals: Totals; payments: Payment[] }>(
        `/admin/billing/payments${m ? `?mode=${m}` : ""}`,
        { token },
      ),
    [token],
  );

  const show = (r: { mode: Mode; totals: Totals; payments: Payment[] }) => {
    setMode(r.mode);
    setRows(r.payments);
    setTotals(r.totals);
  };

  const load = async (m?: Mode | null) => show(await fetchPayments(m));

  useEffect(() => {
    let cancelled = false;
    fetchPayments()
      .then((r) => {
        if (cancelled) return;
        setMode(r.mode);
        setRows(r.payments);
        setTotals(r.totals);
      })
      .catch((e) => !cancelled && setMsg({ ok: false, text: e.message }));
    return () => {
      cancelled = true;
    };
  }, [fetchPayments]);

  function switchMode(m: Mode) {
    setMsg(null);
    load(m).catch((e) => setMsg({ ok: false, text: e.message }));
  }

  async function doRefund() {
    if (!refund) return;
    const { payment, amount } = refund;
    setRefund(null);
    setBusy(payment.id);
    setMsg(null);
    try {
      const r = await api<{ pending: boolean }>(`/admin/billing/payments/${payment.id}/refund`, {
        method: "POST",
        token,
        body: JSON.stringify({ amount }),
      });
      setMsg({
        ok: true,
        text: r.pending
          ? `Refund of ${amount} ${payment.currency} on ${payment.number} sent to Dodo. It shows here, and the customer is emailed, once Dodo completes it.`
          : `Refunded ${amount} ${payment.currency} on ${payment.number}. The customer has been emailed.`,
      });
      await load(mode);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Refund failed" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[12.5px] text-muted">
          Every payment Dodo collected, with its invoice. Test-mode payments are kept apart from live revenue.
          Totals are what reaches your Dodo balance in US dollars, after Dodo&apos;s fees and tax. Refunds go back
          through Dodo and the customer gets an email.
        </p>
        <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="Payment mode">
          {(["live", "test"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize transition ${
                mode === m ? "gradient-brand text-white" : "text-muted hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-[12.5px] ${msg.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
          {msg.text}
        </p>
      )}

      {totals && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["This month (net)", fmtCents(totals.thisMonthCents)],
            ["All time (net)", fmtCents(totals.allTimeCents)],
            ["Refunded", fmtCents(totals.refundedCents)],
            ["Payments", totals.count.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line bg-card p-4 shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1 text-xl font-black">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
        <table className="w-full min-w-[980px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-sand/60 text-left text-[10.5px] uppercase tracking-wide text-muted">
              {["Date", "Ref", "Customer", "Plan", "Paid", "You get", "Status", "Payment id", ""].map((h) => (
                <th key={h} className="px-3 py-3 font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  {mode ? `No ${mode} payments yet.` : "Loading..."}
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const status = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.PAID;
                const left = p.amountCents - p.refundedCents;
                return (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5">{fmtDay(p.paidAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono">{p.number}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">{p.customerName}</p>
                      <p className="text-[11.5px] text-muted">
                        {p.customerEmail}
                        {!p.userId && " · account deleted"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {p.planName} · {p.interval === "year" ? "yearly" : "monthly"}
                    </td>
                    <td className="px-3 py-2.5 font-semibold">
                      {fmtCents(p.amountCents, p.currency)}
                      {p.refundedCents > 0 && (
                        <span className="block text-[11.5px] font-normal text-coral">
                          -{fmtCents(p.refundedCents, p.currency)} refunded
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {p.settlementCents != null ? fmtCents(p.settlementCents, p.settlementCurrency ?? "USD") : "-"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11.5px]">{p.dodoPaymentId ?? p.paypalSaleId ?? "-"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <a
                        href={p.invoiceUrl ?? `/invoice/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-1 inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] hover:border-brand/40 hover:text-brand"
                      >
                        <FileText className="h-3 w-3" /> Invoice
                      </a>
                      {left > 0 && p.status !== "REVERSED" && p.dodoPaymentId && (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => setRefund({ payment: p, amount: (left / 100).toFixed(2) })}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] text-coral hover:bg-coral/5 disabled:opacity-50"
                        >
                          {busy === p.id ? <Spinner className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />} Refund
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(refund)}
        danger
        title={refund ? `Refund ${refund.payment.number}?` : "Refund"}
        message={
          refund && (
            <>
              <p>
                {refund.payment.customerName} paid {fmtCents(refund.payment.amountCents, refund.payment.currency)}
                {refund.payment.refundedCents > 0 &&
                  ` (${fmtCents(refund.payment.refundedCents, refund.payment.currency)} already refunded)`}
                . Dodo sends the money back to their card or UPI; this cannot be undone. Refunding does not cancel
                the subscription - use Subscriptions for that.
              </p>
              <label className="mt-3 block text-[12.5px] font-semibold text-ink">
                Amount in {refund.payment.currency}
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={((refund.payment.amountCents - refund.payment.refundedCents) / 100).toFixed(2)}
                  value={refund.amount}
                  onChange={(e) => setRefund({ ...refund, amount: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
                />
              </label>
            </>
          )
        }
        confirmLabel="Refund"
        cancelLabel="Keep payment"
        onCancel={() => setRefund(null)}
        onConfirm={doRefund}
      />

      <SellerSettings token={token} />
    </div>
  );
}

/** The "From" block on every invoice. */
function SellerSettings({ token }: { token: string | null }) {
  const [form, setForm] = useState<Seller | null>(null);
  const [state, setState] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<Seller>("/admin/billing/invoice-settings", { token })
      .then((s) => !cancelled && setForm(s))
      .catch((e) => !cancelled && setState(e instanceof Error ? e.message : "Could not load"));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setState("saving");
    try {
      setForm(await api<Seller>("/admin/billing/invoice-settings", { method: "PUT", token, body: JSON.stringify(form) }));
      setState("saved");
    } catch (err) {
      setState(err instanceof Error ? err.message : "Could not save");
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-normal text-ink outline-none focus:border-brand";

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <h2 className="font-bold">Invoice details (seller)</h2>
      <p className="mb-4 mt-0.5 text-[12.5px] text-muted">
        Shown at the top of every invoice, old and new. Use your legal business name and address.
      </p>
      {!form ? (
        <p className="flex items-center gap-2 text-muted">
          {state || (
            <>
              <Spinner /> Loading...
            </>
          )}
        </p>
      ) : (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Business name"],
              ["email", "Billing email"],
              ["taxId", "Tax ID (GSTIN, VAT...)"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block text-[12.5px] font-semibold text-muted">
              {label}
              <input className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </label>
          ))}
          <label className="block text-[12.5px] font-semibold text-muted sm:col-span-2">
            Address
            <textarea
              className={`${input} min-h-20`}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="block text-[12.5px] font-semibold text-muted sm:col-span-2">
            Note at the bottom (optional)
            <textarea
              className={`${input} min-h-16`}
              value={form.note}
              placeholder="e.g. Tax not charged - export of services."
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={state === "saving"}
              className="rounded-lg gradient-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {state === "saving" ? "Saving..." : "Save"}
            </button>
            {state === "saved" && <span className="text-[13px] text-emerald-dark">Saved.</span>}
            {state && state !== "saving" && state !== "saved" && <span className="text-[13px] text-coral">{state}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
