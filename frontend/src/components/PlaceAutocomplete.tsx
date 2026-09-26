"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BrowserPlaceSearch, browserPlacesEnabled } from "@/lib/googlePlaces";
import { Spinner } from "./Spinner";
import { fieldClass } from "./TextField";

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
  description: string;
};

type Props = {
  onSelect: (place: PlaceSuggestion, sessionToken: string) => void;
};

/**
 * A pasted Google Maps link (or a raw id) already names one exact place. A
 * fresh text search on its name can land on a different pin with the same
 * or a similar name - a parking lot, a gate, a langar hall next to the real
 * place - so the real id is used directly instead, whenever we can read one.
 */
function extractPlaceId(raw: string): string | null {
  const text = raw.trim();
  // The long share URL carries it as the "!19s<id>" data segment; the short
  // form we build ourselves (maps_link in the review engine) as
  // "q=place_id:<id>". Google's ids from the Places API start with "ChIJ".
  const embedded = /(?:!19s|place_id:)(ChIJ[\w-]+)/.exec(text);
  if (embedded) return embedded[1];
  // The id pasted on its own, with nothing else around it.
  return /^ChIJ[\w-]{10,}$/.test(text) ? text : null;
}

export function PlaceAutocomplete({ onSelect }: Props) {
  const { token } = useAuth();
  const sessionToken = useMemo(
    () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()),
    [],
  );
  const browserSearch = useMemo(
    () => (browserPlacesEnabled ? new BrowserPlaceSearch() : null),
    [],
  );
  // Whether the suggestions on screen came from the browser search. Only a
  // backend search shares its session token with the backend's own details
  // call when the widget is saved.
  const fromBrowser = useRef(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<PlaceSuggestion | null>(null);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    if (query.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // A slow answer to "ab" must not replace the answer to "abc" that came
    // back first.
    let stale = false;

    const handle = setTimeout(async () => {
      setLoading(true);
      setError("");

      const exactId = extractPlaceId(query);
      if (exactId) {
        fromBrowser.current = false;
        // Skip the name search entirely - it is not needed and can only
        // pick the wrong pin. sessionToken is left out on purpose: it pairs
        // an autocomplete search with the details call that follows it, and
        // here there is no search to pair with.
        try {
          const details = await api<{ placeId: string; name: string; address: string }>(
            `/places/details?placeId=${encodeURIComponent(exactId)}`,
            { token },
          );
          if (stale) return;
          setSuggestions([
            {
              ...details,
              description: [details.name, details.address].filter(Boolean).join(", "),
            },
          ]);
          setOpen(true);
        } catch (err) {
          if (stale) return;
          setSuggestions([]);
          setError(err instanceof Error ? err.message : "Could not look up that place");
        } finally {
          if (!stale) setLoading(false);
        }
        return;
      }

      let searchQuery = query.trim();
      if (searchQuery.startsWith("http")) {
        try {
          const url = new URL(searchQuery);
          if (url.pathname.startsWith("/maps/place/")) {
            const parts = url.pathname.split("/");
            if (parts[3]) {
              const placeName = decodeURIComponent(parts[3]).replace(/\+/g, " ");
              searchQuery = placeName;
            }
          }
        } catch {
          // Ignore URL parse error
        }
      }

      try {
        let results: PlaceSuggestion[] | null = null;
        if (browserSearch) {
          try {
            results = await browserSearch.search(searchQuery);
            fromBrowser.current = true;
          } catch (err) {
            // A wrong key or referrer setup should not leave search broken;
            // the backend route still works, just slower.
            console.warn("Browser place search failed, using the backend", err);
          }
        }
        if (!results) {
          const params = new URLSearchParams({
            q: searchQuery,
            sessionToken,
          });
          results = await api<PlaceSuggestion[]>(
            `/places/autocomplete?${params.toString()}`,
            { token },
          );
          fromBrowser.current = false;
        }
        if (stale) return;
        setSuggestions(results);
        setOpen(true);
      } catch (err) {
        if (stale) return;
        setSuggestions([]);
        setError(err instanceof Error ? err.message : "Could not search places");
      } finally {
        if (!stale) setLoading(false);
      }
    }, browserSearch ? 150 : 300);

    return () => {
      stale = true;
      clearTimeout(handle);
    };
  }, [query, sessionToken, token, browserSearch]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder="Search name, address, or paste a Google Maps URL"
          className={`${fieldClass} pr-10`}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand">
            <Spinner />
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-coral">{error}</p>}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-line bg-white shadow-panel">
          {suggestions.map((item) => (
            <li key={item.placeId}>
              <button
                type="button"
                onClick={() => {
                  skipSearch.current = true;
                  if (fromBrowser.current) {
                    browserSearch?.finish(item.placeId);
                    onSelect(item, "");
                  } else {
                    onSelect(item, sessionToken);
                  }
                  setSelected(item);
                  setCopied(false);
                  setQuery(item.description);
                  setOpen(false);
                  setSuggestions([]);
                }}
                className="w-full px-4 py-3 text-left hover:bg-sand"
              >
                <p className="font-medium">{item.name}</p>
                {item.address ? (
                  <p className="text-sm text-muted">{item.address}</p>
                ) : null}
              </button>
            </li>
          ))}
          {/* Google's terms: predictions shown without a map carry its attribution. */}
          <li className="sticky bottom-0 border-t border-line bg-white px-4 py-2 text-right text-[11px] text-muted" aria-label="Results from Google Maps">
            <span style={{ fontFamily: "Roboto, Arial, sans-serif" }}>Google Maps</span>
          </li>
        </ul>
      )}

      {selected && (
        <div className="mt-3 rounded-2xl border border-line bg-sand p-4">
          <p className="font-semibold">{selected.name}</p>
          {selected.address ? (
            <p className="text-sm text-muted">{selected.address}</p>
          ) : null}

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Place ID
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm">
              {selected.placeId}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(selected.placeId)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium transition hover:border-brand/40 hover:text-brand-dark"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-brand" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
