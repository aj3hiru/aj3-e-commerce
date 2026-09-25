import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, type AdminSession } from "@/lib/admin-auth";
import { roleLabel } from "@/lib/roles";
import { cached } from "@/lib/cache";

/** The signed-in staff member for an app request (Bearer token), or a 401 answer. */
export async function appSession(): Promise<AdminSession | NextResponse> {
  const s = await getAdminSession();
  return s ?? NextResponse.json({ success: false, auth: false, message: "Please log in again." }, { status: 401 });
}

export async function appProfile(session: AdminSession) {
  const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, username: true, firstName: true, lastName: true, email: true, phone: true, avatar: true, role: true, createdAt: true } });
  return {
    id: session.userId, username: session.username, name: [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || session.username,
    email: u?.email ?? session.email, phone: u?.phone ?? null, avatar: u?.avatar ?? null, role: session.role, roleLabel: roleLabel(session.role),
    since: u?.createdAt.toISOString() ?? null, permissions: session.permissions,
  };
}

export interface AppRelease { version: string; android: string | null; windows: string | null; page: string; publishedAt: string | null }

const REPO = process.env.STAFF_APP_REPO ?? "aj3hiru/aj3-e-commerce";

/**
 * Newest staff app release. A public/app/latest.json on the server wins (manual
 * override); otherwise the newest "staff-app-v*" GitHub Release built by the
 * workflow (checked at most every 10 minutes).
 */
export async function latestRelease(): Promise<AppRelease | null> {
  // Fields in public/app/latest.json (server only) fill in or replace what GitHub has — e.g. an APK hosted on this site.
  let override: Partial<AppRelease> = {};
  try { override = JSON.parse(await readFile(path.join(process.cwd(), "public", "app", "latest.json"), "utf8")); } catch { /* none */ }
  const gh = await githubRelease();
  if (!gh && !override.version) return null;
  const merged = { version: "", android: null, windows: null, page: "", publishedAt: null, ...(gh ?? {}) } as AppRelease;
  for (const [k, v] of Object.entries(override)) if (v !== null && v !== undefined && v !== "") (merged as unknown as Record<string, unknown>)[k] = v;
  return merged;
}

function githubRelease(): Promise<AppRelease | null> {
  return cached("staff-app-release", [], 10 * 60_000, async () => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "sriandal-staff-site" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const list = (await r.json()) as { tag_name: string; html_url: string; published_at: string | null; draft: boolean; assets: { name: string; browser_download_url: string }[] }[];
      const rel = list.find((x) => !x.draft && x.tag_name.startsWith("staff-app-v"));
      if (!rel) return null;
      const asset = (ext: string) => rel.assets.find((a) => a.name.toLowerCase().endsWith(ext))?.browser_download_url ?? null;
      return { version: rel.tag_name.replace("staff-app-v", ""), android: asset(".apk"), windows: asset(".exe"), page: rel.html_url, publishedAt: rel.published_at };
    } catch {
      return null; // GitHub unreachable — try again next time
    }
  });
}
