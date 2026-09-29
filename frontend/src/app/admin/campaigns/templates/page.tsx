"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader } from "@/components/Loader";
import { AdminTable } from "../../_components/AdminTable";
import { when, type TemplateSummary } from "../_lib";

export default function TemplatesPage() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api<TemplateSummary[]>("/admin/mailing/templates", { token })
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load templates"));
  }, [token]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">
          A template is the part of the email that changes. Every email keeps the same WidgetPop header and footer,
          with an unsubscribe link.
        </p>
        <Link
          href="/admin/campaigns/templates/new"
          className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white shadow-glow"
        >
          <Plus className="h-4 w-4" /> New template
        </Link>
      </div>
      {error && <p className="mb-4 rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}
      {!templates ? (
        !error && <Loader label="Loading templates" />
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-brand" />
          <p className="mt-3 font-semibold">No templates yet</p>
          <p className="mt-1 text-[13px] text-muted">Write your first email: product news, a new feature or an alert.</p>
          <Link
            href="/admin/campaigns/templates/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white"
          >
            <Plus className="h-4 w-4" /> New template
          </Link>
        </div>
      ) : (
        <AdminTable head={["Template", "Subject", "Last changed", ""]}>
          {templates.map((t) => (
            <tr key={t.id} className="border-b border-line/60 last:border-0 hover:bg-sand/50">
              <td className="px-4 py-3 font-semibold">
                <Link href={`/admin/campaigns/templates/${t.id}`} className="hover:text-brand">
                  {t.name}
                </Link>
              </td>
              <td className="max-w-[22rem] truncate px-4 py-3 text-muted">{t.subject}</td>
              <td className="px-4 py-3 text-muted">{when(t.updatedAt)}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/campaigns/templates/${t.id}`} className="font-semibold text-brand hover:underline">
                  Edit
                </Link>
                <Link href={`/admin/campaigns?new=${t.id}`} className="ml-4 font-semibold text-brand hover:underline">
                  Send
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
