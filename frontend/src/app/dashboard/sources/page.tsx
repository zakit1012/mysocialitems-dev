"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Globe, Info, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";

type Source = {
  id: string;
  domain: string;
  hits: number;
  lastSeen: string | null;
  createdAt: string;
  widget: { id: string; placeName: string } | null;
};

type Widget = { id: string; placeName: string };

export default function SourcesPage() {
  const { token } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [domain, setDomain] = useState("");
  const [widgetId, setWidgetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [s, w] = await Promise.all([
        api<Source[]>("/sources", { token }),
        api<Widget[]>("/widgets", { token }),
      ]);
      setSources(s);
      setWidgets(w);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sources");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api("/sources", {
        method: "POST",
        token,
        body: JSON.stringify({ domain, widgetId: widgetId || undefined }),
      });
      setDomain("");
      setWidgetId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that domain");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name}? Widgets will stop loading there.`)) return;
    await api(`/sources/${id}`, { method: "DELETE", token });
    await load();
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">Sources</h1>
        <p className="mt-1 text-muted">
          The websites your widgets are allowed to run on.
        </p>
      </header>

      <div className="mb-5 flex gap-3 rounded-2xl border border-line bg-brand-wash/60 p-4 text-[13px] leading-relaxed text-ink-soft">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p>
          A widget only loads on the domains listed here. Copy the embed code to
          any other site and it refuses to render. Subdomains are covered
          automatically.
        </p>
      </div>

      <form
        onSubmit={add}
        className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-card"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold">Domain</span>
            <input
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/12"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold">Widget</span>
            <select
              value={widgetId}
              onChange={(e) => setWidgetId(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/12"
            >
              <option value="">All widgets</option>
              {widgets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.placeName}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit" loading={saving} className="sm:w-auto sm:px-5">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        {error && (
          <p className="mt-3 rounded-xl bg-coral/10 px-3.5 py-2.5 text-[13px] text-coral">
            {error}
          </p>
        )}
      </form>

      {loading ? (
        <p className="flex items-center gap-2 text-muted">
          <Spinner /> Loading...
        </p>
      ) : sources.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-wash text-brand">
            <Globe className="h-5 w-5" />
          </span>
          <p className="mt-3 font-semibold">No domains yet</p>
          <p className="mt-1 text-muted">
            Add the website where you want the widget to appear.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-bold">Domain</th>
                <th className="px-4 py-3 font-bold">Widget</th>
                <th className="px-4 py-3 font-bold">Loads</th>
                <th className="px-4 py-3 font-bold">Last seen</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 font-semibold">{s.domain}</td>
                  <td className="px-4 py-3 text-muted">
                    {s.widget ? s.widget.placeName : "All widgets"}
                  </td>
                  <td className="px-4 py-3">{s.hits}</td>
                  <td className="px-4 py-3 text-muted">
                    {s.lastSeen
                      ? new Date(s.lastSeen).toLocaleDateString()
                      : "never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(s.id, s.domain)}
                      aria-label={`Remove ${s.domain}`}
                      className="inline-flex items-center gap-1 text-coral transition hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
