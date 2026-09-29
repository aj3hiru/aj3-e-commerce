import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { currentJob, deleteBackup, getJob, listBackups, startBackup, startRestore, startValidate } from "@/lib/backup";
import { withApiErrors } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/** Backup & Restore is for the Admin role only (it can replace the whole site). */
async function admin() {
  const s = await getAdminSession();
  return s && s.role === "admin" ? s : null;
}

/** GET → backups + running job; ?job=<id>&from=<n> → that job's progress and new log lines. */
async function handleGET(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ success: false, message: "Only an Admin can do this." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("job");
  if (id) {
    const j = getJob(id);
    if (!j) return NextResponse.json({ success: false, message: "That job has finished and was cleared." }, { status: 404 });
    const from = Math.max(0, Number(req.nextUrl.searchParams.get("from")) || 0);
    return NextResponse.json({ success: true, job: { ...j, log: j.log.slice(from), logTotal: j.log.length } }, { headers: { "Cache-Control": "no-store" } });
  }
  const run = currentJob();
  return NextResponse.json({ success: true, backups: await listBackups(), running: run ? { id: run.id, kind: run.kind, percent: run.percent } : null });
}

/** POST { action: "backup" } · { action: "validate", file } · { action: "restore", file, confirm: "RESTORE" } · { action: "delete", file } */
async function handlePOST(req: NextRequest) {
  const s = await admin();
  if (!s) return NextResponse.json({ success: false, message: "Only an Admin can do this." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; file?: string; confirm?: string };
  try {
    switch (b.action) {
      case "backup": {
        const j = startBackup(s.username);
        await logActivity(req, s.userId, "backup_create", "Started a full site backup");
        return NextResponse.json({ success: true, job: j.id });
      }
      case "validate":
        return NextResponse.json({ success: true, job: startValidate(String(b.file)).id });
      case "restore": {
        if (b.confirm !== "RESTORE") return NextResponse.json({ success: false, message: "Type RESTORE to confirm." }, { status: 400 });
        const j = startRestore(String(b.file), s.username);
        await logActivity(req, s.userId, "backup_restore", `Started restoring ${b.file}`);
        return NextResponse.json({ success: true, job: j.id });
      }
      case "delete":
        await deleteBackup(String(b.file));
        await logActivity(req, s.userId, "backup_delete", `Deleted backup ${b.file}`);
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "Failed." }, { status: 409 });
  }
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
