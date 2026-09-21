"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { TextField } from "@/components/TextField";

export default function RegisterPage() {
  const { requestSignup, verifySignup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  function backToEdit() {
    setPendingEmail("");
    setCode("");
    setError("");
    setInfo("");
    setBusy(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await requestSignup({
        name: form.name,
        email: form.email,
        password: form.password,
      });
      setPendingEmail(form.email);
      setInfo("Enter the 6-digit code sent to this email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start signup");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifySignup(pendingEmail, code);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    setBusy(true);
    try {
      await requestSignup({
        name: form.name,
        email: pendingEmail || form.email,
        password: form.password,
      });
      setInfo("A new code was sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={pendingEmail ? "Verify your email" : "Create account"}
      subtitle={
        pendingEmail
          ? "Wrong email? Go back and edit it before verifying."
          : "Sign up with your email and password, then verify the code."
      }
      footer={
        <>
          Already a member?{" "}
          <Link href="/login" className="font-semibold text-brand">
            Log in
          </Link>
        </>
      }
    >
      {!pendingEmail ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <TextField
            label="Full name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your name"
          />
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@email.com"
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 6 characters"
          />
          <PasswordField
            label="Confirm password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={6}
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            placeholder="Re-enter password"
            error={passwordMismatch ? "Passwords do not match" : undefined}
          />
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button type="submit" loading={busy} disabled={passwordMismatch}>
            Send verification code
          </Button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="space-y-4">
          <button
            type="button"
            onClick={backToEdit}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            <ArrowLeft className="h-4 w-4" />
            Back, edit email
          </button>

          <div className="rounded-xl border border-amber/20 bg-amber-wash px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Code sent to
            </p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <p className="break-all text-[15px] font-medium text-ink">
                {pendingEmail}
              </p>
              <button
                type="button"
                onClick={backToEdit}
                className="shrink-0 text-sm font-semibold text-brand"
              >
                Edit
              </button>
            </div>
          </div>

          {info && <p className="text-sm text-brand">{info}</p>}

          <TextField
            label="Verification code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            className="tracking-[0.35em]"
          />
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button type="submit" loading={busy}>
            Verify and create account
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="w-full text-sm font-medium text-brand disabled:opacity-50"
          >
            Resend code
          </button>
        </form>
      )}
    </AuthShell>
  );
}
