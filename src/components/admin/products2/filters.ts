/**
 * Filter state for /admin/ecommerce/products2. Kept out of the "use client"
 * body so the server page can parse the query string too (a function exported
 * from a client module can't be called on the server).
 */
export interface Products2Filters {
  q: string;
  status: "all" | "active" | "inactive";
  stock: "all" | "in" | "out";
  type: string; // "all" | badge slug
  item: string; // "all" | item type slug
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads the filters from a query string (so a refresh keeps them). */
export function parseProducts2Filters(sp: RawParams): Products2Filters {
  const status = first(sp.status);
  const stock = first(sp.stock);
  return {
    q: first(sp.q).slice(0, 100),
    status: status === "active" || status === "inactive" ? status : "all",
    stock: stock === "in" || stock === "out" ? stock : "all",
    type: first(sp.type) || "all",
    item: first(sp.item) || "all",
  };
}
