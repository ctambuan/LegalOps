// app/api/seed/route.js — server-side, one-time clause loader.
// Privileged clause text stays on the server; it is never sent to the browser.
// The caller must present a signed-in reviewer's Firebase ID token; Firestore
// security rules (clauses: write if isReviewer) enforce authorisation.
import clauses from "../../../data/clauses.seed.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number") fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === "boolean") fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

export async function POST(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return Response.json({ error: "Missing sign-in token." }, { status: 401 });

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return Response.json({ error: "Server is missing the Firebase project id." }, { status: 500 });

  const base = `projects/${projectId}/databases/(default)/documents`;
  const writes = clauses.map((c) => ({
    update: {
      name: `${base}/clauses/${c.id}`,
      fields: encode({ ...c, playbookVersion: c.playbookVersion || "v3.0" }),
    },
  }));

  const r = await fetch(`https://firestore.googleapis.com/v1/${base}:batchWrite`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    return Response.json({ error: data?.error?.message || "Database write failed." }, { status: r.status });
  }
  // batchWrite returns 200 with a per-write status array; surface any failure (e.g. permission denied).
  const failed = (data.status || []).find((s) => s && s.code && s.code !== 0);
  if (failed) {
    return Response.json({ error: failed.message || "Not authorised to load clauses (reviewer only)." }, { status: 403 });
  }
  return Response.json({ count: writes.length });
}
