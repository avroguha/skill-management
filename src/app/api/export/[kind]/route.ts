// CSV download of one kind of data. Administrators only.
import { getDb } from "@/db";
import { getViewer, audit } from "@/lib/server";
import { exportCsv, KINDS, type Kind } from "@/lib/transfer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const v = await getViewer();
  if (!v || !v.isAdmin || v.mustChangePassword) return new Response("Forbidden", { status: 403 });
  if (!(KINDS as readonly string[]).includes(kind)) return new Response("Unknown export", { status: 404 });
  const csv = await exportCsv(await getDb(), kind as Kind);
  await audit(v, "export", kind, null);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${kind}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
