// lib/verifyIdToken.js — verify a Firebase Auth ID token (Google-signed RS256 JWT)
// without the Admin SDK (org policy blocks service-account keys). Shared by the
// privileged server routes (/api/seed, /api/assist) so the verification logic lives once.
import crypto from "node:crypto";

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

function b64url(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export async function verifyFirebaseIdToken(token, projectId) {
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

// Extract a verified payload from a request's Authorization: Bearer header.
// Returns { payload } on success or { error, status } on failure.
export async function verifyRequest(req, projectId) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { error: "Missing sign-in token.", status: 401 };
  try {
    const payload = await verifyFirebaseIdToken(token, projectId);
    return { payload };
  } catch {
    return { error: "Your sign-in could not be verified. Sign out and in again.", status: 401 };
  }
}
