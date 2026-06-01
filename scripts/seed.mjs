// scripts/seed.mjs — load the 74 Playbook v3.0 clauses into Firestore (admin; run once).
// Usage: GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/seed.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!sa) { console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path."); process.exit(1); }

initializeApp({ credential: cert(JSON.parse(readFileSync(sa, "utf8"))) });
const db = getFirestore();

const clauses = JSON.parse(readFileSync(new URL("../data/clauses.seed.json", import.meta.url), "utf8"));

const run = async () => {
  let batch = db.batch();
  let n = 0;
  for (const c of clauses) {
    const ref = db.collection("clauses").doc(String(c.id));
    batch.set(ref, { ...c, playbookVersion: "v3.0" });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Seeded ${clauses.length} clauses.`);
  process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
