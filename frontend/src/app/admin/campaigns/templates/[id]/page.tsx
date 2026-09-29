"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  ChevronLeft,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  Quote,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { Loader } from "@/components/Loader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useLeaveGuard } from "@/lib/use-leave-guard";
import { EmailPreview, type EmailFields } from "../../_ui";
import type { Template } from "../../_lib";

type Form = EmailFields & { name: string };

const STARTER: Form = {
  name: "",
  subject: "",
  preheader: "",
  heading: "",
  content: [
    "Hi {{first_name}},",
    "",
    "We have something new for you.",
    "",
    "## What is new",
    "- **First thing** - what it does for you",
    "- **Second thing** - what it does for you",
    "",
    "> Tip: it is on every plan, including Free.",
    "",
    `[button: Try it now](${SITE.appUrl || SITE.url}/dashboard)`,
    "",
    "Thanks,",
    "The WidgetPop team",
  ].join("\n"),
};

const TOOLS = [
  { key: "heading", label: "Heading", icon: Heading2 },
  { key: "bold", label: "Bold", icon: Bold },
  { key: "italic", label: "Italic", icon: Italic },
  { key: "link", label: "Link", icon: Link2 },
  { key: "button", label: "Button", icon: MousePointerClick },
  { key: "list", label: "List", icon: List },
  { key: "numbered", label: "Numbered list", icon: ListOrdered },
  { key: "box", label: "Highlighted box", icon: Quote },
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "line", label: "Dividing line", icon: Minus },
  { key: "name", label: "Reader's first name", icon: UserRound },
] as const;
type ToolKey = (typeof TOOLS)[number]["key"];

