"use client";

import { useSyncExternalStore } from "react";

/** Whether this browser's clock is on Indian time - our signal for "a customer in India". */
export function isIndiaTimeZone(): boolean {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone === "Asia/Kolkata" || zone === "Asia/Calcutta";
  } catch {
    return false;
  }
}

const noSubscribe = () => () => undefined;

/**
 * Hydration-safe India check: false while the server renders and on the
 * first client render (so both agree), then the real answer. UPI is
 * mentioned only when it is true; nobody else sees any of it.
 */
export function useInIndia(): boolean {
  return useSyncExternalStore(noSubscribe, isIndiaTimeZone, () => false);
}
