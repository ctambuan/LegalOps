// lib/extractText.js — client side of policy text extraction. Plain text is read in the browser;
// PDF/DOCX are sent to /api/policy/extract (Node), which runs the parsers in their native environment
// and returns text. This keeps heavy parsers out of the client bundle and is reliable. The returned
// text flows into the same preview → chunk → index pipeline as pasted text.
"use client";
import { getFb } from "./firebase";

export async function extractFileText(file) {
  const name = (file.name || "").toLowerCase();
  const type = file.type || "";

  // Plain text family — read locally, no round trip.
  if (/\.(txt|md|markdown|csv|text)$/.test(name) || type.startsWith("text/")) {
    return await file.text();
  }
  if (name.endsWith(".doc")) throw new Error("Legacy .doc isn't supported — save as .docx or PDF, or paste the text.");
  if (!(name.endsWith(".pdf") || name.endsWith(".docx"))) {
    throw new Error("Unsupported file type — use PDF, DOCX or .txt, or paste the text.");
  }

  const { auth } = getFb();
  const u = auth?.currentUser;
  if (!u) throw new Error("Not signed in.");
  const token = await u.getIdToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/policy/extract", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Could not read that file — paste the text instead.");
  return out.text || "";
}
