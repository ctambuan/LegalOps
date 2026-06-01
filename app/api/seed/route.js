// app/api/seed/route.js — serves the privileged clause seed data to a verified,
// signed-in user of this Firebase project. The text is never bundled into the browser
// build and never placed on a public path; it is returned only against a valid Firebase
// ID token (verified here against Firebase's public signing keys). The client then writes
// the clauses via the user's own Firestore session, so security rules (clauses: write if
// isReviewer) enforce that only a reviewer can actually load them.
import crypto from "node:crypto";
import clauses from "../../../data/clauses.seed.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

function b64url(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Verify a Firebase Auth ID token (Google-signed RS256 JWT) without the Admin SDK.
async function verifyFirebaseIdToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const header = JSON.parse(b64url(parts[0]).toString("utf8"));
  const payload = JSON.parse(b64url(parts[1]).toString("utf8"));
  const signature = b64url(parts[2]);

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error("wrong audience");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("wrong issuer");
  if (payload.exp && payload.exp < now) throw new Error("expired");

  const certs = await (await fetch(CERT_URL)).json();
  const pem = certs[header.kid];
  if (!pem) throw new Error("unknown signing key");
  const publicKey = new crypto.X509Certificate(pem).publicKey;
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), publicKey, signature);
  if (!ok) throw new Error("bad signature");
  return payload;
}

export async function GET(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return Response.json({ error: "Missing sign-in token." }, { status: 401 });

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  try {
    await verifyFirebaseIdToken(token, projectId);
  } catch {
    return Response.json({ error: "Your sign-in could not be verified. Sign out and in again." }, { status: 401 });
  }

  return Response.json({ clauses });
}
