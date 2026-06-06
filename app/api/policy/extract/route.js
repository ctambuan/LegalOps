// app/api/policy/extract/route.js — server-side text extraction for Policy Library ingestion.
// Runs unpdf (PDF) / mammoth (DOCX) in their native Node environment (reliable; keeps parsers out of
// the client bundle). Requires a valid Firebase ID token (same bar as the other privileged routes).
// Returns plain text only — the client shows it as the extraction preview, then chunks + stores it
// (GC-gated by Firestore rules). No AI cost; this is pure parsing.
import { verifyRequest } from "../../../../lib/verifyIdToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { error, status } = await verifyRequest(req, projectId);
  if (error) return Response.json({ error }, { status });

  let form;
  try { form = await req.formData(); } catch { return Response.json({ error: "Expected a file upload." }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return Response.json({ error: "No file provided." }, { status: 400 });

  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".pdf")) {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      return Response.json({ text: Array.isArray(text) ? text.join("\n\n") : String(text || "") });
    }
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return Response.json({ text: value || "" });
    }
    return Response.json({ error: "Unsupported file type — use PDF or DOCX." }, { status: 400 });
  } catch (e) {
    console.error("policy extract failed", e?.message);
    return Response.json({ error: "Could not extract text from that file — it may be scanned/image-only. Paste the text instead." }, { status: 422 });
  }
}
