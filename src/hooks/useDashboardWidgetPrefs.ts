"use client";

import { createContext, createElement, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

/** The PHP's own localStorage key, kept so existing saved prefs still apply. */
const PREF_KEY = "ecom_dashboard_widgets";

/** Shape of a Display Options group. Declared so a second dashboard can supply
 *  its own list instead of this file's. */
export interface WidgetGroup {
  group: string;
  groupLabel: string;
  items: readonly { key: string; label: string }[];
}

export const DASHBOARD_WIDGETS = [
  {
    group: "online",
    groupLabel: "Online Platform",
    items: [
      { key: "card-on-total", label: "Total Orders" },
      { key: "card-on-pending", label: "Pending Orders" },
      { key: "card-on-progress", label: "In Progress" },
      { key: "card-on-delivered", label: "Delivered Orders" },
      { key: "card-on-canceled", label: "Canceled Orders" },
      { key: "card-on-custonline", label: "Total Online Customers" },
      { key: "card-on-custoffline", label: "Total Offline Customers" },
    ],
  },
  {
    group: "earnings",
    groupLabel: "Earnings & Due",
    items: [
      { key: "card-earning", label: "Earning" },
      { key: "card-newdue", label: "New Due" },
      { key: "card-duecollection", label: "Due Collection" },
      { key: "card-duepromise", label: "Due Promise" },
      { key: "card-cash", label: "Cash" },
      { key: "card-upi", label: "UPI" },
      { key: "card-card", label: "Card" },
    ],
  },
  {
    group: "overview",
    groupLabel: "Store Overview",
    items: [
      { key: "card-products", label: "Total Products" },
      { key: "card-outofstock", label: "Out of Stock" },
      { key: "card-categories", label: "Total Categories" },
      { key: "card-brands", label: "Total Brands" },
      { key: "card-customers", label: "Customers" },
      { key: "card-newcustomers", label: "New Customers" },
      { key: "card-reviewstoday", label: "Reviews (Period)" },
      { key: "card-reviewstotal", label: "Total Reviews" },
      { key: "card-coupons", label: "Active Coupons" },
    ],
  },
] as const;

/**
 * Verified against the "Display Options (show/hide dashboard sections,
 * remembered per browser)" IIFE at the bottom of dashboard.php — same
 * localStorage key, same default-all-visible behavior.
 *
 * This is a CONTEXT, not a bare hook, and that is load-bearing. The panel that
 * owns the checkboxes and the sections that show/hide are separate components,
 * so two independent `useState` copies would never see each other's writes:
 * ticking a box would update localStorage and the panel, and the dashboard
 * below would not move until the next full page load. The PHP has no such
 * split — its single IIFE calls applyVisibility() straight from the change
 * handler — so one shared store is what reproduces that behaviour.
 */
interface WidgetPrefsValue {
  prefs: Record<string, boolean>;
  isVisible: (key: string) => boolean;
  toggle: (key: string, visible: boolean) => void;
  loaded: boolean;
  allKeys: string[];
  /** The groups the Display Options panel should render. */
  groups: readonly WidgetGroup[];
  /** Section-level keys with no group of their own, listed after the groups. */
  standalone: readonly { key: string; label: string }[];
}

const WidgetPrefsContext = createContext<WidgetPrefsValue | null>(null);

const DEFAULT_STANDALONE = [{ key: "recentorders", label: "Recent Orders" }] as const;

function useWidgetPrefsStore(
  prefKey: string,
  groups: readonly WidgetGroup[],
  standalone: readonly { key: string; label: string }[]
): WidgetPrefsValue {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(prefKey) || "{}");
      setPrefs(saved);
    } catch {
      setPrefs({});
    } finally {
      setLoaded(true);
    }
  }, [prefKey]);

  const isVisible = useCallback((key: string) => prefs[key] !== false, [prefs]);

  const toggle = useCallback(
    (key: string, visible: boolean) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: visible };
        try {
          window.localStorage.setItem(prefKey, JSON.stringify(next));
        } catch {
          /* private mode / blocked storage — the toggle still applies for this page */
        }
        return next;
      });
    },
    [prefKey]
  );

  const allKeys = [
    ...groups.map((g) => g.group),
    ...standalone.map((s) => s.key),
    ...groups.flatMap((g) => g.items.map((i) => i.key)),
  ];

  return { prefs, isVisible, toggle, loaded, allKeys, groups, standalone };
}

/**
 * Wraps a dashboard so its Display Options panel and its sections share one
 * store.
 *
 * `prefKey` and `groups` are parameters because the two dashboards show
 * different widgets. They MUST stay distinct per dashboard: a shared key would
 * mean hiding a card on one page also hid an unrelated card on the other,
 * since visibility is keyed by widget name alone.
 */
export function DashboardWidgetPrefsProvider({
  children,
  prefKey = PREF_KEY,
  groups = DASHBOARD_WIDGETS,
  standalone = DEFAULT_STANDALONE,
}: {
  children: ReactNode;
  prefKey?: string;
  groups?: readonly WidgetGroup[];
  standalone?: readonly { key: string; label: string }[];
}) {
  const value = useWidgetPrefsStore(prefKey, groups, standalone);
  return createElement(WidgetPrefsContext.Provider, { value }, children);
}

export function useDashboardWidgetPrefs(): WidgetPrefsValue {
  const ctx = useContext(WidgetPrefsContext);
  if (!ctx) {
    throw new Error("useDashboardWidgetPrefs must be used inside <DashboardWidgetPrefsProvider>");
  }
  return ctx;
}
