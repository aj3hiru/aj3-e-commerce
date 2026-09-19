"use client";

import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { cn } from "@/lib/utils";

interface DisplayOptionsPanelProps {
  /**
   * "bootstrap" = the original dashboard's grey `.btn-secondary.btn-sm`.
   * "header"    = a 40px control in the admin top bar (dashboard2). Its label
   *               collapses to the icon below 1536px so the bar still fits
   *               the search box, dark-mode button and user menu.
   * "toolbar"   = the same 40px control with its label always shown, for the
   *               toolbar dashboard2 uses below 1280px.
   */
  variant?: "bootstrap" | "header" | "toolbar";
}

export function DisplayOptionsPanel({ variant = "bootstrap" }: DisplayOptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // The widget list comes from the provider, so each dashboard shows its own.
  const { isVisible, toggle, loaded, groups, standalone } = useDashboardWidgetPrefs();
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
        aria-expanded={open}
        aria-label="Display Options"
        className={
          variant !== "bootstrap"
            ? "flex h-10 items-center gap-2 rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
            : // .btn.btn-secondary.btn-sm — the same grey as the Apply button it sits next to
              "flex items-center gap-1.5 rounded-[0.25rem] border border-[#6c757d] bg-[#6c757d] px-2 py-1 text-[0.875rem] text-white hover:border-[#5c636a] hover:bg-[#5c636a]"
        }
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className={cn(variant === "header" && "hidden 2xl:inline")}>Display Options</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && loaded && (
        <div className="absolute top-full right-0 z-[200] mt-2 flex max-h-[70vh] min-w-[240px] flex-col gap-[0.125rem] overflow-y-auto rounded-[0.5rem] border border-admin-gray-200 bg-white p-3 shadow-[0_0.5rem_1.5rem_rgba(0,0,0,.15)]">
          {/* .db-display-divider */}
          <div className="px-2.5 pb-[0.2rem] pt-2 text-[0.6875rem] font-bold uppercase text-admin-gray-400">
            Sections
          </div>
          {groups.map((group) => {
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
          {standalone.map((item) => (
            <label key={item.key} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[0.8438rem] hover:bg-admin-gray-50 cursor-pointer select-none">
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
}
