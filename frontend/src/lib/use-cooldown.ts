"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Seconds left before something may be done again, counting down once a
 * second after start(). Used for "Resend code": the API also refuses a new
 * code to the same address within 30 seconds.
 */
export function useCooldown(seconds: number) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const tick = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(tick);
  }, [left]);

  const start = useCallback(() => setLeft(seconds), [seconds]);
  return [left, start] as const;
}
