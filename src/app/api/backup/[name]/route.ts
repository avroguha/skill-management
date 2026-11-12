// Download a stored backup. Administrators only (not while viewing as someone).
// "latest" takes a fresh backup and downloads it.
import fs from "node:fs";
import { getDb } from "@/db";
import { getViewer, audit } from "@/lib/server";
import { backupPath, saveBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const v = await getViewer();
  if (!v || !v.isAdmin || v.viewAs || v.mustChangePassword) return new Response("Forbidden", { status: 403 });
  let file: string;
  let fileName = name;
  try {
    if (name === "latest") {
      const b = await saveBackup(await getDb(), v.name, "manual");
      fileName = b.name;
    }
    file = backupPath(fileName);
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }
  await audit(v, "download_backup", "backup", fileName);
  return new Response(fs.readFileSync(file), {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
