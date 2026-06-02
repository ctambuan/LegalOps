// app/api/calibrate/route.js — auto-commit a calibrated clause into the repo's seed JSON on
// the production branch, so the live clause bank (Firestore) and the source of truth stay in
// sync and "Re-sync from master" won't revert the change.
//
// Security posture:
// - Requires a valid Firebase ID token for this project AND verifies the caller is a reviewer
//   (Firestore REST read of their own allowlist doc with their token).
// - Uses a fine-grained GITHUB_TOKEN (contents:write on this repo only) held server-side.
//   If unset, the route returns 503 and the client's live-bank calibration still stands.
// - Updates data/clauses.seed.json only — never the binary master .docx (that stays a human
//   batch reconciliation; see playbook/README.md).
import { verifyFirebaseIdToken } from "../../../lib/verifyIdToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GH = "https://api.github.com";
const SEED_PATH = "data/clauses.seed.json";

async function isReviewer(projectId, token, email) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/allowlist/${encodeURIComponent(email)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return false;
  const d = await r.json().catch(() => ({}));
  return d?.fields?.role?.stringValue === "reviewer";
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "legalops-calibrate",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getSeed(repo, branch, token) {
  const r = await fetch(`${GH}/repos/${repo}/contents/${SEED_PATH}?ref=${branch}`, { headers: ghHeaders(token) });
  if (!r.ok) throw new Error(`Could not read seed from GitHub (${r.status}).`);
  const j = await r.json();
  const raw = Buffer.from(j.content, "base64").toString("utf8");
  return { raw, sha: j.sha };
}

function applyEdit(raw, clauseId, field, text) {
  const data = JSON.parse(raw);
  const clause = data.find((c) => String(c.id) === String(clauseId));
  if (!clause) throw new Error(`Clause CL-${clauseId} not found in seed.`);
  const oldVal = clause[field];
  // Prefer a surgical string replace (preserves the file's formatting / small diff).
  if (typeof oldVal === "string") {
    const oldJson = JSON.stringify(oldVal);
    const newJson = JSON.stringify(text);
    if (raw.indexOf(oldJson) !== -1) return raw.replace(oldJson, newJson);
  }
  // Fallback: re-serialise the whole array (guarantees the change lands).
  clause[field] = text;
  return JSON.stringify(data);
}

export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "") || null;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!token) return Response.json({ error: "Missing sign-in token." }, { status: 401 });

  let payload;
  try { payload = await verifyFirebaseIdToken(token, projectId); }
  catch { return Response.json({ error: "Your sign-in could not be verified." }, { status: 401 }); }

  const email = (payload.email || "").toLowerCase();
  if (!(await isReviewer(projectId, token, email))) {
    return Response.json({ error: "Reviewer role required to commit calibration." }, { status: 403 });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return Response.json({ error: "Repo sync not configured (GITHUB_TOKEN unset).", configured: false }, { status: 503 });
  }
  const repo = process.env.GITHUB_REPO || "ctambuan/legalops";
  const branch = process.env.GITHUB_BRANCH || "main";

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }
  const { clauseId, field, text, title } = body || {};
  const ALLOWED = ["baseline", "buyside", "sellside", "fallback", "redflags"];
  if (clauseId == null || !ALLOWED.includes(field) || typeof text !== "string") {
    return Response.json({ error: "clauseId, a valid field, and text are required." }, { status: 400 });
  }

  try {
    // One retry on a 409 sha conflict (concurrent calibration).
    for (let attempt = 0; attempt < 2; attempt++) {
      const { raw, sha } = await getSeed(repo, branch, ghToken);
      const updated = applyEdit(raw, clauseId, field, text);
      if (updated === raw) return Response.json({ committed: false, reason: "no change" });
      const put = await fetch(`${GH}/repos/${repo}/contents/${SEED_PATH}`, {
        method: "PUT",
        headers: { ...ghHeaders(ghToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Calibrate CL-${clauseId} ${field}${title ? ` (${title})` : ""} into clause bank\n\nApproved amendment adopted by ${email} via the Contracting Engine.`,
          content: Buffer.from(updated, "utf8").toString("base64"),
          sha,
          branch,
        }),
      });
      if (put.ok) {
        const j = await put.json();
        return Response.json({ committed: true, commit: j.commit?.sha || null });
      }
      if (put.status !== 409) {
        const e = await put.json().catch(() => ({}));
        return Response.json({ error: e?.message || `GitHub commit failed (${put.status}).` }, { status: 502 });
      }
    }
    return Response.json({ error: "Commit conflicted twice — try again." }, { status: 409 });
  } catch (e) {
    console.error("calibrate commit failed", e?.message);
    return Response.json({ error: e?.message || "Calibration commit failed." }, { status: 502 });
  }
}
