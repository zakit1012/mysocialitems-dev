"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Loader } from "@/components/Loader";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Hidden = {
  id: string;
  placeId: string;
  author: string;
  textStart: string;
  note: string | null;
  createdAt: string;
};

/**
 * A reviewer asked to stop showing their review: it is hidden from every
 * widget for that place (and from owners' previews) within a minute.
 */
export function HiddenReviewsTab({ token }: { token: string | null }) {
  const [rows, setRows] = useState<Hidden[] | null>(null);
  const [form, setForm] = useState({ placeId: "", author: "", text: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setRows(await api<Hidden[]>("/admin/hidden-reviews", { token }));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    api<Hidden[]>("/admin/hidden-reviews", { token })
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function hide(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/admin/hidden-reviews", { method: "POST", token, body: JSON.stringify(form) });
      setForm({ placeId: "", author: "", text: "", note: "" });
      setMsg({ ok: true, text: "Hidden. Widgets stop showing it within a minute." });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not hide it" });
    } finally {
      setBusy(false);
    }
  }

  const [unhideId, setUnhideId] = useState<string | null>(null);

  async function unhide(id: string) {
    await api(`/admin/hidden-reviews/${id}`, { method: "DELETE", token }).catch(() => undefined);
    await load().catch(() => undefined);
  }

  const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand";

  return (
    <div className="p-4">
      <p className="mb-3 max-w-2xl text-[12.5px] text-muted">
        When a reviewer asks us to stop showing their review, add it here. It disappears from every widget for
        that place. Leave the first words empty to hide every review by that name for the place.
      </p>
      <form onSubmit={hide} className="grid gap-2 md:grid-cols-[1.2fr_1fr_1.4fr_1fr_auto]">
        <input className={`${input} font-mono`} placeholder="Place ID (ChIJ...)" value={form.placeId} onChange={(e) => setForm({ ...form, placeId: e.target.value })} required />
        <input className={input} placeholder="Reviewer name" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} required />
        <input className={input} placeholder="First words of the review (optional)" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
        <input className={input} placeholder="Note, e.g. request date" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-brand px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? <Spinner className="h-3 w-3" /> : <EyeOff className="h-4 w-4" />} Hide
        </button>
      </form>
      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${msg.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>{msg.text}</p>
      )}
      <div className="mt-4 overflow-x-auto">
        {!rows ? (
          <Loader label="Loading hidden reviews" className="py-10" />
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted">No hidden reviews.</p>
        ) : (
          <table className="w-full min-w-[700px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
                {["Place ID", "Reviewer", "Starts with", "Note", "Hidden on", ""].map((h) => (
                  <th key={h} className="px-2 py-2 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[14rem] truncate px-2 py-2 font-mono">{r.placeId}</td>
                  <td className="px-2 py-2 font-semibold">{r.author}</td>
                  <td className="max-w-[16rem] truncate px-2 py-2 text-muted">{r.textStart || "every review"}</td>
                  <td className="max-w-[14rem] truncate px-2 py-2 text-muted">{r.note ?? ""}</td>
                  <td className="px-2 py-2 text-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-2 py-2 text-right">
                    <button type="button" onClick={() => setUnhideId(r.id)} className="rounded-md p-1.5 text-muted hover:bg-coral/10 hover:text-coral" title="Show again">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(unhideId)}
        title="Show this review in widgets again?"
        confirmLabel="Show again"
        onCancel={() => setUnhideId(null)}
        onConfirm={() => {
          const id = unhideId;
          setUnhideId(null);
          if (id) void unhide(id);
        }}
      />
    </div>
  );
}
