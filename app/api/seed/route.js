// app/api/seed/route.js — serves the privileged clause seed data to a verified, signed-in user
// of this Firebase project. The text is never bundled into the browser build and never placed on a
// public path; it is returned only against a valid Firebase ID token. The client then writes the
// clauses via its own Firestore session, so security rules (clauses: write if isReviewer) enforce
// that only a reviewer can load them.
//
// "Re-sync from master" calls this. To always catch the LATEST master, when GITHUB_TOKEN is set we
// read data/clauses.seed.json live from the repo branch at request time (so every committed
// calibration is reflected immediately, regardless of deploy timing). If the token is unset or the
// fetch fails, we fall back to the seed bundled at build time.
import bundledClauses from "../../../data/clauses.seed.json";
import { verifyRequest } from "../../../lib/verifyIdToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function liveSeedFromRepo() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const repo = process.env.GITHUB_REPO || "ctambuan/legalops";
  const branch = process.env.GITHUB_BRANCH || "main";
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/contents/data/clauses.seed.json?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw",
          "User-Agent": "legalops-seed",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    );
    if (!r.ok) return null;
    const parsed = JSON.parse(await r.text());
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(req) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { error, status } = await verifyRequest(req, projectId);
  if (error) return Response.json({ error }, { status });

  const live = await liveSeedFromRepo();
  return Response.json({ clauses: live || bundledClauses, source: live ? "repo" : "bundled" });
}
