"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

export function PlaceAutocomplete({ onSelect }: Props) {
  const { token } = useAuth();
  const sessionToken = useMemo(
    () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()),
    [],
  );
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

    const handle = setTimeout(async () => {
      setLoading(true);
      setError("");

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
        } catch (e) {
          // Ignore URL parse error
        }
      }

      try {
        const params = new URLSearchParams({
          q: searchQuery,
          sessionToken,
        });
        const results = await api<PlaceSuggestion[]>(
          `/places/autocomplete?${params.toString()}`,
          { token },
        );
        setSuggestions(results);
        setOpen(true);
      } catch (err) {
        setSuggestions([]);
        setError(err instanceof Error ? err.message : "Could not search places");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query, sessionToken, token]);

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
        <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-line bg-white shadow-panel">
          {suggestions.map((item) => (
            <li key={item.placeId}>
              <button
                type="button"
                onClick={() => {
                  skipSearch.current = true;
                  onSelect(item, sessionToken);
                  setSelected(item);
                  setCopied(false);
                  setQuery(item.description);
                  setOpen(false);
                  setSuggestions([]);
                }}
                className="w-full px-4 py-3 text-left hover:bg-sand"
              >
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted">
                  {item.address || item.description}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="mt-3 rounded-2xl border border-line bg-sand p-4">
          <p className="font-semibold">{selected.name}</p>
          <p className="text-sm text-muted">
            {selected.address || selected.description}
          </p>

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
