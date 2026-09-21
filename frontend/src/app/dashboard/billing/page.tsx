"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, CreditCard, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";

type PlanCard = {
  // Admins can add plans, so any key is possible.
  id: string;
  name: string;
  priceUsd: number;
  sources: number;
  widgets: number;
  reviews: number;
  views: number;
  available: boolean;
};

type Overview = {
  plan: PlanCard;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pendingPlan: string | null;
  };
  usage: { period: string; views: number; widgets: number; sources: number };
  plans: PlanCard[];
  billingEnabled: boolean;
};

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="flex items-center gap-2 text-muted"><Spinner /> Loading...</p>}>
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

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await api<Overview>("/billing", { token }));
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not load billing" });
    }
  }, [token]);

  // Coming back from PayPal: confirm straight away instead of waiting for the webhook.
  useEffect(() => {
    if (!token) return;
    const status = params.get("paypal");
    const subscriptionId = params.get("subscription_id");
    if (status === "cancel") {
      setNotice({ kind: "bad", text: "Checkout was cancelled. Nothing was charged." });
      router.replace("/dashboard/billing");
    } else if (status === "return" && subscriptionId) {
      setBusy("confirm");
      api<{ status: string }>("/billing/confirm", {
        method: "POST",
        token,
        body: JSON.stringify({ subscriptionId }),
      })
        .then((r) =>
          setNotice(
            r.status === "ACTIVE"
              ? { kind: "ok", text: "Payment confirmed - your new plan is active." }
              : { kind: "bad", text: `PayPal says the subscription is ${r.status.toLowerCase()}. It may take a minute.` },
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

  async function upgrade(plan: string) {
    setBusy(plan);
    setNotice(null);
    try {
      const r = await api<{ approveUrl: string }>("/billing/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({ plan }),
      });
      window.location.href = r.approveUrl;
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not start checkout" });
      setBusy("");
    }
  }

  async function cancel() {
    if (!confirm("Cancel your subscription? You keep your plan until the end of the paid period.")) return;
    setBusy("cancel");
    try {
      await api("/billing/cancel", { method: "POST", token });
      setNotice({ kind: "ok", text: "Subscription cancelled." });
      await load();
    } catch (err) {
      setNotice({ kind: "bad", text: err instanceof Error ? err.message : "Could not cancel" });
    } finally {
      setBusy("");
    }
  }

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-muted">
        <Spinner /> {busy === "confirm" ? "Confirming your payment with PayPal..." : "Loading billing..."}
      </p>
    );
  }

  const { plan, subscription, usage } = data;
  const isPaid = subscription.plan !== "FREE" && subscription.status !== "EXPIRED";
  const renews = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

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

      {!data.billingEnabled && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
          Paid plans are not switched on yet. Everything below works on the Free plan in the meantime.
        </div>
      )}

      {/* current plan + usage */}
      <section className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Current plan</p>
            <p className="mt-1 text-xl font-black">{plan.name}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {subscription.status === "CANCELLED" && renews
                ? `Cancelled - paid features until ${renews}`
                : subscription.status === "SUSPENDED"
                  ? "Suspended by PayPal - update your payment method"
                  : isPaid && renews
                    ? `Renews ${renews}`
                    : plan.id === "ADMIN"
                      ? "Admin account - no limits"
                      : "Free forever"}
            </p>
          </div>
          {isPaid && subscription.status === "ACTIVE" && (
            <button
              type="button"
              onClick={cancel}
              disabled={busy === "cancel"}
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-coral transition hover:bg-coral/5 disabled:opacity-50"
            >
              {busy === "cancel" ? "Cancelling..." : "Cancel subscription"}
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Meter label={`Widget views (${usage.period})`} used={usage.views} limit={plan.views} />
          <Meter label="Widgets" used={usage.widgets} limit={plan.widgets} />
          <Meter label="Domains" used={usage.sources} limit={plan.sources} />
        </div>
      </section>

      {/* plans */}
      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((p) => {
          // The plan in force (a cancelled plan runs to the end of its period).
          const current = p.id === plan.id;
          return (
            <div
              key={p.id}
              className={`flex flex-col rounded-2xl border bg-card p-5 shadow-card ${
                current ? "border-brand ring-2 ring-brand/15" : "border-line"
              }`}
            >
              <p className="font-bold">{p.name}</p>
              <p className="mt-2">
                <span className="text-3xl font-black">${p.priceUsd}</span>
                <span className="text-[13px] text-muted">{p.priceUsd ? " / month" : ""}</span>
              </p>
              <ul className="mt-4 space-y-2 text-[13px]">
                <Feature>{p.widgets} widget{p.widgets === 1 ? "" : "s"}</Feature>
                <Feature>{p.sources} domain{p.sources === 1 ? "" : "s"}</Feature>
                <Feature>{p.reviews} reviews per widget</Feature>
                <Feature>{p.views >= UNLIMITED ? "Unlimited views" : `${p.views.toLocaleString()} views a month`}</Feature>
              </ul>
              <div className="mt-auto pt-5">
                {current ? (
                  <p className="rounded-lg bg-sand py-2 text-center text-[13px] font-semibold text-muted">
                    Current plan
                  </p>
                ) : p.id === "FREE" ? null : (
                  <button
                    type="button"
                    onClick={() => upgrade(p.id)}
                    disabled={!p.available || Boolean(busy)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg gradient-brand py-2.5 text-[13px] font-semibold text-white transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === p.id ? <Spinner /> : <CreditCard className="h-4 w-4" />}
                    {p.available ? `Choose ${p.name} with PayPal` : "Coming soon"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
