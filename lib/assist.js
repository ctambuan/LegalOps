// lib/assist.js — client helper to call the server-side Claude assist route.
// Sends the user's Firebase ID token; the API key stays on the server.
import { getFb } from "./firebase";

export async function callAssist(mode, payload) {
  const { auth } = getFb();
  const u = auth?.currentUser;
  if (!u) throw new Error("Not signed in.");
  const token = await u.getIdToken();
  const res = await fetch("/api/assist", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...payload }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "AI assist failed.");
  return out.output || "";
}
