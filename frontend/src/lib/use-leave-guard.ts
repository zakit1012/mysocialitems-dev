"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Asks before throwing away unsaved work. While `active`:
 * - closing or reloading the tab gets the browser's own "leave site?" prompt;
 * - a click on any link inside the app (sidebar, "Back") is held, and
 *   `pending` is set so the page can show its own Save / Leave / Stay dialog;
 * - `guard(action)` does the same for an in-page action, like starting over.
 */
export function useLeaveGuard(active: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    // Capture phase on document: runs before Next's <Link> handler, which
    // React listens for further down, so the navigation never starts.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Other sites: the tab closes this page, and the prompt above covers it.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(() => () => router.push(url.pathname + url.search + url.hash));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, router]);

  const guard = useCallback(
    (action: () => void) => {
      if (active) setPending(() => action);
      else action();
    },
    [active],
  );

  /** Carry on with the held navigation or action. */
  const leave = useCallback(() => {
    const go = pending;
    setPending(null);
    go?.();
  }, [pending]);

  const stay = useCallback(() => setPending(null), []);

  return { asking: pending !== null, guard, leave, stay };
}
