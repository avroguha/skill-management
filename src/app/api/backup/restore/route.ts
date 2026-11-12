// Restore from an uploaded backup file (multipart form: file, confirm=RESTORE).
// Administrators only; a safety backup of what is there now is taken first.
import { actionViewer } from "@/lib/server";
import { restoreFrom } from "@/lib/restore";

export const dynamic = "force-dynamic";

const MAX = 500 * 1024 * 1024;

export async function POST(req: Request) {
  // only from this app's own pages
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ ok: false, error: "Refused: not sent from this app." }, { status: 403 });
  let v;
  try { v = await actionViewer(); } catch (e) { return Response.json({ ok: false, error: (e as Error).message }, { status: 403 }); }
  if (!v.isAdmin) return Response.json({ ok: false, error: "Administrators only." }, { status: 403 });
  try {
    const form = await req.formData();
    if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "RESTORE") return Response.json({ ok: false, error: "Type RESTORE to confirm." }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return Response.json({ ok: false, error: "Choose a backup file." }, { status: 400 });
    if (file.size > MAX) return Response.json({ ok: false, error: "That file is larger than any backup this app makes." }, { status: 400 });
    const r = await restoreFrom(Buffer.from(await file.arrayBuffer()), v, `upload:${file.name}`);
    return Response.json({ ok: true, message: `Restored the backup from ${new Date(r.from).toLocaleString("en-GB")}. What was there before is saved as ${r.safety}. Everyone signs in again.` });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
