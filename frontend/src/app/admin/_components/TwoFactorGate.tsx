"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { LogoMark } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { Spinner } from "@/components/Spinner";

type Status = { enabled: boolean; verified: boolean };
type Session = { user: User; token: string };

/**
 * The admin panel opens only after a 6-digit code from Google Authenticator
 * (or any authenticator app). The first visit sets the app up; after that
 * the code is asked for every 12 hours. The API refuses admin calls without
 * it, so this screen is a convenience, not the lock.
 */
export function TwoFactorGate({ children }: { children: React.ReactNode }) {
  const { token, setSession } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [error, setError] = useState("");
  const asked = useRef(false);

  useEffect(() => {
    if (!token || asked.current) return;
    asked.current = true;
    api<Status>("/auth/2fa", { token })
      .then(async (s) => {
        if (!s.enabled) {
          const r = await api<{ secret: string; uri: string }>("/auth/2fa/setup", { method: "POST", token });
          setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.uri, { width: 220, margin: 1 }) });
        }
        setStatus(s);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load 2-step sign-in."));
  }, [token]);

  if (status?.verified) return <>{children}</>;

  async function submit(code: string) {
    const path = status?.enabled ? "/auth/2fa/verify" : "/auth/2fa/enable";
    const r = await api<Session>(path, { method: "POST", token, body: JSON.stringify({ code }) });
    // The new token carries the check; the admin API accepts it for 12 hours.
    setSession(r.user, r.token);
    setStatus({ enabled: true, verified: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-sand px-4 py-8">
      <div className="w-full max-w-[420px] rounded-3xl bg-card p-7 shadow-panel">
        <div className="flex items-center gap-3">
          <LogoMark className="h-10 w-10 shadow-glow" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">Super admin</p>
            <h1 className="text-lg font-black tracking-tight">
              {!status ? "Checking..." : status.enabled ? "Enter your code" : "Turn on Google Authenticator"}
            </h1>
          </div>
        </div>

        {!status && !error && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" /> One moment...
          </p>
        )}

        {status && !status.enabled && setup && (
          <ol className="mt-5 space-y-4 text-[13.5px] text-ink-soft">
            <li>
              <b className="text-ink">1.</b> Install <b className="text-ink">Google Authenticator</b> on your phone.
            </li>
            <li>
              <b className="text-ink">2.</b> In the app tap <b className="text-ink">+</b>, then{" "}
              <b className="text-ink">Scan a QR code</b>:
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made here */}
              <img src={setup.qr} alt="QR code for Google Authenticator" width={180} height={180} className="mx-auto mt-3 rounded-xl border border-line" />
              <p className="mt-2 text-center text-[12px] text-muted">
                Can&apos;t scan? Enter this key:{" "}
                <code className="select-all break-all font-mono text-[12px] text-ink">
                  {setup.secret.match(/.{1,4}/g)?.join(" ")}
                </code>
              </p>
            </li>
            <li>
              <b className="text-ink">3.</b> Type the 6-digit code the app shows:
            </li>
          </ol>
        )}

        {status?.enabled && (
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
            Open Google Authenticator on your phone and type the 6-digit code for WidgetPop.
          </p>
        )}

        {status && (status.enabled || setup) && (
          <CodeForm onSubmit={submit} label={status.enabled ? "Open admin panel" : "Turn on and continue"} />
        )}

        {error && <p className="mt-5 rounded-xl bg-coral/10 px-4 py-3 text-[13px] text-coral">{error}</p>}

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-dark" /> Asked every 12 hours
          </span>
          <LogoutButton className="font-semibold hover:text-ink">Log out</LogoutButton>
        </div>
      </div>
    </div>
  );
}

/** Six digits; sends itself when the sixth is typed. */
function CodeForm({ onSubmit, label }: { onSubmit: (code: string) => Promise<void>; label: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send(code);
      }}
    >
      <input
        value={code}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(next);
          if (next.length === 6) void send(next);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="••••••"
        aria-label="6-digit code"
        className="w-full rounded-xl border border-line bg-sand px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-brand"
      />
      {error && <p className="mt-2 text-[13px] text-coral">{error}</p>}
      <button
        type="submit"
        disabled={code.length !== 6 || busy}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-brand py-3 text-sm font-bold text-white transition hover:shadow-glow disabled:opacity-50"
      >
        {busy && <Spinner className="h-4 w-4" />} {label}
      </button>
    </form>
  );
}
