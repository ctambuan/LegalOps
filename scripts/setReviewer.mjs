// scripts/setReviewer.mjs — set the reviewer custom claim and seed the allowlist.
// Usage: GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//   node scripts/setReviewer.mjs owner@example.com reviewer  teammate@example.com contributor ...
// First pair after the script can be the reviewer (the workspace owner). Each arg pair: <email> <role>.
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!sa) { console.error("Set GOOGLE_APPLICATION_CREDENTIALS."); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(readFileSync(sa, "utf8"))) });
const auth = getAuth();
const db = getFirestore();

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error("Provide <email> <role> pairs. role = reviewer | contributor");
  process.exit(1);
}

const run = async () => {
  for (let i = 0; i < args.length; i += 2) {
    const email = args[i].toLowerCase();
    const role = args[i + 1];
    await db.collection("allowlist").doc(email).set({ role, addedAt: new Date().toISOString() });
    if (role === "reviewer") {
      try {
        const u = await auth.getUserByEmail(email);
        await auth.setCustomUserClaims(u.uid, { reviewer: true });
        console.log(`Reviewer claim set for ${email}`);
      } catch {
        console.warn(`User ${email} has not signed in yet; claim will need to be set after first sign-in.`);
      }
    }
    console.log(`Allowlisted ${email} as ${role}`);
  }
  process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
