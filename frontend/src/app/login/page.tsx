"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { HOSTS, SITE } from "@/lib/site";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { TextField } from "@/components/TextField";
import { Loader } from "@/components/Loader";

/** Where signing in leads: the admin panel on its own host, else the dashboard. */
function homePath() {
  const onAdminHost = HOSTS.admin !== HOSTS.app && window.location.host === HOSTS.admin;
  return onAdminHost ? "/admin" : "/dashboard";
}

function LoginForm() {
  const { user, login, requestLoginCode, loginWithCode } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  function nextPath() {
    return searchParams.get("next") || homePath();
  }

  // The marketing site cannot see a session on the app's host, so its
  // "Log in" also brings people who are signed in already: send them on.
  useEffect(() => {
    if (user) router.replace(searchParams.get("next") || homePath());
  }, [user, router, searchParams]);

  async function onPasswordLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      router.push(nextPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  async function sendCode() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await requestLoginCode(email);
      setCodeSent(true);
      // Same words whether or not the email has an account (the API does not say).
      setInfo(`If an account exists for ${email.trim()}, we sent a 6-digit login code to it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await loginWithCode(email, code);
      router.push(nextPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in with email and password, or get a login code by email."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-semibold text-brand">
            Create a free account
          </Link>
          <span className="mt-2 block text-xs">
            Trouble signing in?{" "}
            <a href={`mailto:${SITE.supportEmail}`} className="underline hover:text-brand">
              {SITE.supportEmail}
            </a>
          </span>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 rounded-xl bg-sand p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setError("");
          }}
          className={`rounded-lg py-2.5 ${mode === "password" ? "bg-white text-ink shadow-sm" : "text-muted"}`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("code");
            setError("");
          }}
          className={`rounded-lg py-2.5 ${mode === "code" ? "bg-white text-ink shadow-sm" : "text-muted"}`}
        >
          Email code
        </button>
      </div>

      {mode === "password" ? (
        <form onSubmit={onPasswordLogin} className="space-y-4">
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button type="submit" loading={busy}>
            Log in
          </Button>
        </form>
      ) : (
        <form
          onSubmit={codeSent ? onVerifyCode : (event) => {
            event.preventDefault();
            void sendCode();
          }}
          className="space-y-4"
        >
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
          {codeSent && (
            <TextField
              label="Login code"
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
          )}
          {info && <p className="text-sm text-brand">{info}</p>}
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button type="submit" loading={busy}>
            {codeSent ? "Verify and log in" : "Send login code"}
          </Button>
          {codeSent && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode()}
              className="w-full text-sm font-medium text-brand disabled:opacity-50"
            >
              Resend code
            </button>
          )}
        </form>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<Loader full />}
    >
      <LoginForm />
    </Suspense>
  );
}
