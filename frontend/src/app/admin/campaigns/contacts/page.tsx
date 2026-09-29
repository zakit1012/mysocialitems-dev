"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, Plus, Tag, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader } from "@/components/Loader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminTable, SearchBox } from "../../_components/AdminTable";
import { SUPPRESSED, fmt, parsePasted, type AudienceOptions, type Category, type Contact } from "../_lib";
import { CategoryPicker, Modal } from "../_ui";
import { ImportContacts, uploadContacts, type UploadResult } from "./_import";

type Page = { total: number; page: number; pageSize: number; contacts: Contact[] };

export default function ContactsPage() {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [options, setOptions] = useState<AudienceOptions | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  // Search a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const params = new URLSearchParams({ q: search, group, page: String(page) });
    api<Page>(`/admin/mailing/contacts?${params.toString()}`, { token })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load contacts");
      });
    return () => {
      cancelled = true;
    };
  }, [token, search, group, page, reload]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<Category[]>("/admin/mailing/categories", { token }),
      api<AudienceOptions>("/admin/mailing/audience", { token }),
    ])
      .then(([cats, opts]) => {
        setCategories(cats);
        setOptions(opts);
      })
      .catch(() => undefined);
  }, [token, reload]);

  const refresh = useCallback(() => {
    setSelected(new Set());
    setReload((n) => n + 1);
  }, []);

  async function run(action: () => Promise<string>) {
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work");
    }
  }

  const ids = [...selected];
  const shown = data?.contacts ?? [];
  const allOnPage = shown.length > 0 && shown.every((c) => selected.has(c.id));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const groups = useMemo(
    () => [
      ...(options?.segments ?? [{ key: "all", label: "Everyone", count: 0 }]).map((s) => ({ value: s.key, label: s.label })),
      { value: "unsubscribed", label: "Unsubscribed or bounced" },
      ...categories.map((c) => ({ value: `category:${c.id}`, label: `Category: ${c.name}` })),
    ],
    [options, categories],
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-1 flex-wrap gap-2">
            <SearchBox value={query} onChange={setQuery} placeholder="Search name or email" />
            <select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setPage(1);
                setSelected(new Set());
              }}
              aria-label="Show"
              className="mb-4 h-[42px] rounded-xl border border-line bg-card px-3 text-[13px] outline-none focus:border-brand"
            >
              {groups.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] font-semibold hover:bg-sand"
            >
              <UserPlus className="h-4 w-4" /> Add contacts
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-3.5 py-2 text-[13px] font-bold text-white shadow-glow"
            >
              <FileSpreadsheet className="h-4 w-4" /> Import Excel or CSV
            </button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}
        {notice && <p className="mb-4 rounded-xl bg-emerald-wash px-4 py-2.5 text-emerald-dark">{notice}</p>}

        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-wash px-3 py-2 text-[13px]">
            <b>{fmt(selected.size)} selected</b>
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              aria-label="Category"
              className="rounded-lg border border-line bg-white px-2 py-1 outline-none"
            >
              <option value="">Choose a category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!bulkCategory}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ count: number }>("/admin/mailing/contacts/categorize", {
                    method: "POST",
                    token,
                    body: JSON.stringify({ contactIds: ids, categoryId: bulkCategory }),
                  });
                  return `${fmt(r.count)} added to the category.`;
                })
              }
              className="rounded-lg bg-card px-2.5 py-1 font-semibold hover:bg-sand disabled:opacity-50"
            >
              Add to category
            </button>
            <button
              type="button"
              disabled={!bulkCategory}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ count: number }>("/admin/mailing/contacts/categorize", {
                    method: "POST",
                    token,
                    body: JSON.stringify({ contactIds: ids, categoryId: bulkCategory, remove: true }),
                  });
                  return `${fmt(r.count)} taken out of the category.`;
                })
              }
              className="rounded-lg bg-card px-2.5 py-1 font-semibold hover:bg-sand disabled:opacity-50"
            >
              Remove from category
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-card px-2.5 py-1 font-semibold text-coral hover:bg-coral/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}

        {!data ? (
          !error && <Loader label="Loading contacts" />
        ) : (
          <>
            <AdminTable
              head={["", "Contact", "Type", "Categories", "Emails", ""]}
              empty={shown.length === 0}
            >
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-sand/50">
                  <td className="w-8 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.email}`}
                      checked={selected.has(c.id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{c.name || <span className="font-normal text-hint">No name</span>}</p>
                    <p className="text-[12px] text-muted">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.userId ? (
                      <span className="rounded-full bg-brand-wash px-2 py-0.5 text-[11.5px] font-semibold text-brand-dark">
                        Account · {c.plan}
                      </span>
                    ) : (
                      <span className="rounded-full bg-sand px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                        {c.source === "IMPORT" ? "Imported" : "Added"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-[18rem] flex-wrap gap-1">
                      {c.categories.length ? (
                        c.categories.map((cat) => (
                          <span key={cat.id} className="rounded-full border border-line px-2 py-0.5 text-[11.5px]">
                            {cat.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-hint">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.suppressed ? (
                      <span className="text-[12px] font-semibold text-amber-dark">{SUPPRESSED[c.suppressed] ?? c.suppressed}</span>
                    ) : (
                      <span className="text-[12px] font-semibold text-emerald-dark">Subscribed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {c.suppressed === "UNSUBSCRIBED" ? (
                      <span className="text-[11.5px] text-hint" title="Only they can sign up again">
                        Their choice
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void run(async () => {
                            await api("/admin/mailing/contacts/subscription", {
                              method: "POST",
                              token,
                              body: JSON.stringify({ email: c.email, subscribed: Boolean(c.suppressed) }),
                            });
                            return c.suppressed
                              ? `${c.email} gets campaigns again.`
                              : `${c.email} is taken off every campaign.`;
                          })
                        }
                        className="text-[12px] font-semibold text-brand hover:underline"
                      >
                        {c.suppressed ? "Put back" : "Take off"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </AdminTable>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      shown.forEach((c) => (e.target.checked ? next.add(c.id) : next.delete(c.id)));
                      return next;
                    })
                  }
                />
                Select all on this page
              </label>
              <span>
                {fmt(data.total)} contact{data.total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-line bg-card p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 tabular-nums">
                  {page} / {pages}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-line bg-card p-1.5 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <Categories
        categories={categories}
        active={group}
        onPick={(value) => {
          setGroup(value);
          setPage(1);
          setSelected(new Set());
        }}
        onCreate={(name) =>
          run(async () => {
            await api("/admin/mailing/categories", { method: "POST", token, body: JSON.stringify({ name }) });
            return `Category "${name}" made.`;
          })
        }
        onRename={(c, name) =>
          run(async () => {
            await api(`/admin/mailing/categories/${c.id}`, { method: "PATCH", token, body: JSON.stringify({ name }) });
            return `Renamed to "${name}".`;
          })
        }
        onDelete={setDeletingCategory}
      />

      <AddContacts
        open={adding}
        categories={categories}
        token={token}
        onClose={() => setAdding(false)}
        onDone={(r) => {
          setAdding(false);
          setNotice(summary(r));
          refresh();
        }}
      />
      <ImportContacts
        open={importing}
        categories={categories}
        token={token}
        onClose={() => setImporting(false)}
        onDone={(r) => {
          setImporting(false);
          setNotice(summary(r));
          refresh();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={`Delete ${fmt(selected.size)} contact${selected.size === 1 ? "" : "s"}?`}
        message="Added and imported contacts are deleted. Account holders stay: to remove one, delete the account under Users, or use Take off so they get no campaigns."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void run(async () => {
            const r = await api<{ count: number; keptAccounts: number }>("/admin/mailing/contacts/delete", {
              method: "POST",
              token,
              body: JSON.stringify({ ids }),
            });
            return `${fmt(r.count)} deleted.${r.keptAccounts ? ` ${fmt(r.keptAccounts)} account holder${r.keptAccounts === 1 ? "" : "s"} kept.` : ""}`;
          });
        }}
      />
      <ConfirmDialog
        open={Boolean(deletingCategory)}
        danger
        title={`Delete the category "${deletingCategory?.name}"?`}
        message="The contacts in it stay, in their other categories."
        confirmLabel="Delete category"
        onCancel={() => setDeletingCategory(null)}
        onConfirm={() => {
          const c = deletingCategory;
          setDeletingCategory(null);
          if (!c) return;
          if (group === `category:${c.id}`) setGroup("all");
          void run(async () => {
            await api(`/admin/mailing/categories/${c.id}`, { method: "DELETE", token });
            return `Category "${c.name}" deleted.`;
          });
        }}
      />
    </div>
  );
}

function summary(r: UploadResult) {
  const parts = [`${fmt(r.added)} added`];
  if (r.existing) parts.push(`${fmt(r.existing)} ${r.existing === 1 ? "was" : "were"} already there`);
  if (r.invalid) parts.push(`${fmt(r.invalid)} skipped (not valid addresses)`);
  return `${parts.join(", ")}.`;
}

function Categories({
  categories,
  active,
  onPick,
  onCreate,
  onRename,
  onDelete,
}: {
  categories: Category[];
  active: string;
  onPick: (group: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (c: Category, name: string) => Promise<void>;
  onDelete: (c: Category) => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  return (
    <aside className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <p className="flex items-center gap-1.5 font-semibold">
        <Tag className="h-4 w-4 text-brand" /> Your categories
      </p>
      <p className="mt-0.5 text-xs text-muted">Groups you make; account holders are grouped by plan on their own.</p>
      <ul className="mt-3 space-y-0.5">
        {categories.map((c) => (
          <li key={c.id} className="group flex items-center gap-1">
            {editing === c.id ? (
              <form
                className="flex flex-1 gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) void onRename(c, draft.trim());
                  setEditing(null);
                }}
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={60}
                  aria-label="Category name"
                  className="min-w-0 flex-1 rounded-lg border border-brand px-2 py-1 text-[13px] outline-none"
                />
                <button type="submit" className="rounded-lg px-2 text-[12px] font-semibold text-brand">
                  Save
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onPick(`category:${c.id}`)}
                  className={`flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] transition ${
                    active === `category:${c.id}` ? "bg-brand-wash font-semibold text-brand-dark" : "hover:bg-sand"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="ml-2 tabular-nums text-muted">{fmt(c.count)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Rename ${c.name}`}
                  onClick={() => {
                    setEditing(c.id);
                    setDraft(c.name);
                  }}
                  className="rounded p-1 text-hint hover:text-ink"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => onDelete(c)}
                  className="rounded p-1 text-hint hover:text-coral"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
        {!categories.length && <li className="px-2 py-1.5 text-[13px] text-hint">None yet.</li>}
      </ul>
      <form
        className="mt-3 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void onCreate(name.trim());
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="New category"
          aria-label="New category"
          className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
        />
        <button type="submit" aria-label="Make category" className="rounded-lg gradient-brand px-2.5 text-white">
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}

/** Addresses typed or pasted: one person per line, from anywhere. */
function AddContacts({
  open,
  categories,
  token,
  onClose,
  onDone,
}: {
  open: boolean;
  categories: Category[];
  token: string | null;
  onClose: () => void;
  onDone: (r: UploadResult) => void;
}) {
  const [text, setText] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const people = useMemo(() => parsePasted(text), [text]);

  async function add() {
    setBusy(true);
    setError("");
    try {
      const r = await uploadContacts(token, people, categoryIds, newCategory, "MANUAL");
      setText("");
      setCategoryIds([]);
      setNewCategory("");
      onDone(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add them");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add contacts" onClose={onClose}>
      <label className="block">
        <span className="text-[13px] font-semibold">Email addresses</span>
        <span className="block text-xs text-muted">
          One per line. A name can go with it: <code>Sam Lee &lt;sam@example.com&gt;</code> or{" "}
          <code>sam@example.com, Sam Lee</code>. Rows copied from a spreadsheet work too.
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-[12.5px] outline-none focus:border-brand"
        />
      </label>
      <p className="mt-1 text-xs text-muted">{fmt(people.length)} address{people.length === 1 ? "" : "es"} found.</p>
      <div className="mt-4">
        <CategoryPicker
          categories={categories}
          selected={categoryIds}
          onChange={setCategoryIds}
          newName={newCategory}
          onNewName={setNewCategory}
        />
      </div>
      {error && <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-[13px] text-coral">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-sand">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !people.length}
          onClick={() => void add()}
          className="rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Adding..." : `Add ${fmt(people.length)}`}
        </button>
      </div>
    </Modal>
  );
}
