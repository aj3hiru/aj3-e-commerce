"use client";

import { useEffect, useState } from "react";
import { storeOrigin } from "@/lib/hosts";

/** The customers' site origin ("" on the server's first render) — for "View in shop" links on the admin host. */
export function useStoreOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(storeOrigin()), []);
  return origin;
}
