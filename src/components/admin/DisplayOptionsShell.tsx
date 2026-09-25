import { AdminShell } from "./AdminShell";
import { DisplayOptionsPanel } from "./DisplayOptionsPanel";
import { DashboardWidgetPrefsProvider, type WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** AdminShell + its Display Options button (header on wide screens, above the page on narrow ones). */
export function DisplayOptionsShell({ prefKey, groups, standalone = [], defaultHidden, extraActions, children, ...shell }: Omit<React.ComponentProps<typeof AdminShell>, "headerActions"> & {
  prefKey: string; groups: readonly WidgetGroup[]; standalone?: readonly { key: string; label: string }[]; defaultHidden?: readonly string[]; extraActions?: React.ReactNode;
}) {
  return (
    <DashboardWidgetPrefsProvider prefKey={prefKey} groups={groups} standalone={standalone} defaultHidden={defaultHidden}>
      <AdminShell {...shell} headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" />{extraActions}</div>}>
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3 xl:hidden"><DisplayOptionsPanel variant="toolbar" />{extraActions}</div>
        {children}
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
