"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Send, Users } from "lucide-react";

const TABS = [
  { href: "/admin/campaigns", label: "Campaigns", icon: Send },
  { href: "/admin/campaigns/contacts", label: "Contacts", icon: Users },
  { href: "/admin/campaigns/templates", label: "Templates", icon: FileText },
];

/** Campaigns, Contacts and Templates: the three parts of email campaigns. */
export function CampaignTabs() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin/campaigns"
      ? pathname === href || /^\/admin\/campaigns\/(?!contacts|templates)[^/]+$/.test(pathname)
      : pathname.startsWith(href);
  return (
    <nav className="mb-5 flex w-fit gap-1 rounded-xl border border-line bg-card p-1 shadow-sm" aria-label="Email campaigns">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href) ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
            active(t.href) ? "gradient-brand text-white shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          <t.icon className="h-4 w-4" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
