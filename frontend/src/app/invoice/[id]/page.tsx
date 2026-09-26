"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtCents, fmtDay, PAYMENT_STATUS } from "@/lib/payments";
import { appHref } from "@/lib/site";
import { Loader } from "@/components/Loader";

type Invoice = {
  id: string;
  number: string;
  issuedAt: string;
  status: string;
  test: boolean;
  seller: { name: string; address: string; email: string; taxId: string; note: string };
  customer: { name: string; email: string; address: string; taxId: string };
  line: { description: string; periodStart: string; periodEnd: string | null };
  amountCents: number;
  refundedCents: number;
  currency: string;
  reference: string;
  /** Dodo's own invoice PDF - the legal invoice, since Dodo is the seller. */
  invoiceUrl: string | null;
};

/**
 * A printable invoice for one payment. "Print / Save as PDF" uses the
 * browser's own dialog; everything but the invoice itself is hidden in print.
 */
export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { token, user, loading } = useAuth();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=/invoice/${id}`);
  }, [loading, user, router, id]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<Invoice>(`/billing/invoices/${encodeURIComponent(id)}`, { token })
      .then((r) => !cancelled && setInvoice(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the invoice"));
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-bold">{error}</p>
        <Link href={appHref("/dashboard/billing")} className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
          Back to billing
        </Link>
      </div>
    );
  }

  if (!invoice) {
    return (
      <Loader label="Loading invoice" className="flex-1 py-24" />
    );
  }

  const status = PAYMENT_STATUS[invoice.status] ?? PAYMENT_STATUS.PAID;
  const net = invoice.amountCents - invoice.refundedCents;
  const money = (c: number) => fmtCents(c, invoice.currency);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: #fff !important; } }`}</style>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={user?.role === "ADMIN" ? "/admin/payments" : "/dashboard/billing"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        {invoice.invoiceUrl && (
          <a
            href={invoice.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand"
          >
            Official invoice (PDF)
          </a>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-white transition hover:shadow-glow"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <article className="rounded-2xl border border-line bg-white p-6 text-[13.5px] text-ink shadow-card sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {invoice.test && (
          <p className="mb-6 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
            Test payment - no real money was charged.
          </p>
        )}

        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xl font-black tracking-tight">{invoice.seller.name}</p>
            {invoice.seller.address && (
              <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{invoice.seller.address}</p>
            )}
            {invoice.seller.email && <p className="text-[12.5px] text-muted">{invoice.seller.email}</p>}
            {invoice.seller.taxId && <p className="text-[12.5px] text-muted">Tax ID: {invoice.seller.taxId}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-black uppercase tracking-[0.12em] text-brand">Invoice</p>
            <p className="mt-1 font-mono text-[13px] font-semibold">{invoice.number}</p>
            <p className="text-[12.5px] text-muted">Issued {fmtDay(invoice.issuedAt)}</p>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${status.tone}`}>
              {status.label}
            </span>
          </div>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Billed to</p>
            <p className="mt-1 font-semibold">{invoice.customer.name}</p>
            <p className="text-[12.5px] text-muted">{invoice.customer.email}</p>
            {invoice.customer.address && (
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{invoice.customer.address}</p>
            )}
            {invoice.customer.taxId && <p className="text-[12.5px] text-muted">Tax ID: {invoice.customer.taxId}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Payment</p>
            <p className="mt-1">Paid {fmtDay(invoice.issuedAt)}</p>
            <p className="break-all font-mono text-[12px] text-muted">Payment {invoice.reference}</p>
          </div>
        </section>

        <table className="mt-8 w-full">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 font-bold">Description</th>
              <th className="py-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-3 pr-4">
                <p className="font-semibold">{invoice.line.description}</p>
                <p className="text-[12.5px] text-muted">
                  {fmtDay(invoice.line.periodStart)}
                  {invoice.line.periodEnd ? ` - ${fmtDay(invoice.line.periodEnd)}` : ""}
                </p>
              </td>
              <td className="py-3 text-right font-semibold">{money(invoice.amountCents)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{money(invoice.amountCents)}</dd>
          </div>
          {invoice.refundedCents > 0 && (
            <div className="flex justify-between text-coral">
              <dt>Refunded</dt>
              <dd>-{money(invoice.refundedCents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-[15px] font-black">
            <dt>{invoice.refundedCents > 0 ? "Net paid" : "Total paid"}</dt>
            <dd>{money(net)}</dd>
          </div>
        </dl>

        <footer className="mt-10 border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
          {invoice.seller.note && <p className="mb-2 whitespace-pre-line">{invoice.seller.note}</p>}
          <p>
            Thank you for your business.
            {invoice.seller.email ? ` Questions about this invoice? Write to ${invoice.seller.email}.` : ""}
          </p>
        </footer>
      </article>
    </div>
  );
}