const HELP: [string, string][] = [
  ["## Heading", "a heading (# bigger, ### smaller)"],
  ["**bold**  *italic*", "bold and italic text"],
  ["[text](https://...)", "a link; plain https:// addresses link too"],
  ["[button: Label](https://...)", "a button, on its own line"],
  ["- item  /  1. item", "a list"],
  ["> text", "a highlighted box, for news or an alert"],
  ["![description](https://...png)", "an image from a web address"],
  ["---", "a dividing line"],
  ["{{first_name}}  {{name}}  {{email}}", "the reader's own; \"there\" when a name is missing"],
];

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const { token, user } = useAuth();
  const [form, setForm] = useState<Form | null>(isNew ? STARTER : null);
  const [saved, setSaved] = useState<Form | null>(isNew ? STARTER : null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  // The admin shell only shows this page once the account is loaded.
  const [testTo, setTestTo] = useState(() => user?.email ?? "");
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const content = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!token || isNew) return;
    api<Template>(`/admin/mailing/templates/${id}`, { token })
      .then((t) => {
        const f = { name: t.name, subject: t.subject, preheader: t.preheader, heading: t.heading, content: t.content };
        setForm(f);
        setSaved(f);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the template"));
  }, [token, id, isNew]);

  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const leaveGuard = useLeaveGuard(dirty && !saving);
  const email = useMemo<EmailFields>(
    () => ({
      subject: form?.subject ?? "",
      preheader: form?.preheader ?? "",
      heading: form?.heading ?? "",
      content: form?.content ?? "",
    }),
    [form?.subject, form?.preheader, form?.heading, form?.content],
  );

  if (!form) {
    return error ? <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p> : <Loader label="Loading template" />;
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  /** Replaces the selection (or puts text at the cursor), then selects `pick` inside what was put in. */
  function insert(make: (selected: string) => { text: string; pick?: [number, number] }) {
    const el = content.current;
    if (!el || !form) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const { text, pick } = make(value.slice(start, end));
    set({ content: value.slice(0, start) + text + value.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      const [a, b] = pick ?? [text.length, text.length];
      el.setSelectionRange(start + a, start + b);
    });
  }
  const wrap = (mark: string, placeholder: string) =>
    insert((sel) => {
      const inner = sel || placeholder;
      return { text: `${mark}${inner}${mark}`, pick: [mark.length, mark.length + inner.length] };
    });
  /** A block on its own line(s), with blank lines around it. */
  const block = (text: string, pick?: [number, number]) =>
    insert(() => {
      const el = content.current!;
      const before = el.value.slice(0, el.selectionStart);
      const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      return { text: `${lead}${text}\n`, pick: pick ? [lead.length + pick[0], lead.length + pick[1]] : undefined };
    });
  /** A block whose https:// is selected, ready to paste the address over. */
  const blockWithLink = (text: string) => {
    const at = text.indexOf("https://");
    block(text, [at, at + "https://".length]);
  };
  /** Starts each selected line (or the current one) with `prefix`. */
  const prefixLines = (prefix: (i: number) => string, placeholder: string) => {
    const el = content.current;
    if (!el || !form) return;
    const value = el.value;
    const lineStart = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const end = el.selectionEnd;
    const chunk = value.slice(lineStart, end) || placeholder;
    const next = chunk
      .split("\n")
      .map((line, i) => `${prefix(i)}${line}`)
      .join("\n");
    set({ content: value.slice(0, lineStart) + next + value.slice(Math.max(end, lineStart)) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart + next.length, lineStart + next.length);
    });
  };

  function runTool(key: ToolKey) {
    switch (key) {
      case "heading":
        return prefixLines(() => "## ", "Heading");
      case "bold":
        return wrap("**", "bold text");
      case "italic":
        return wrap("*", "italic text");
      case "link":
        return insert((sel) => {
          const label = sel || "link text";
          const text = `[${label}](https://)`;
          return { text, pick: [label.length + 3, text.length - 1] };
        });
      case "button":
        return blockWithLink("[button: Try it now](https://)");
      case "list":
        return prefixLines(() => "- ", "List item");
      case "numbered":
        return prefixLines((i) => `${i + 1}. `, "List item");
      case "box":
        return prefixLines(() => "> ", "Something to notice");
      case "image":
        return blockWithLink("![Description](https://)");
      case "line":
        return block("---");
      case "name":
        return insert(() => ({ text: "{{first_name}}" }));
    }
  }

  async function save(): Promise<boolean> {
    if (!form) return false;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const t = await api<Template>(isNew ? "/admin/mailing/templates" : `/admin/mailing/templates/${id}`, {
        method: isNew ? "POST" : "PUT",
        token,
        body: JSON.stringify(form),
      });
      setSaved(form);
      setNotice("Saved.");
      if (isNew) router.replace(`/admin/campaigns/templates/${t.id}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!form) return;
    setTesting(true);
    setError("");
    setNotice("");
    try {
      await api("/admin/mailing/test", { method: "POST", token, body: JSON.stringify({ ...form, to: testTo }) });
      setNotice(`Test sent to ${testTo}. It can take a minute to arrive; check spam too.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the test");
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    setRemoving(false);
    try {
      await api(`/admin/mailing/templates/${id}`, { method: "DELETE", token });
      setSaved(form);
      router.push("/admin/campaigns/templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-brand";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/campaigns/templates" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-brand">
          <ChevronLeft className="h-3.5 w-3.5" /> All templates
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && (
            <button
              type="button"
              onClick={() => setRemoving(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-[13px] font-semibold text-coral hover:bg-coral/5"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          {!isNew && !dirty && (
            <Link
              href={`/admin/campaigns?new=${id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-[13px] font-semibold text-ink hover:bg-sand"
            >
              <Send className="h-4 w-4" /> Send as a campaign
            </Link>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (!dirty && !isNew)}
            className="rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white shadow-glow disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? "Saving..." : dirty || isNew ? "Save template" : "Saved"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-emerald-wash px-4 py-2.5 text-emerald-dark">{notice}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-card">
          <label className="block">
            <span className="text-[13px] font-semibold">Template name</span>
            <span className="ml-1.5 text-xs text-muted">only you see it</span>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="September product update" className={`mt-1 ${field}`} />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold">Subject</span>
            <input value={form.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} placeholder="New: carousel autoplay, {{first_name}}" className={`mt-1 ${field}`} />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold">Preview text</span>
            <span className="ml-1.5 text-xs text-muted">optional, shown next to the subject in the inbox</span>
            <input value={form.preheader} onChange={(e) => set({ preheader: e.target.value })} maxLength={200} className={`mt-1 ${field}`} />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold">Heading</span>
            <span className="ml-1.5 text-xs text-muted">optional, the big title at the top</span>
            <input value={form.heading} onChange={(e) => set({ heading: e.target.value })} maxLength={200} className={`mt-1 ${field}`} />
          </label>
          <div>
            <span className="text-[13px] font-semibold">Email</span>
            <div className="mt-1 overflow-hidden rounded-xl border border-line focus-within:border-brand">
              <div className="flex flex-wrap gap-0.5 border-b border-line bg-sand/60 p-1" role="toolbar" aria-label="Formatting">
                {TOOLS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    title={t.label}
                    aria-label={t.label}
                    onClick={() => runTool(t.key)}
                    className="rounded-lg p-1.5 text-muted transition hover:bg-card hover:text-ink"
                  >
                    <t.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <textarea
                ref={content}
                value={form.content}
                onChange={(e) => set({ content: e.target.value })}
                rows={18}
                spellCheck
                className="block w-full resize-y bg-white px-3 py-2.5 font-mono text-[13px] leading-relaxed outline-none"
              />
            </div>
            <details className="mt-2 text-[12.5px]">
              <summary className="cursor-pointer font-medium text-muted hover:text-ink">How to format</summary>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                {HELP.map(([code, what]) => (
                  <div key={code} className="contents">
                    <dt>
                      <code className="rounded bg-sand px-1.5 py-0.5 text-[12px]">{code}</code>
                    </dt>
                    <dd className="text-muted">{what}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>

          <div className="rounded-xl border border-line bg-sand/50 p-3">
            <p className="text-[13px] font-semibold">Send a test</p>
            <p className="text-xs text-muted">See it in a real inbox before anyone else does. Opens are not counted.</p>
            <div className="mt-2 flex gap-2">
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} type="email" placeholder="you@example.com" className={field} />
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={testing || !testTo.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-[13px] font-semibold hover:bg-sand disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {testing ? "Sending..." : "Send test"}
              </button>
            </div>
          </div>
        </div>

        <div className="xl:sticky xl:top-6">
          <EmailPreview email={email} token={token} />
          <p className="mt-2 text-xs text-muted">
            Filled in for you. The header, footer and unsubscribe link are the same in every email.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={removing}
        danger
        title={`Delete "${form.name || "this template"}"?`}
        message="Campaigns already sent with it keep their own copy."
        confirmLabel="Delete template"
        onCancel={() => setRemoving(false)}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={leaveGuard.asking}
        title="Save this template first?"
        message="Your changes are not saved. Leave now and they are lost."
        confirmLabel="Save template"
        cancelLabel="Stay"
        altLabel="Leave without saving"
        onConfirm={async () => {
          if (await save()) leaveGuard.leave();
          else leaveGuard.stay();
        }}
        onCancel={leaveGuard.stay}
        onAlt={leaveGuard.leave}
      />
    </div>
  );
}
