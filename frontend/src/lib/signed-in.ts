"use client";

import { HOSTS, SITE } from "./site";

/**
 * A note that someone is signed in, for the marketing site. The sign-in
 * itself is kept in the app host's storage (app.widgetpop.com), which
 * widgetpop.com cannot read; this cookie is shared by every WidgetPop host.
 * It holds no token and signs nobody in - only that someone is signed in,
 * and their first name for the header.
 */
const COOKIE = "wp_signed_in";
/** As long as a sign-in lasts without a visit. */
const WEEK = 7 * 24 * 60 * 60;

const listeners = new Set<() => void>();

/** The host that keeps the sign-in: the app's, or the only one in development. */
function keepsSignIn() {
  return !HOSTS.app || window.location.host === HOSTS.app;
}

function write(value: string, maxAge: number) {
  // The site's name without a port: a cookie's domain never has one.
  const site = new URL(SITE.url).hostname;
  const host = window.location.hostname;
  const shared = host === site || host.endsWith(`.${site}`) ? `; domain=${site}` : "";
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${shared}${secure}`;
  listeners.forEach((listener) => listener());
}

/** Called on every sign-in and refresh, on the host that keeps it. */
export function noteSignedIn(name: string) {
  if (!keepsSignIn()) return;
  const first = name.trim().split(/\s+/)[0]?.slice(0, 40) || "Account";
  write(encodeURIComponent(first), WEEK);
}

/** Called on sign-out, and when the kept sign-in is gone or refused. */
export function noteSignedOut() {
  if (!keepsSignIn()) return;
  write("", 0);
}

/** The signed-in first name, or null. */
export function readSignedIn(): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) return null;
  try {
    return decodeURIComponent(hit.slice(COOKIE.length + 1)) || null;
  } catch {
    return null;
  }
}

export function subscribeSignedIn(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
