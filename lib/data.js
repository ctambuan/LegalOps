// lib/data.js — Firestore data access. All writes also append to the immutable audit collection.
import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, writeBatch,
  onSnapshot, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { getFb } from "./firebase";
import { PLAYBOOK_VERSION_TAG } from "./config";

const DB = () => getFb().db;

// ---- Clauses (seed reference, read-only) ----
export function listenClauses(cb) {
  return onSnapshot(query(collection(DB(), "clauses"), orderBy("id")), (snap) =>
    cb(snap.docs.map((d) => ({ _id: d.id, ...d.data() })))
  );
}

// Calibrate an approved amendment into the live clause bank (reviewer only, enforced by rules).
// Writes the approved text into one variant field of an existing clause and stamps the version.
export async function calibrateClauseField(clauseId, field, text, user) {
  const db = DB();
  await updateDoc(doc(db, "clauses", String(clauseId)), {
    [field]: text,
    playbookVersion: PLAYBOOK_VERSION_TAG,
  });
  await audit(user, "calibrate", "clause", `CL-${clauseId}:${field}`, null, null);
}

// ---- Proposals ----
export async function createProposal(p, user) {
  const ref = await addDoc(collection(DB(), "proposals"), {
    ...p,
    status: "pending",
    authorEmail: user.email.toLowerCase(),
    authorName: user.displayName || user.email,
    createdAt: serverTimestamp(),
    reviewedAt: null,
    reviewerEmail: null,
    reviewNote: "",
  });
  await audit(user, "create", "proposal", ref.id, null, "pending");
  return ref.id;
}

export function listenProposals(cb) {
  return onSnapshot(query(collection(DB(), "proposals"), orderBy("createdAt", "desc")), (snap) =>
    cb(snap.docs.map((d) => ({ _id: d.id, ...d.data() })))
  );
}

export async function transitionProposal(id, fromStatus, toStatus, reviewNote, user) {
  const db = DB();
  await updateDoc(doc(db, "proposals", id), {
    status: toStatus,
    reviewNote: reviewNote || "",
    reviewerEmail: user.email.toLowerCase(),
    reviewedAt: serverTimestamp(),
  });
  if (toStatus === "approved") {
    const snap = await getDoc(doc(db, "proposals", id));
    const data = snap.data();
    await setDoc(doc(db, "adopted", id), {
      ...data,
      status: "approved",
      adoptedAt: serverTimestamp(),
      adoptedByEmail: user.email.toLowerCase(),
      playbookVersion: PLAYBOOK_VERSION_TAG,
    });
  }
  await audit(user, "transition", "proposal", id, fromStatus, toStatus);
}

// ---- Adopted master ----
export function listenAdopted(cb) {
  return onSnapshot(query(collection(DB(), "adopted"), orderBy("adoptedAt", "desc")), (snap) =>
    cb(snap.docs.map((d) => ({ _id: d.id, ...d.data() })))
  );
}

// ---- Audit (append-only) ----
export async function audit(user, action, targetType, targetId, fromStatus, toStatus) {
  try {
    await addDoc(collection(DB(), "audit"), {
      actorEmail: user.email.toLowerCase(),
      action, targetType, targetId,
      fromStatus: fromStatus || null,
      toStatus: toStatus || null,
      at: serverTimestamp(),
    });
  } catch (e) { console.error("audit write failed", e); }
}

export async function logExport(user, count) {
  await audit(user, "export-docx", "adopted", `count:${count}`, null, null);
}

// ---- One-time clause seeding (reviewer only) ----
// The privileged clause text is served only to a verified signed-in user by /api/seed
// (never bundled in the browser, never on a public path). The actual writes happen here
// via the user's own Firestore session, so security rules see request.auth and enforce
// that only a reviewer may write to `clauses`.
export async function seedClausesViaApi() {
  const { auth, db } = getFb();
  const u = auth?.currentUser;
  if (!u) throw new Error("Not signed in.");
  const token = await u.getIdToken();
  const res = await fetch("/api/seed", { headers: { Authorization: `Bearer ${token}` } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Could not load clause data.");
  const clauses = out.clauses || [];
  let batch = writeBatch(db);
  let n = 0;
  for (const c of clauses) {
    batch.set(doc(db, "clauses", String(c.id)), { ...c, playbookVersion: c.playbookVersion || PLAYBOOK_VERSION_TAG });
    if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();
  // source: "repo" = latest committed seed read live from the branch; "bundled" = build snapshot.
  return { count: clauses.length, source: out.source || "bundled" };
}

// Best-effort auto-commit of a calibration into the repo seed (server route holds the GitHub
// token). Returns { committed, configured }. Never throws on "not configured" — the live-bank
// write is the primary effect; repo sync is the durable follow-on.
export async function commitCalibrationToRepo({ clauseId, field, text, title }) {
  const { auth } = getFb();
  const u = auth?.currentUser;
  if (!u) throw new Error("Not signed in.");
  const token = await u.getIdToken();
  const res = await fetch("/api/calibrate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clauseId, field, text, title }),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 503) return { committed: false, configured: false };
  if (!res.ok) throw new Error(out.error || "Repo commit failed.");
  return { committed: !!out.committed, configured: true, commit: out.commit };
}
