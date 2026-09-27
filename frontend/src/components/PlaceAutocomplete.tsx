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
  // The long share URL carries it as the "!19s<id>" data segment, a search
  // link as "query_place_id=<id>", the short form we build ourselves
  // (maps_link in the review engine) as "q=place_id:<id>". Google's ids from
  // the Places API start with "ChIJ".
  const embedded = /(?:!19s|place_id:|query_place_id=)(ChIJ[\w-]+)/.exec(text);
  if (embedded) return embedded[1];
  // The id pasted on its own, with nothing else around it.
  return /^ChIJ[\w-]{10,}$/.test(text) ? text : null;
}

/** A share link from the Google Maps app; the server opens it (see resolve-link). */
const isShortLink = (text: string) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(text.trim());

/** The business a Google Maps link names: /maps/place/<name>/, or ?q= / ?query=. */
function linkName(url: URL): string {
  if (url.pathname.startsWith("/maps/place/")) {
    const part = url.pathname.split("/")[3];
    if (part) {
      try {
        return decodeURIComponent(part).replace(/\+/g, " ");
      } catch {
        return part.replace(/\+/g, " ");
      }
    }
  }
  return url.searchParams.get("q") || url.searchParams.get("query") || "";
}

/**
 * A link that names no place we can read: said straight away instead of
 * searching Google for the link's text, which finds nothing.
 */
function unreadableLink(raw: string): string | null {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "That link looks broken. Copy it again, or type the business name.";
  }
  const host = url.hostname.replace(/^www\./, "");
  if (!/(^|\.)google\.[a-z.]+$/.test(host) || !linkName(url)) {
    return "That link doesn't point to one business. On Google Maps, open the business itself and copy its link, or type the business name.";
  }
  return null;
}

export function PlaceAutocomplete({ onSelect }: Props) {
  const { token } = useAuth();
  // Made once, when the box first appears.
  const [sessionToken] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
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
  // Nothing to pick: no match, or a link we cannot read.
  const [notice, setNotice] = useState("");
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
    // Too short to search (the list was cleared as it was typed).
    if (query.trim().length < 2) return;

    // A slow answer to "ab" must not replace the answer to "abc" that came
    // back first.
    let stale = false;

    const handle = setTimeout(async () => {
      setLoading(true);
      setError("");

      let text = query.trim();
      // A share link from the Maps app: the server opens it to the full
      // Google Maps address, which names the place.
      if (isShortLink(text)) {
        try {
          const resolved = await api<{ url: string }>(
            `/places/resolve-link?url=${encodeURIComponent(text)}`,
            { token },
          );
          if (stale) return;
          text = resolved.url;
        } catch (err) {
          if (stale) return;
          setSuggestions([]);
          setNotice(err instanceof Error ? err.message : "Could not open that short link.");
          setLoading(false);
          return;
        }
      }

      const exactId = extractPlaceId(text);
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

      const badLink = unreadableLink(text);
      if (badLink) {
        setSuggestions([]);
        setNotice(badLink);
        setLoading(false);
        return;
      }

      // A readable Google Maps link: search for the business it names.
      const searchQuery = /^https?:\/\//i.test(text) ? linkName(new URL(text)) : text;

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
        if (!results.length) {
          setNotice(
            `No business found for “${searchQuery}”. Check the spelling, add the city or area, or paste the business's Google Maps link.`,
          );
        }
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
          onChange={(e) => {
            setQuery(e.target.value);
            // New typing: the last search's message no longer applies.
            setNotice("");
            setError("");
            if (e.target.value.trim().length < 2) {
              setSuggestions([]);
              setLoading(false);
            }
          }}
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
      {notice && !error && !loading && (
        <p role="status" className="mt-2 rounded-xl bg-sand px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft">
          {notice}
        </p>
      )}
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
