"use client";

import { useEffect } from "react";

/**
 * The last resort, when the root layout itself breaks. It replaces the whole
 * document, without the site's styles, so everything it needs is inline.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#F8FAFC",
          color: "#1E293B",
          font: "16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
        }}
      >
        <title>Something went wrong | WidgetPop</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Something went wrong</h1>
          <p style={{ margin: 0, color: "#64748B" }}>
            WidgetPop ran into a problem loading this page. Your widgets, plan and payments are safe. Please try
            again; if it keeps happening, write to support@widgetpop.com.
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                height: 44,
                padding: "0 20px",
                border: 0,
                borderRadius: 12,
                background: "#0096D6",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A full page load, not a client navigation: the app itself is what broke. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                height: 44,
                padding: "0 20px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 12,
                border: "1px solid #E2E8F0",
                color: "#1E293B",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
