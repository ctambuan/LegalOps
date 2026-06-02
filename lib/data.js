// lib/data.js — Firestore data access. All writes also append to the immutable audit collection.
import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch,
  onSnapshot, query, orderBy, serverTimestamp, runTransaction,
} from "firebase/firestore";
import { getFb } from "./firebase";
import { PLAYBOOK_VERSION_TAG } from "./config";
import { buildDocumentNumber, businessApprovers, folderCode, seriesForType, dateParts } from "./docgen";

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

/* ===================== Document Number Generator ===================== */
// Three collections back this feature:
//   docnumbers       — one immutable record per generated number (the "Database" tab + Drive mirror)
//   docgen_counters  — per (year, series) running sequence, incremented atomically in a transaction
//   docgen_settings  — editable config (approver overrides, default PIC, sequence starts) · reviewer-only
//   docgen_meta      — small allowlisted-writable doc holding the Drive mirror file id

const counterKey = (year, series) => `${year}__${series}`;

// Live record stream for the Database tab (newest first). Filtering/sorting happens client-side.
export function listenDocNumbers(cb) {
  return onSnapshot(query(collection(DB(), "docnumbers"), orderBy("createdAt", "desc")), (snap) =>
    cb(snap.docs.map((d) => ({ _id: d.id, ...d.data() })))
  );
}

// Generate the next document number. The sequence is allocated atomically so two people
// generating at once can never collide. Returns the created record (incl. the final number).
// `settings` carries approver overrides + per-(year,series) starting numbers.
export async function createDocNumber(record, user, settings = {}) {
  const db = DB();
  const { year } = dateParts(record.date);
  const series = seriesForType(record.docType);
  const cRef = doc(db, "docgen_counters", counterKey(year, series));
  const overrides = settings.approvers || {};
  const starts = settings.startSeq || {};

  const result = await runTransaction(db, async (tx) => {
    const cSnap = await tx.get(cRef);
    const start = Number(starts[counterKey(year, series)] ?? starts[series] ?? 0) || 0;
    const seq = cSnap.exists() ? Number(cSnap.data().next) : start;

    const number = buildDocumentNumber(record, seq);
    const approvers = businessApprovers(record, overrides);
    const folder = folderCode(record);

    const docRef = doc(collection(db, "docnumbers"));
    tx.set(docRef, {
      ...record,
      seq, number, series, year,
      approvers, folderCode: folder,
      authorEmail: user.email.toLowerCase(),
      authorName: user.displayName || user.email,
      createdAt: serverTimestamp(),
    });
    tx.set(cRef, { next: seq + 1, year, series, updatedAt: serverTimestamp() }, { merge: true });
    return { id: docRef.id, number, seq, approvers, folderCode: folder, series, year };
  });

  await audit(user, "generate", "docnumber", result.number, null, null);
  return result;
}

// Reviewer may correct filing metadata on an existing record (e.g. cabinet/folder once filed).
// The number itself is never mutated. Enforced reviewer-only by rules.
export async function updateDocNumber(id, patch, user) {
  await updateDoc(doc(DB(), "docnumbers", id), patch);
  await audit(user, "update", "docnumber", id, null, null);
}

export async function deleteDocNumber(id, number, user) {
  await deleteDoc(doc(DB(), "docnumbers", id));
  await audit(user, "delete", "docnumber", number || id, null, null);
}

// ---- Settings (reviewer-only writes; allowlisted reads) ----
export function listenDocgenSettings(cb) {
  return onSnapshot(doc(DB(), "docgen_settings", "config"), (snap) =>
    cb(snap.exists() ? snap.data() : {})
  );
}

export async function saveDocgenSettings(patch, user) {
  await setDoc(doc(DB(), "docgen_settings", "config"),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase() }, { merge: true });
  await audit(user, "settings", "docgen", "config", null, null);
}

// ---- Drive mirror file id (allowlisted-writable small pointer doc) ----
export function listenDocgenMeta(cb) {
  return onSnapshot(doc(DB(), "docgen_meta", "drive"), (snap) =>
    cb(snap.exists() ? snap.data() : {})
  );
}

export async function setDriveFileId(fileId) {
  await setDoc(doc(DB(), "docgen_meta", "drive"), { fileId, updatedAt: serverTimestamp() }, { merge: true });
}
