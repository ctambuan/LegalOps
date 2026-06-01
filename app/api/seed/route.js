// app/api/seed/route.js — serves the privileged clause seed data to a verified,
// signed-in user of this Firebase project. The text is never bundled into the browser
// build and never placed on a public path; it is returned only against a valid Firebase
// ID token. The client then writes the clauses via the user's own Firestore session, so
// security rules (clauses: write if isReviewer) enforce that only a reviewer can load them.
import clauses from "../../../data/clauses.seed.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return Response.json({ error: "Missing sign-in token." }, { status: 401 });

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // Validate the Firebase ID token (a Google-signed JWT) and confirm it is for this project.
  let info;
  try {
    const vr = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token));
    if (!vr.ok) throw new Error("invalid");
    info = await vr.json();
  } catch {
    return Response.json({ error: "Your sign-in could not be verified. Sign out and in again." }, { status: 401 });
  }
  if (projectId && info.aud !== projectId) {
    return Response.json({ error: "Sign-in token is not for this app." }, { status: 401 });
  }

  return Response.json({ clauses });
}
