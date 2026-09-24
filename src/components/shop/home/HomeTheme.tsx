"use client";

import { createContext, useContext } from "react";
import { DEFAULT_HOME, type CardOptions } from "@/types/home";

/** Accent colour and product-card options from the Homepage Customizer. */
const Ctx = createContext<{ accent: string; card: CardOptions }>({ accent: DEFAULT_HOME.accent, card: DEFAULT_HOME.card });
export const useHomeTheme = () => useContext(Ctx);

export function HomeTheme({ accent, card, children }: { accent: string; card: CardOptions; children: React.ReactNode }) {
  return (
    <Ctx.Provider value={{ accent, card }}>
      <div style={{ ["--hp-accent" as string]: accent }} className="font-storefront text-[#353543]">{children}</div>
    </Ctx.Provider>
  );
}
