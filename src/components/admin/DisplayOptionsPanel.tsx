"use client";

import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { DASHBOARD_WIDGETS, useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { cn } from "@/lib/utils";

export function DisplayOptionsPanel() {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { isVisible, toggle } = useDashboardWidgetPrefs();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm border border-admin-gray-300 bg-admin-gray-100 hover:bg-admin-gray-200 rounded px-3 py-1.5"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" /> Display Options
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 min-w-[240px] max-h-[70vh] overflow-y-auto bg-white border border-admin-gray-200 rounded-lg shadow-lg p-3 z-20">
          {DASHBOARD_WIDGETS.map((group) => {
            const groupOpen = openGroups[group.group] ?? false;
            return (
              <div key={group.group}>
                <label className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[0.8438rem] hover:bg-admin-gray-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isVisible(group.group)}
                    onChange={(e) => toggle(group.group, e.target.checked)}
                    className="w-[15px] h-[15px] accent-admin-primary"
                  />
                  {group.groupLabel}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenGroups((p) => ({ ...p, [group.group]: !groupOpen }));
                    }}
                    className={cn("ml-auto p-0.5 text-admin-gray-400 transition-transform", groupOpen && "rotate-180")}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </label>
                {groupOpen && (
                  <div className="flex flex-col items-center text-center py-1 bg-admin-gray-50 rounded-md mx-1 mb-1">
                    {group.items.map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center justify-center gap-2.5 pl-6 pr-2.5 py-2 rounded-md text-[0.8438rem] hover:bg-admin-gray-100 cursor-pointer select-none w-full"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible(item.key)}
                          onChange={(e) => toggle(item.key, e.target.checked)}
                          className="w-[15px] h-[15px] accent-admin-primary"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <label className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[0.8438rem] hover:bg-admin-gray-50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isVisible("recentorders")}
              onChange={(e) => toggle("recentorders", e.target.checked)}
              className="w-[15px] h-[15px] accent-admin-primary"
            />
            Recent Orders
          </label>
        </div>
      )}
    </div>
  );
}
