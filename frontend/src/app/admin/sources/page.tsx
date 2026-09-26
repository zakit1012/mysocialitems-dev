"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { AdminTable, SearchBox } from "../_components/AdminTable";

type AdminSource = {
  id: string;
  domain: string;
  hits: number;
  lastSeen: string | null;
  user: { email: string };
  widget: { placeName: string } | null;
};

export default function AdminSourcesPage() {
  const { token } = useAuth();
  const [sources, setSources] = useState<AdminSource[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<AdminSource[]>("/admin/sources", { token })
      .then((rows) => {
        if (!cancelled) setSources(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load websites");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const q = query.trim().toLowerCase();
  const shown = (sources ?? []).filter((s) => !q || s.domain.includes(q) || s.user.email.toLowerCase().includes(q));

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search domain or owner" />
      {error && <p className="mb-4 rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}
      {!sources ? (
        <p className="flex items-center gap-2 text-muted">
          <Spinner /> Loading...
        </p>
      ) : (
        <AdminTable head={["Domain", "Owner", "Widget", "Loads", "Last seen"]} empty={shown.length === 0}>
          {shown.map((s) => (
            <tr key={s.id} className="border-b border-line/60 last:border-0 hover:bg-sand/50">
              <td className="px-4 py-3 font-semibold">{s.domain}</td>
              <td className="px-4 py-3 text-muted">{s.user.email}</td>
              <td className="px-4 py-3">{s.widget?.placeName ?? "All widgets"}</td>
              <td className="px-4 py-3 tabular-nums">{s.hits.toLocaleString()}</td>
              <td className="px-4 py-3 text-muted">{s.lastSeen ? new Date(s.lastSeen).toLocaleString() : "never"}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
