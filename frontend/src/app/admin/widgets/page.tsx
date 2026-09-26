"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/time";
import { AdminTable, SearchBox } from "../_components/AdminTable";
import { Loader } from "@/components/Loader";

type AdminWidget = {
  id: string;
  placeName: string;
  placeId: string;
  publicKey: string;
  createdAt: string;
  lastSeenAt: string | null;
  lastSeenHost: string | null;
  user: { email: string; name: string };
  sources: { domain: string; hits: number }[];
};

export default function AdminWidgetsPage() {
  const { token } = useAuth();
  const [widgets, setWidgets] = useState<AdminWidget[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<AdminWidget[]>("/admin/widgets", { token })
      .then((rows) => {
        if (!cancelled) setWidgets(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load widgets");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const q = query.trim().toLowerCase();
  const shown = (widgets ?? []).filter(
    (w) => !q || w.placeName.toLowerCase().includes(q) || w.user.email.toLowerCase().includes(q) || w.placeId.toLowerCase().includes(q),
  );

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search business, owner or place ID" />
      {error && <p className="mb-4 rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}
      {!widgets ? (
        <Loader label="Loading widgets" />
      ) : (
        <AdminTable head={["Business", "Owner", "Domains", "Live", "Created"]} empty={shown.length === 0}>
          {shown.map((w) => (
            <tr key={w.id} className="border-b border-line/60 last:border-0 hover:bg-sand/50">
              <td className="px-4 py-3">
                <p className="font-semibold">{w.placeName}</p>
                <p className="max-w-[16rem] truncate font-mono text-[11px] text-muted">{w.placeId}</p>
              </td>
              <td className="px-4 py-3 text-muted">{w.user.email}</td>
              <td className="px-4 py-3">
                {w.sources.length === 0 ? <span className="text-coral">none</span> : w.sources.map((s) => s.domain).join(", ")}
              </td>
              <td className="px-4 py-3">
                {w.lastSeenAt ? (
                  <span className="text-emerald-dark">
                    {w.lastSeenHost ?? "yes"} · {timeAgo(w.lastSeenAt)}
                  </span>
                ) : (
                  <span className="text-amber-dark">not yet</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted">{new Date(w.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
