"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, LayoutGrid, ShieldAlert, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { PlansTab } from "./PlansTab";
import { SubscriptionsTab } from "./SubscriptionsTab";
import { PaypalTab } from "./PaypalTab";

type Overview = {
  users: number;
  widgets: number;
  sources: number;
  deals: number;
  vouchers: number;
  reviews: number;
  newUsers: number;
  paying: number;
};

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  city: string | null;
  createdAt: string;
  _count: { widgets: number; sources: number; deals: number; vouchers: number };
  subscription: { plan: string; status: string; currentPeriodEnd: string | null } | null;
};

type AdminWidget = {
  id: string;
  placeName: string;
  publicKey: string;
  createdAt: string;
  user: { email: string; name: string };
  sources: { domain: string; hits: number }[];
};

type AdminSource = {
  id: string;
  domain: string;
  hits: number;
  lastSeen: string | null;
  user: { email: string };
  widget: { placeName: string } | null;
};

const TABS = ["Users", "Subscriptions", "Plans", "PayPal", "Widgets", "Sources"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("Users");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [widgets, setWidgets] = useState<AdminWidget[]>([]);
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [o, u, w, s] = await Promise.all([
        api<Overview>("/admin/overview", { token }),
        api<AdminUser[]>("/admin/users", { token }),
        api<AdminWidget[]>("/admin/widgets", { token }),
        api<AdminSource[]>("/admin/sources", { token }),
      ]);
      setOverview(o);
      setUsers(u);
      setWidgets(w);
      setSources(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(id: string, role: string) {
    await api(`/admin/users/${id}/role`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ role }),
    });
    await load();
  }

  if (user && user.role !== "ADMIN") {
    return (
      <div className="rounded-2xl border border-line bg-card p-10 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-coral" />
        <p className="mt-3 font-semibold">Admins only</p>
        <p className="mt-1 text-muted">This page needs an admin account.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-muted">
        <Spinner /> Loading admin data...
      </p>
    );
  }

  if (error) {
    return <p className="rounded-2xl bg-coral/10 px-4 py-3 text-coral">{error}</p>;
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">Admin</h1>
        <p className="mt-1 text-muted">Everything across every account.</p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={<Users className="h-4 w-4" />} label="Users" value={overview?.users} hint={`+${overview?.newUsers ?? 0} this week`} />
        <Kpi icon={<LayoutGrid className="h-4 w-4" />} label="Widgets" value={overview?.widgets} />
        <Kpi icon={<Globe className="h-4 w-4" />} label="Sources" value={overview?.sources} />
        <Kpi label="Paying" value={overview?.paying} />
        <Kpi label="Vouchers" value={overview?.vouchers} />
        <Kpi label="Reviews" value={overview?.reviews} />
      </div>

      <div className="mb-4 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
              tab === t
                ? "gradient-brand text-white"
                : "border border-line bg-card text-ink hover:border-brand/40 hover:text-brand"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        {tab === "Users" && (
          <Table head={["User", "Role", "Plan", "Widgets", "Sources", "Joined"]}>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-[12px] text-muted">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    className="rounded-lg border border-line bg-white px-2 py-1 text-[12.5px] outline-none focus:border-brand"
                  >
                    <option value="USER">USER</option>
                    <option value="MERCHANT">MERCHANT</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{u.subscription?.plan ?? "FREE"}</span>
                  {u.subscription && u.subscription.status !== "ACTIVE" && (
                    <span className="ml-1.5 text-[11.5px] text-coral">{u.subscription.status.toLowerCase()}</span>
                  )}
                </td>
                <td className="px-4 py-3">{u._count.widgets}</td>
                <td className="px-4 py-3">{u._count.sources}</td>
                <td className="px-4 py-3 text-muted">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "Subscriptions" && <SubscriptionsTab token={token} />}
        {tab === "Plans" && <PlansTab token={token} />}
        {tab === "PayPal" && <PaypalTab token={token} />}

        {tab === "Widgets" && (
          <Table head={["Place", "Owner", "Domains", "Key", "Created"]}>
            {widgets.map((w) => (
              <tr key={w.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 font-semibold">{w.placeName}</td>
                <td className="px-4 py-3 text-muted">{w.user.email}</td>
                <td className="px-4 py-3">
                  {w.sources.length === 0 ? (
                    <span className="text-coral">none</span>
                  ) : (
                    w.sources.map((s) => s.domain).join(", ")
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-sand px-1.5 py-0.5 text-[11.5px]">
                    {w.publicKey.slice(0, 14)}…
                  </code>
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(w.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "Sources" && (
          <Table head={["Domain", "Owner", "Widget", "Loads", "Last seen"]}>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 font-semibold">{s.domain}</td>
                <td className="px-4 py-3 text-muted">{s.user.email}</td>
                <td className="px-4 py-3">{s.widget?.placeName ?? "All widgets"}</td>
                <td className="px-4 py-3">{s.hits}</td>
                <td className="px-4 py-3 text-muted">
                  {s.lastSeen ? new Date(s.lastSeen).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-3.5">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value ?? "-"}</p>
      {hint && <p className="text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
          {head.map((h) => (
            <th key={h} className="px-4 py-3 font-bold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
