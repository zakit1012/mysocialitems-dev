/** Money and dates as payments, receipts and invoices show them. */

export const fmtCents = (cents: number, currency = "USD") =>
  `${currency === "USD" ? "$" : currency === "INR" ? "₹" : `${currency} `}${(cents / 100).toFixed(2)}`;

/** "26 Sep 2026" - the same on every screen and in print. */
export const fmtDay = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const PAYMENT_STATUS: Record<string, { label: string; tone: string }> = {
  PAID: { label: "Paid", tone: "text-emerald-dark bg-emerald-wash" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "text-amber-700 bg-amber-50" },
  REFUNDED: { label: "Refunded", tone: "text-muted bg-sand" },
  REVERSED: { label: "Reversed", tone: "text-coral bg-coral/10" },
};

export type PaymentRow = {
  id: string;
  number: string;
  paidAt: string;
  planName: string;
  interval: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  status: string;
  test: boolean;
  /** Dodo's invoice PDF, the customer's legal invoice. */
  invoiceUrl?: string | null;
};
