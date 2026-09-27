"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, CreditCard, FileText, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Loader, LoaderMark } from "@/components/Loader";
import { fmtCents, fmtDay, PAYMENT_STATUS, type PaymentRow } from "@/lib/payments";
import { rupees } from "@/lib/region";
import { siteHref } from "@/lib/site";

type PlanCard = {
  // Admins can add plans, so any key is possible.
  id: string;
  name: string;
  priceUsd: number;
  sources: number;
  widgets: number;
  reviews: number;
  views: number;
  refreshHours: number;
  priceYearlyUsd: number;
  /** Set in Admin -> Plans; null means India pays the dollar price in rupees. */
  priceInr: number | null;
  priceYearlyInr: number | null;
  available: boolean;
  availableYearly?: boolean;
};

type Interval = "month" | "year";
/** Where the customer pays from: India gets rupees, UPI AutoPay and Indian cards. */
type Region = "IN" | "INTL";

/** A first guess from the browser's time zone; the customer can switch it. */
function guessRegion(): Region {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone === "Asia/Kolkata" || zone === "Asia/Calcutta" ? "IN" : "INTL";
  } catch {
    return "INTL";
  }
}

/** What a plan costs over a year on a period, to tell an upgrade from a downgrade. */
const yearlyValue = (p: PlanCard, every: Interval) => (every === "year" ? p.priceYearlyUsd : p.priceUsd * 12);

type CheckoutResult =
  | { checkoutUrl: string }
  | { done: "resumed" | "upgraded" }
  | { done: "scheduled"; effectiveAt: string | null };

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

type Overview = {
  plan: PlanCard;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pendingPlan: string | null;
    interval?: Interval;
    currency?: string | null;
    /** Billed through Dodo: can be cancelled, resumed or changed here. */
    hasSubscription?: boolean;
    /** Card or UPI can be updated in Dodo's customer portal. */
    canManagePayment?: boolean;
  };
  usage: { period: string; views: number; widgets: number; sources: number };
  plans: PlanCard[];
  billingEnabled: boolean;
  testMode?: boolean;
  details?: Details;
};

type Details = { name: string; address: string; taxId: string };

export default function BillingPage() {
  return (
    <Suspense fallback={<Loader label="Loading billing" />}>
      <Billing />
    </Suspense>
  );
}

