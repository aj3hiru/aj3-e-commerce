"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Receipt, User, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "order" | "customer" | "receipt";
  id: number | string;
  title: string;
  sub: string;
  url: string;
}

const TYPE_ICONS = { order: Receipt, customer: User, receipt: FileText };

export function GlobalSearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        setResults(data);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function selectResult(r: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(r.url);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="w-10 h-10 rounded-lg flex items-center justify-center text-admin-gray-600 hover:bg-admin-gray-100"
        aria-label="Search"
        onClick={() => setOpen((o) => !o)}
      >
        <Search className="w-[1.125rem] h-[1.125rem]" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-admin-gray-200 rounded-lg shadow-lg z-50 p-2">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search orders, customers, receipts…"
            className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm mb-1"
          />
          {loading && <div className="text-xs text-admin-gray-400 px-2 py-2">Searching…</div>}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="text-xs text-admin-gray-400 px-2 py-2">No results.</div>
          )}
          {results.map((r) => {
            const Icon = TYPE_ICONS[r.type];
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => selectResult(r)}
                className="w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded hover:bg-admin-gray-50"
              >
                <Icon className="w-4 h-4 text-admin-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-admin-gray-400 truncate">{r.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
