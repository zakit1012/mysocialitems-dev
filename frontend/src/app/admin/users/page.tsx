"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminTable, SearchBox } from "../_components/AdminTable";
import { Loader } from "@/components/Loader";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  _count: { widgets: number; sources: number };
  subscription: { plan: string; status: string } | null;
};

const ROLES = ["USER", "MERCHANT", "ADMIN"];

export default function AdminUsersPage() {
  const { token, user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  // A change to or from ADMIN waits for a yes.
  const [pending, setPending] = useState<{ user: AdminUser; role: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<AdminUser[]>("/admin/users", { token })
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load users");
      });
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  async function setRole(u: AdminUser, role: string) {
    setError("");
    try {
      await api(`/admin/users/${u.id}/role`, { method: "PATCH", token, body: JSON.stringify({ role }) });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the role");
    }
  }

  const q = query.trim().toLowerCase();
  const shown = (users ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search name or email" />
      {error && <p className="mb-4 rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}
      {!users ? (
        <Loader label="Loading users" />
      ) : (
        <AdminTable head={["User", "Role", "Plan", "Widgets", "Websites", "Joined"]} empty={shown.length === 0}>
          {shown.map((u) => (
            <tr key={u.id} className="border-b border-line/60 last:border-0 hover:bg-sand/50">
              <td className="px-4 py-3">
                <p className="font-semibold">
                  {u.name}
                  {u.id === me?.id && <span className="ml-1.5 text-[11px] font-medium text-brand">you</span>}
                </p>
                <p className="text-[12px] text-muted">{u.email}</p>
              </td>
              <td className="px-4 py-3">
                <select
                  value={u.role}
                  disabled={u.id === me?.id}
                  title={u.id === me?.id ? "You cannot change your own role" : undefined}
                  onChange={(e) => {
                    const role = e.target.value;
                    if (role === "ADMIN" || u.role === "ADMIN") setPending({ user: u, role });
                    else void setRole(u, role);
                  }}
                  className="rounded-lg border border-line bg-white px-2 py-1 text-[12.5px] outline-none focus:border-brand disabled:opacity-60"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3">
                <span className="font-semibold">{u.subscription?.plan ?? "FREE"}</span>
                {u.subscription && u.subscription.status !== "ACTIVE" && (
                  <span className="ml-1.5 text-[11.5px] text-coral">{u.subscription.status.toLowerCase()}</span>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">{u._count.widgets}</td>
              <td className="px-4 py-3 tabular-nums">{u._count.sources}</td>
              <td className="px-4 py-3 text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </AdminTable>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        danger={pending?.role !== "ADMIN"}
        title={pending?.role === "ADMIN" ? `Make ${pending?.user.name} an admin?` : `Remove ${pending?.user.name}'s admin access?`}
        message={
          pending?.role === "ADMIN"
            ? "Admins can see every account, change plans and payment settings."
            : "They lose the admin panel straight away."
        }
        confirmLabel={pending?.role === "ADMIN" ? "Make admin" : "Remove admin"}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void setRole(pending.user, pending.role);
          setPending(null);
        }}
      />
    </div>
  );
}