function Billing() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [period, setPeriod] = useState<Interval | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  // Only someone whose browser is in India sees the UPI choice at all; to
  // everyone else the page is a plain dollar checkout, with no mention of India.
  const [inIndia] = useState(() => guessRegion() === "IN");
  const region: Region = inIndia ? "IN" : "INTL";
  // A plan change on a running subscription waits for the customer's yes.
  const [change, setChange] = useState<{ plan: PlanCard; every: Interval; upgrade: boolean } | null>(null);
  // One confirm per return from checkout, even if the page re-renders with a
  // refreshed sign-in token while it is running.
  const confirmed = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [overview, paid] = await Promise.all([
        api<Overview>("/billing", { token }),
        // The history is extra: the page still works if it fails to load.
        api<PaymentRow[]>("/billing/payments", { token }).catch((): PaymentRow[] => []),
      ]);
      setData(overview);
      setPayments(paid);
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not load billing" });
    }
  }, [token]);

  // Coming back from checkout: confirm straight away instead of waiting for the webhook.
  useEffect(() => {
    if (!token) return;
    const status = params.get("checkout");
    const subscriptionId = params.get("subscription_id");
    if (status === "cancel" || (status === "return" && !subscriptionId)) {
      setNotice({ kind: "bad", text: "Checkout was cancelled. Nothing was charged." });
      router.replace("/dashboard/billing");
    } else if (status === "return" && subscriptionId) {
      if (confirmed.current === subscriptionId) return;
      confirmed.current = subscriptionId;
      setBusy("confirm");
      api<{ status: string }>("/billing/confirm", {
        method: "POST",
        token,
        body: JSON.stringify({ subscriptionId }),
      })
        .then((r) =>
          setNotice(
            r.status === "ACTIVE"
              ? { kind: "ok", text: "Payment confirmed - your new plan is active. A receipt is on its way to your email." }
              : r.status === "PENDING"
                ? {
                    kind: "ok",
                    text: "Your payment is being processed. UPI and Indian cards can take a few minutes; we will email you as soon as your plan is active.",
                  }
                : r.status === "FAILED"
                  ? { kind: "bad", text: "The payment did not go through, so nothing was charged. Please try again, or use another card or UPI." }
                  : { kind: "bad", text: `Your subscription is ${r.status.toLowerCase()}. It may take a minute to update.` },
          ),
        )
        .catch((err) => setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not confirm" }))
        .finally(() => {
          setBusy("");
          router.replace("/dashboard/billing");
          load();
        });
      return;
    }
    load();
  }, [token, params, router, load]);

  /**
   * A new subscriber goes to checkout. Someone already paying changes plan on
   * their subscription, after saying yes to what that costs.
   */
  function choose(p: PlanCard, every: Interval) {
    if (!data) return;
    const sub = data.subscription;
    const running = Boolean(sub.hasSubscription) && (sub.status === "ACTIVE" || sub.status === "CANCELLED");
    if (!running) return void checkout(p.id, every);
    const current = data.plans.find((x) => x.id === sub.plan);
    const upgrade = !current || yearlyValue(p, every) > yearlyValue(current, sub.interval ?? "month");
    setChange({ plan: p, every, upgrade });
  }

  async function checkout(plan: string, every: Interval) {
    setChange(null);
    setBusy(plan);
    setNotice(null);
    try {
      const r = await api<CheckoutResult>("/billing/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({ plan, interval: every, region }),
      });
      if ("checkoutUrl" in r) {
        window.location.href = r.checkoutUrl;
        return;
      }
      const name = data?.plans.find((x) => x.id === plan)?.name ?? plan;
      setNotice({
        kind: "ok",
        text:
          r.done === "resumed"
            ? "Welcome back - your plan continues."
            : r.done === "upgraded"
              ? `Moving you to ${name}. The difference is charged to your saved card or UPI, and the new limits switch on as soon as it goes through (Indian cards and UPI can take up to 2 days).`
              : `Done - you move to ${name}${"effectiveAt" in r && r.effectiveAt ? ` on ${fmtDay(r.effectiveAt)}` : " at your next billing date"}. Until then you keep your current plan.`,
      });
      await load();
      setBusy("");
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not start checkout" });
      setBusy("");
    }
  }

  async function resume() {
    setBusy("resume");
    setNotice(null);
    try {
      await api("/billing/resume", { method: "POST", token });
      setNotice({ kind: "ok", text: "Welcome back - your plan continues and renews as before." });
      await load();
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not resume" });
    } finally {
      setBusy("");
    }
  }

  /** Dodo's customer portal, where the card or UPI is updated. */
  async function managePayment() {
    setBusy("portal");
    setNotice(null);
    try {
      const r = await api<{ url: string }>("/billing/portal", { method: "POST", token });
      window.location.href = r.url;
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not open the payment settings" });
      setBusy("");
    }
  }

  async function cancel() {
    setConfirmCancel(false);
    setBusy("cancel");
    try {
      await api("/billing/cancel", { method: "POST", token });
      setNotice({ kind: "ok", text: "Subscription cancelled. You will not be charged again; we have emailed you the details." });
      await load();
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not cancel" });
    } finally {
      setBusy("");
    }
  }

  if (busy === "confirm") {
    return (
      <StatusCard
        icon={<LoaderMark />}
        title="Confirming your payment"
        text="We are checking your payment with our payment provider. This usually takes a few seconds - please keep this page open."
        slowText="Still working; your payment is safe. If this takes more than a minute, refresh the page - your plan switches on as soon as the payment is confirmed, and we email you."
      />
    );
  }

  if (!data) {
    // A failed load used to spin forever; say what went wrong and offer a retry.
    if (notice?.kind === "bad") {
      return (
        <StatusCard
          icon={<TriangleAlert className="h-6 w-6 text-coral" />}
          title="Billing did not load"
          text={notice.text}
          action={
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                void load();
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          }
        />
      );
    }
    return <Loader label="Loading billing" />;
  }

  const { plan, subscription, usage } = data;
  const isPaid = subscription.plan !== "FREE" && subscription.status !== "EXPIRED";
  // The toggle starts on the interval the account pays by.
  const every: Interval = period ?? subscription.interval ?? "month";
  // Overdue or paused accounts are on Free limits; the dialog names the plan they pay for.
  const planName = data.plans.find((p) => p.id === subscription.plan)?.name ?? plan.name;
  const renews = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;
  // India sees rupees, everyone else dollars. A running subscription keeps
  // the currency it is billed in.
  const inRupees = subscription.hasSubscription ? subscription.currency === "INR" : region === "IN";
  const priceNumbers = (p: PlanCard) => {
    const rupee = inRupees && (p.priceUsd <= 0 || p.priceInr != null);
    return {
      fmt: rupee ? rupees : money,
      month: rupee ? (p.priceInr ?? 0) : p.priceUsd,
      year: rupee ? (p.priceYearlyInr ?? 0) : p.priceYearlyUsd,
    };
  };
  const price = (p: PlanCard, per: Interval) => {
    const n = priceNumbers(p);
    return n.fmt(per === "year" ? n.year : n.month);
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">Billing</h1>
        <p className="mt-1 text-muted">Your plan, what you have used, and upgrades.</p>
      </header>

      {notice && (
        <p
          className={`mb-5 rounded-xl px-4 py-3 text-[13px] ${
            notice.kind === "ok" ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"
          }`}
        >
          {notice.text}
        </p>
      )}

      {data.billingEnabled && data.testMode && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <b>Test mode</b> - nothing here charges real money. Pay with card <code>4242 4242 4242 4242</code> (any future
          date, CVV 123)
          {inIndia && (
            <>
              , an Indian test card <code>4576 2389 1277 1450</code>, or UPI <code>success@upi</code>
            </>
          )}
          .
        </div>
      )}

      {!data.billingEnabled && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
          Paid plans are not switched on yet. Everything below works on the Free plan in the meantime.
        </div>
      )}

      {/* current plan + usage */}
      <section className="relative mb-6 rounded-2xl border border-line bg-card p-5 shadow-card">
        {busy === "cancel" && <BusyOverlay text={`Cancelling your ${planName} subscription...`} />}
        {busy === "resume" && <BusyOverlay text={`Resuming your ${planName} plan...`} />}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Current plan</p>
            <p className="mt-1 text-xl font-black">{plan.name}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {subscription.status === "CANCELLED" && renews
                ? `Cancelled - paid features until ${renews}`
                : subscription.status === "PAST_DUE"
                  ? "Payment overdue - update your card or UPI; your plan returns as soon as it goes through"
                  : subscription.status === "SUSPENDED"
                  ? "Paused - on Free limits until it resumes"
                  : isPaid && renews
                    ? `Renews ${renews}${subscription.interval === "year" ? " · billed yearly" : " · billed monthly"}`
                    : plan.id === "ADMIN"
                      ? "Admin account - no limits"
                      : plan.id !== "FREE"
                        ? "Active"
                        : "Free forever"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {subscription.canManagePayment && (
              <button
                type="button"
                onClick={managePayment}
                disabled={Boolean(busy)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition disabled:opacity-50 ${
                  subscription.status === "PAST_DUE" || subscription.status === "SUSPENDED"
                    ? "gradient-brand text-white hover:shadow-glow"
                    : "border border-line text-ink hover:bg-sand"
                }`}
              >
                {busy === "portal" ? <Spinner /> : <CreditCard className="h-4 w-4" />} Update payment method
              </button>
            )}
            {/* Only a Dodo subscription can be cancelled here; a plan set by support is changed by support. */}
            {isPaid && CANCELLABLE.includes(subscription.status) && subscription.hasSubscription && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                disabled={Boolean(busy)}
                className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-coral transition hover:bg-coral/5 disabled:opacity-50"
              >
                {busy === "cancel" ? "Cancelling..." : "Cancel subscription"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Meter label={`Widget views (${usage.period})`} used={usage.views} limit={plan.views} />
          <Meter label="Widgets" used={usage.widgets} limit={plan.widgets} />
          <Meter label="Domains" used={usage.sources} limit={plan.sources} />
        </div>
      </section>

      {openingCheckout(busy) && <FullBusy text="Opening secure checkout..." />}

      <ConfirmDialog
        open={Boolean(change)}
        title={change ? `${change.upgrade ? "Switch" : "Move"} to ${change.plan.name}${change.every === "year" ? " yearly" : ""}?` : "Change plan"}
        message={
          change &&
          (change.upgrade
            ? `You pay the difference now for the rest of your current period, from your saved card or UPI. After that it renews at ${price(change.plan, change.every)} a ${change.every}. The new limits apply as soon as the payment goes through.`
            : `Nothing is charged today. Your ${planName} plan continues until ${renews ?? "your next billing date"}; from then you pay ${price(change.plan, change.every)} a ${change.every} for ${change.plan.name}.`)
        }
        confirmLabel={change?.upgrade ? "Switch now" : "Schedule the change"}
        cancelLabel="Keep my plan"
        onCancel={() => setChange(null)}
        onConfirm={() => change && checkout(change.plan.id, change.every)}
      />

      <ConfirmDialog
        open={confirmCancel}
        danger
        title={`Cancel your ${planName} subscription?`}
        message={
          subscription.status === "ACTIVE" && renews
            ? `You will not be charged again. You keep ${planName} until ${renews}, then your account moves to the Free plan.`
            : "You will not be charged again, and your account moves to the Free plan now."
        }
        confirmLabel="Cancel subscription"
        cancelLabel="Keep my plan"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={cancel}
      />

      {/* plans */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Plans</h2>
        <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="Billing period">
          {(
            [
              ["month", "Monthly"],
              ["year", "Yearly · 2 months free"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={every === id}
              onClick={() => setPeriod(id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                every === id ? "gradient-brand text-white" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((p) => {
          const free = p.id === "FREE";
          // The plan in force (a cancelled plan runs to the end of its period),
          // on the billing period shown.
          const current = p.id === plan.id && (free || (subscription.interval ?? "month") === every);
          const samePlanOtherPeriod = p.id === plan.id && !free && !current;
          const yearly = every === "year" && !free;
          const available = yearly ? p.availableYearly : p.available;
          const resumable = !free && subscription.status === "CANCELLED" && Boolean(renews) && Boolean(available);
          return (
            <div
              key={p.id}
              className={`flex flex-col rounded-2xl border bg-card p-5 shadow-card ${
                current ? "border-brand ring-2 ring-brand/15" : "border-line"
              }`}
            >
              <p className="font-bold">{p.name}</p>
              <p className="mt-2">
                <span className="text-3xl font-black">{price(p, yearly ? "year" : "month")}</span>
                <span className="text-[13px] text-muted">{free ? "" : yearly ? " / year" : " / month"}</span>
              </p>
              {yearly && (
                <p className="text-[12px] font-semibold text-emerald-dark">
                  {(({ fmt, month, year }) =>
                    `${fmt(Math.round((year / 12) * 100) / 100)} a month, you save ${fmt(Math.max(0, Math.round((month * 12 - year) * 100) / 100))}`)(
                    priceNumbers(p),
                  )}
                </p>
              )}
              <ul className="mt-4 space-y-2 text-[13px]">
                <Feature>{p.widgets} widget{p.widgets === 1 ? "" : "s"}</Feature>
                <Feature>{p.sources} domain{p.sources === 1 ? "" : "s"}</Feature>
                <Feature>{p.reviews} reviews per widget</Feature>
                <Feature>{p.views >= UNLIMITED ? "Unlimited views" : `${p.views.toLocaleString()} views a month`}</Feature>
                <Feature>Reviews update every {p.refreshHours} hours</Feature>
                {free ? (
                  <>
                    <Feature>Grid, List and Carousel designs</Feature>
                    <Feature>Small &quot;Powered by&quot; link on widgets</Feature>
                  </>
                ) : (
                  <>
                    <Feature>All 6 designs, transparent or custom background</Feature>
                    <Feature>No &quot;Powered by&quot; link</Feature>
                    <Feature>Review QR code poster and share link</Feature>
                  </>
                )}
              </ul>
              <div className="mt-auto pt-5">
                {current && resumable ? (
                  // Cancelled but still paid up: take the cancellation back.
                  <button
                    type="button"
                    onClick={resume}
                    disabled={Boolean(busy)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg gradient-brand py-2.5 text-[13px] font-semibold text-white transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "resume" ? <Spinner /> : <CreditCard className="h-4 w-4" />}
                    Resume {p.name} - nothing to pay until {renews}
                  </button>
                ) : current ? (
                  <p className="rounded-lg bg-sand py-2 text-center text-[13px] font-semibold text-muted">
                    Current plan
                  </p>
                ) : free ? null : (
                  <button
                    type="button"
                    onClick={() => choose(p, every)}
                    disabled={!available || Boolean(busy)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg gradient-brand py-2.5 text-[13px] font-semibold text-white transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === p.id ? <Spinner /> : <CreditCard className="h-4 w-4" />}
                    {!available
                      ? "Coming soon"
                      : samePlanOtherPeriod
                        ? `Switch to ${yearly ? "yearly" : "monthly"}`
                        : `Choose ${p.name}${yearly ? " yearly" : ""}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <ShieldCheck className="h-4 w-4 text-emerald-dark" />
        <span>Secure checkout</span>
        <span aria-hidden>·</span>
        <span>{inRupees ? "Pay with UPI or any Indian card" : "Pay with card, Apple Pay or Google Pay"}</span>
        <span aria-hidden>·</span>
        <span>Cancel any time</span>
        <span aria-hidden>·</span>
        <Link href={siteHref("/refund-policy")} className="underline hover:text-ink">
          7-day refund on your first payment
        </Link>
      </p>

      <PaymentHistory payments={payments} />
      <BillingDetails token={token} initial={data.details ?? { name: "", address: "", taxId: "" }} />
    </div>
  );
}

function PaymentHistory({ payments }: { payments: PaymentRow[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-bold">Payments and invoices</h2>
      {payments.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-5 py-6 text-[13px] text-muted shadow-card">
          No payments yet. Every payment shows up here with its invoice.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                {["Date", "Invoice", "Plan", "Amount", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const status = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.PAID;
                return (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{fmtDay(p.paidAt)}</td>
                    <td className="px-4 py-3 font-mono text-[12.5px]">
                      {p.number}
                      {p.test && (
                        <span className="ml-1.5 rounded bg-amber-50 px-1 font-sans text-[10.5px] font-bold text-amber-700">
                          TEST
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.planName} · {p.interval === "year" ? "yearly" : "monthly"}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {fmtCents(p.amountCents, p.currency)}
                      {p.refundedCents > 0 && (
                        <span className="ml-1 text-[12px] font-normal text-coral">
                          (-{fmtCents(p.refundedCents, p.currency)})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={p.invoiceUrl ?? `/invoice/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" /> Invoice
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Who invoices are made out to. Starts from the saved details and keeps edits across reloads. */
function BillingDetails({ token, initial }: { token: string | null; initial: Details }) {
  const [form, setForm] = useState<Details>(initial);
  // "" idle, "saving", "saved", or an error message.
  const [state, setState] = useState("");
  const field =
    "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-normal text-ink outline-none transition focus:border-brand";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    try {
      setForm(await api<Details>("/billing/details", { method: "PUT", token, body: JSON.stringify(form) }));
      setState("saved");
    } catch (err) {
      setState(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="font-bold">Invoice details</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-muted">
        Printed under &quot;Billed to&quot; on your invoices, including ones already issued. Leave blank to use your
        account name.
      </p>
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-line bg-card p-5 shadow-card sm:grid-cols-2">
        <label className="block text-[12.5px] font-semibold text-muted">
          Name or company
          <input
            className={field}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme Dental Pvt Ltd"
          />
        </label>
        <label className="block text-[12.5px] font-semibold text-muted">
          Tax ID (GSTIN, VAT...)
          <input
            className={field}
            maxLength={40}
            value={form.taxId}
            onChange={(e) => setForm({ ...form, taxId: e.target.value })}
            placeholder="Optional"
          />
        </label>
        <label className="block text-[12.5px] font-semibold text-muted sm:col-span-2">
          Address
          <textarea
            className={`${field} min-h-20`}
            maxLength={400}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Street, city, postcode, country"
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={state === "saving"}
            className="rounded-lg gradient-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:shadow-glow disabled:opacity-50"
          >
            {state === "saving" ? "Saving..." : "Save details"}
          </button>
          {state === "saved" && <span className="text-[13px] text-emerald-dark">Saved.</span>}
          {state && state !== "saving" && state !== "saved" && <span className="text-[13px] text-coral">{state}</span>}
        </div>
      </form>
    </section>
  );
}

/** Any busy state that is a plan id: checkout (or a plan change) is being opened. */
const openingCheckout = (busy: string) => Boolean(busy) && !["confirm", "cancel", "resume", "portal"].includes(busy);

/** A centred card for a whole-page state: confirming, or a failed load. */
function StatusCard({
  icon,
  title,
  text,
  slowText,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  /** Shown instead of `text` after 15 seconds. */
  slowText?: string;
  action?: React.ReactNode;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowText) return;
    const timer = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(timer);
  }, [slowText]);
  return (
    <div className="mx-auto mt-10 max-w-md rounded-3xl border border-line bg-card p-8 text-center shadow-card">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-wash text-brand">{icon}</span>
      <h1 className="mt-5 text-lg font-black tracking-tight">{title}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{slow && slowText ? slowText : text}</p>
      {slowText && (
        <p className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-dark">
          <ShieldCheck className="h-3.5 w-3.5" /> Secure payment
        </p>
      )}
      {action}
    </div>
  );
}

/** Covers one card while something about it is being done. */
function BusyOverlay({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-card/85 backdrop-blur-[2px]" role="status">
      <Spinner className="h-6 w-6 text-brand" />
      <p className="text-[13px] font-semibold text-ink">{text}</p>
      <p className="text-[12px] text-muted">This takes a few seconds.</p>
    </div>
  );
}

/** Covers the page while the browser is on its way to checkout. */
function FullBusy({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-sand/80 backdrop-blur-sm" role="status">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-card shadow-card">
        <Spinner className="h-6 w-6 text-brand" />
      </span>
      <p className="text-sm font-semibold text-ink">{text}</p>
      <p className="inline-flex items-center gap-1.5 text-[12px] text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-dark" /> You pay on a secure checkout page
      </p>
    </div>
  );
}

/** A Dodo subscription in these states can still be stopped from here. */
const CANCELLABLE = ["ACTIVE", "PAST_DUE", "SUSPENDED"];

/** The backend sends Number.MAX_SAFE_INTEGER for "no limit". */
const UNLIMITED = 1_000_000;

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit >= UNLIMITED;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = pct >= 100 ? "bg-coral" : pct >= 80 ? "bg-amber-500" : "gradient-brand";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-semibold">
          {used.toLocaleString()}
          <span className="text-muted"> / {unlimited ? "unlimited" : limit.toLocaleString()}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand-deep">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Check className="h-3.5 w-3.5 shrink-0 text-brand" />
      {children}
    </li>
  );
}
