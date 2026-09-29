"use client";

import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Signed in, but WidgetPop cannot be reached (no internet, or a restart
 * that takes a minute). Nobody is logged out: this waits, retries by itself,
 * and the page carries on as soon as the server answers.
 */
export function Unreachable() {
  const { retry } = useAuth();
  const [trying, setTrying] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sand px-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-wash text-brand" aria-hidden>
        <WifiOff className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-black tracking-tight">Can&apos;t reach WidgetPop right now</h1>
      <p className="mt-2 max-w-md text-muted">
        Check your internet connection. If it is fine, WidgetPop may be updating; we keep trying and pick up where you
        left off. You are still signed in.
      </p>
      <button
        type="button"
        disabled={trying}
        onClick={() => {
          setTrying(true);
          retry();
          window.setTimeout(() => setTrying(false), 3000);
        }}
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl gradient-brand px-5 text-sm font-semibold text-white transition hover:shadow-glow disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${trying ? "animate-spin" : ""}`} /> {trying ? "Trying..." : "Try again"}
      </button>
    </div>
  );
}
