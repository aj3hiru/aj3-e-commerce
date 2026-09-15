"use client";

import { useState, useCallback } from "react";
import type { PosProduct } from "@/types/pos";

export function useProductScan(allProducts: PosProduct[], onFound: (p: PosProduct) => void) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);

  const onInput = useCallback(
    (val: string) => {
      setValue(val);
      const q = val.trim().toLowerCase();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      const matches = allProducts
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.sku ?? "").toLowerCase().includes(q) ||
            (p.barcode ?? "").includes(q)
        )
        .slice(0, 8);
      setResults(matches);
    },
    [allProducts]
  );

  /** Enter key: exact barcode/SKU/id match first (what a scanner gun sends),
   *  otherwise fall back to first name-match — mirrors the PHP scanInput 'keydown' handler. */
  const onEnter = useCallback(() => {
    const val = value.trim();
    if (!val) return;

    const exact = allProducts.find((p) => p.barcode === val || p.sku === val || String(p.id) === val);
    if (exact) {
      onFound(exact);
      setValue("");
      setResults([]);
      return;
    }

    const q = val.toLowerCase();
    const match = allProducts.find((p) => p.name.toLowerCase().includes(q));
    if (match) {
      onFound(match);
      setValue("");
      setResults([]);
    } else {
      alert(`No product found for "${val}".`);
    }
  }, [value, allProducts, onFound]);

  const selectResult = useCallback(
    (p: PosProduct) => {
      onFound(p);
      setValue("");
      setResults([]);
    },
    [onFound]
  );

  return { value, results, onInput, onEnter, selectResult, setValue };
}
