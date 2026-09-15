"use client";

import { useState, useCallback } from "react";
import type { PosCustomer } from "@/types/pos";

export function useCustomerSearch(allCustomers: PosCustomer[]) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [matched, setMatched] = useState(false);
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const clearMatch = useCallback(() => {
    setCustomerId(null);
    setMatched(false);
  }, []);

  const onPhoneChange = useCallback(
    (value: string) => {
      setPhone(value);
      clearMatch();
      setResults([]);
      setHighlightIndex(-1);
      if (value.trim().length < 4) return;

      const q = value.trim();
      const exact = allCustomers.find((c) => (c.phone ?? "") === q);
      if (exact) {
        setCustomerId(exact.id);
        setName(exact.name);
        setMatched(true);
        return;
      }

      const matches = allCustomers.filter((c) => (c.phone ?? "").includes(q)).slice(0, 6);
      setResults(matches);
    },
    [allCustomers, clearMatch]
  );

  const selectCustomer = useCallback((c: PosCustomer) => {
    setCustomerId(c.id);
    setName(c.name);
    setPhone(c.phone ?? "");
    setMatched(true);
    setResults([]);
    setHighlightIndex(-1);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (highlightIndex >= 0) {
          e.preventDefault();
          selectCustomer(results[highlightIndex]);
        }
      } else if (e.key === "Escape") {
        setResults([]);
        setHighlightIndex(-1);
      }
    },
    [results, highlightIndex, selectCustomer]
  );

  const reset = useCallback(() => {
    setPhone("");
    setName("");
    setCustomerId(null);
    setMatched(false);
    setResults([]);
    setHighlightIndex(-1);
  }, []);

  const preselect = useCallback((c: PosCustomer) => {
    setCustomerId(c.id);
    setName(c.name);
    setPhone(c.phone ?? "");
  }, []);

  return {
    phone,
    name,
    setName,
    customerId,
    matched,
    results,
    highlightIndex,
    onPhoneChange,
    selectCustomer,
    onKeyDown,
    reset,
    preselect,
  };
}
