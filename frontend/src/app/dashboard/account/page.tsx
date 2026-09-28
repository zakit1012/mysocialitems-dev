"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Trash2, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Spinner } from "@/components/Spinner";
import { Loader } from "@/components/Loader";
import { useCooldown } from "@/lib/use-cooldown";
import { siteHref } from "@/lib/site";

type Session = { user: User; token: string };
type Flash = { ok: boolean; text: string } | null;

const field =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] font-normal text-ink outline-none transition focus:border-brand";
const label = "block text-[12.5px] font-semibold text-muted";
const primary =
  "inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:shadow-glow disabled:opacity-50";

/**
 * The signed-in user's own account: name, password, and deleting it. The
 * email is shown, never changed: the account and its billing belong to it.
 */
export default function AccountPage() {
  const { user } = useAuth();
  if (!user) {
    return (
      <Loader label="Loading your account" />
    );
  }
  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">Account</h1>
        <p className="mt-1 text-muted">Your name and password, and your account itself.</p>
      </header>
      <div className="space-y-6">
        <ProfileCard user={user} />
        <PasswordCard email={user.email} />
        <DeleteCard email={user.email} isAdmin={user.role === "ADMIN"} />
      </div>
    </div>
  );
}

function Card({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-wash text-brand">{icon}</span>
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="text-[13px] text-muted">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Note({ flash }: { flash: Flash }) {
  if (!flash) return null;
  return (
    <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${flash.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
      {flash.text}
    </p>
  );
}

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

function ProfileCard({ user }: { user: User }) {
  const { token, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const saved = await api<User>("/account/profile", { method: "PATCH", token, body: JSON.stringify({ name }) });
      updateUser(saved);
      setFlash({ ok: true, text: "Saved." });
    } catch (err) {
      setFlash({ ok: false, text: message(err, "Could not save") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={<UserRound className="h-4.5 w-4.5" />} title="Profile" hint="The name on your emails and receipts.">
      <div className="mb-4">
        <p className={label}>Email</p>
        <p className="mt-1 text-[13.5px] font-medium text-ink">{user.email}</p>
        <p className="mt-0.5 text-[12px] text-muted">You sign in with this email. It cannot be changed.</p>
      </div>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-[220px] flex-1`}>
          Name
          <input className={field} value={name} minLength={2} maxLength={80} required onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className={primary} disabled={busy || name.trim() === user.name}>
          {busy && <Spinner />} Save
        </button>
      </form>
      <Note flash={flash} />
    </Card>
  );
}

const noPasswords = { current: "", code: "", next: "", again: "" };

function PasswordCard({ email }: { email: string }) {
  const { token, setSession } = useAuth();
  // "code" once they forgot the current password: a code to their email stands in for it.
  const [mode, setMode] = useState<"current" | "code">("current");
  const [form, setForm] = useState(noPasswords);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  // Matches the API's 30 seconds between codes to one address.
  const [wait, startWait] = useCooldown(30);
  const mismatch = form.again.length > 0 && form.next !== form.again;

  async function sendCode() {
    setSending(true);
    setFlash(null);
    try {
      await api("/account/password/code", { method: "POST", token });
      setMode("code");
      startWait();
      setFlash({ ok: true, text: `We sent a 6-digit code to ${email}. Enter it with your new password.` });
    } catch (err) {
      setFlash({ ok: false, text: message(err, "Could not send the code") });
    } finally {
      setSending(false);
    }
  }

  function cancel() {
    setMode("current");
    setForm(noPasswords);
    setFlash(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setFlash(null);
    try {
      const r =
        mode === "code"
          ? await api<Session>("/account/password/reset", {
              method: "POST",
              token,
              body: JSON.stringify({ code: form.code, newPassword: form.next }),
            })
          : await api<Session>("/account/password", {
              method: "POST",
              token,
              body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
            });
      // This device keeps working with the fresh token; every other one is signed out.
      setSession(r.user, r.token);
      setMode("current");
      setForm(noPasswords);
      setFlash({ ok: true, text: "Password changed. Every other device has been signed out." });
    } catch (err) {
      setFlash({ ok: false, text: message(err, "Could not change the password") });
    } finally {
      setBusy(false);
    }
  }

  const link = "text-[13px] font-medium text-brand hover:underline disabled:text-muted disabled:no-underline";

  return (
    <Card
      icon={<KeyRound className="h-4.5 w-4.5" />}
      title="Password"
      hint={mode === "code" ? `Forgot it? Use the code we emailed to ${email}.` : "Changing it signs you out everywhere else."}
    >
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
        {mode === "current" ? (
          <label className={label}>
            Current password
            <input className={field} type="password" required autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          </label>
        ) : (
          <label className={label}>
            Code from your email
            <input
              className={`${field} tracking-[0.3em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              placeholder="000000"
            />
          </label>
        )}
        <label className={label}>
          New password
          <input className={field} type="password" required minLength={6} maxLength={72} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} placeholder="6+ characters" />
        </label>
        <label className={label}>
          Repeat new password
          <input className={field} type="password" required autoComplete="new-password" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} />
        </label>
        {mismatch && <p className="text-[13px] text-coral sm:col-span-3">The new passwords do not match.</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-3">
          <button type="submit" className={primary} disabled={busy || mismatch || (mode === "code" && form.code.length !== 6)}>
            {busy && <Spinner />} {mode === "code" ? "Set new password" : "Change password"}
          </button>
          {mode === "current" ? (
            <button type="button" onClick={() => void sendCode()} disabled={sending} className={link}>
              {sending ? "Sending a code..." : "Forgot your current password?"}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void sendCode()} disabled={sending || wait > 0} className={link}>
                {wait > 0 ? `Resend code in ${wait}s` : sending ? "Sending..." : "Resend code"}
              </button>
              <button type="button" onClick={cancel} className="text-[13px] font-medium text-muted hover:text-ink">
                Cancel
              </button>
            </>
          )}
        </div>
      </form>
      <Note flash={flash} />
    </Card>
  );
}

function DeleteCard({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const { token, logout } = useAuth();
  // A code to the account's email, not the password: a shared password
  // must not be enough to delete the account.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  // Matches the API's 30 seconds between codes to one address.
  const [wait, startWait] = useCooldown(30);

  async function sendCode() {
    setSending(true);
    setFlash(null);
    try {
      await api("/account/delete/code", { method: "POST", token });
      setCodeSent(true);
      startWait();
      setFlash({ ok: true, text: `We sent a 6-digit code to ${email}. It works for 10 minutes.` });
    } catch (err) {
      setFlash({ ok: false, text: message(err, "Could not send the code") });
    } finally {
      setSending(false);
    }
  }

  async function remove(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      await api("/account", { method: "DELETE", token, body: JSON.stringify({ code }) });
      logout();
      window.location.assign(siteHref("/"));
    } catch (err) {
      setFlash({ ok: false, text: message(err, "Could not delete the account") });
      setBusy(false);
    }
  }

  function cancel() {
    setCodeSent(false);
    setCode("");
    setFlash(null);
  }

  return (
    <section className="rounded-2xl border border-coral/30 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral/10 text-coral">
          <Trash2 className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-bold text-coral">Delete account</h2>
          <p className="text-[13px] text-muted">
            Deletes your widgets, domains and settings, and cancels any subscription at once - you are not charged
            again. Widgets stop showing on your website. This cannot be undone.
          </p>
        </div>
      </div>
      {isAdmin ? (
        <p className="text-[13px] text-muted">Admin accounts cannot be deleted here. Make another account admin first, then remove your admin role.</p>
      ) : !codeSent ? (
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-lg border border-coral/40 px-4 py-2 text-[13px] font-semibold text-coral transition hover:bg-coral/10 disabled:opacity-50"
        >
          {sending ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete my account
        </button>
      ) : (
        <form onSubmit={remove} className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-44`}>
            Code from your email
            <input
              className={`${field} tracking-[0.3em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-coral-dark disabled:opacity-40"
          >
            {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete account
          </button>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={sending || wait > 0}
            className="px-1 py-2 text-[13px] font-medium text-brand disabled:text-muted"
          >
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </button>
          <button type="button" onClick={cancel} className="px-1 py-2 text-[13px] font-medium text-muted hover:text-ink">
            Cancel
          </button>
        </form>
      )}
      <Note flash={flash} />
    </section>
  );
}
