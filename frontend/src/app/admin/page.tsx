"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CreditCard, Eye, Globe, LayoutGrid, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/time";
import { Loader } from "@/components/Loader";

type Overview = { users: number; widgets: number; sources: number; newUsers: number; paying: number };
type AdminUser = { id: string; name: string; email: string; createdAt: string; subscription: { plan: string } | null };
type Sub = { plan: string; status: string; viewsThisMonth: number };
type BillingEvent = { id: string; type: string; createdAt: string };

type Data = { overview: Overview; users: AdminUser[]; subs: Sub[]; events: BillingEvent[] };

/** "BILLING.SUBSCRIPTION.ACTIVATED" -> "Subscription activated" */
const eventLabel = (type: string) => {
  const words = type.replace(/^BILLING\./, "").replace(/[._]/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export default function AdminOverviewPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      api<Overview>("/admin/overview", { token }),
      api<AdminUser[]>("/admin/users", { token }),
      api<{ subscriptions: Sub[]; events: BillingEvent[] }>("/admin/billing/subscriptions", { token }),
    ])
      .then(([overview, users, billing]) => {
        if (!cancelled) setData({ overview, users, subs: billing.subscriptions, events: billing.events });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <p className="rounded-2xl bg-coral/10 px-4 py-3 text-coral">{error}</p>;
  if (!data) {
    return (
      <Loader label="Loading overview" />
    );
  }

  const { overview, users, subs, events } = data;
  const views = subs.reduce((sum, s) => sum + s.viewsThisMonth, 0);
  // Accounts without a subscription row yet are on Free.
  const byPlan = new Map<string, number>();
  for (const u of users) {
    const plan = u.subscription?.plan ?? "FREE";
    byPlan.set(plan, (byPlan.get(plan) ?? 0) + 1);
  }
  const plans = [...byPlan].sort((a, b) => b[1] - a[1]);
  const newest = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Users} label="Accounts" value={overview.users} hint={`+${overview.newUsers} in the last 7 days`} />
        <Kpi icon={CreditCard} label="Paying" value={overview.paying} hint="Active paid subscriptions" />
        <Kpi icon={LayoutGrid} label="Widgets" value={overview.widgets} />
        <Kpi icon={Globe} label="Websites" value={overview.sources} hint="Allowed domains" />
        <Kpi icon={Eye} label="Views this month" value={views} hint="All accounts" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Accounts by plan">
          <ul className="space-y-3">
            {plans.map(([plan, count]) => (
              <li key={plan}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-semibold">{plan}</span>
                  <span className="tabular-nums text-muted">{count.toLocaleString()}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-wash">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(count / Math.max(users.length, 1)) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <MoreLink href="/admin/subscriptions">Manage subscriptions</MoreLink>
        </Panel>

        <Panel title="Newest accounts">
          <ul className="divide-y divide-line/60">
            {newest.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.name}</p>
                  <p className="truncate text-[12px] text-muted">{u.email}</p>
                </div>
                <span className="shrink-0 text-[12px] text-muted">{timeAgo(u.createdAt)}</span>
              </li>
            ))}
          </ul>
          <MoreLink href="/admin/users">All users</MoreLink>
        </Panel>

        <Panel title="Recent billing events">
          {events.length === 0 ? (
            <p className="text-muted">No payment events yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {events.slice(0, 7).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate">{eventLabel(e.type)}</span>
                  <span className="shrink-0 text-[12px] text-muted">{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <MoreLink href="/admin/subscriptions">Billing details</MoreLink>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <p className="flex items-center gap-2 text-[12px] font-semibold text-muted">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-wash text-brand">
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight tabular-nums">{value.toLocaleString()}</p>
      {hint && <p className="mt-0.5 text-[12px] text-hint">{hint}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-card p-5 shadow-card">
      <h2 className="mb-4 font-bold">{title}</h2>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
