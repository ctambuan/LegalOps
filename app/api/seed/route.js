// app/api/seed/route.js — serves the privileged clause seed data to a verified,
// signed-in user of this Firebase project. The text is never bundled into the browser
// build and never placed on a public path; it is returned only against a valid Firebase
// ID token (verified against Firebase's public signing keys). The client then writes
// the clauses via the user's own Firestore session, so security rules (clauses: write if
// isReviewer) enforce that only a reviewer can actually load them.
import clauses from "../../../data/clauses.seed.json";
import { verifyRequest } from "../../../lib/verifyIdToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { error, status } = await verifyRequest(req, projectId);
  if (error) return Response.json({ error }, { status });

  return Response.json({ clauses });
}
