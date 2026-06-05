// lib/data.js — Firestore data access. All writes also append to the immutable audit collection.
import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch,
  onSnapshot, query, where, orderBy, serverTimestamp, runTransaction,
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

/* ===================== Company Data · Team & Access (allowlist) ===================== */
// User management without the Admin SDK (org policy blocks service-account keys): the reviewer
// writes the allowlist directly under their own session, gated by Firestore rules. Roles live in
// the allowlist doc (`role`), which the app already honours (lib/auth.js). Every change is audited.

// Live roster (reviewer-readable per rules). Newest activity is not meaningful here, so order by email.
export function listenAllowlist(cb) {
  return onSnapshot(query(collection(DB(), "allowlist"), orderBy("email")), (snap) =>
    cb(snap.docs.map((d) => ({ _id: d.id, ...d.data() })))
  );
}

// Add (or re-add) a user. Doc id is the lowercased email so it matches request.auth.token.email
// in the rules. Status starts "invited" until their first sign-in flips it to "active".
export async function addAllowlistUser({ email, role, displayName }, user) {
  const e = (email || "").trim().toLowerCase();
  await setDoc(doc(DB(), "allowlist", e), {
    email: e,
    role: role === "reviewer" ? "reviewer" : "contributor",
    status: "invited",
    displayName: displayName || "",
    invitedBy: user.email.toLowerCase(),
    invitedAt: serverTimestamp(),
  });
  await audit(user, "user-add", "allowlist", e, null, role);
}

export async function updateAllowlistRole(email, role, user) {
  const e = (email || "").toLowerCase();
  await updateDoc(doc(DB(), "allowlist", e), { role: role === "reviewer" ? "reviewer" : "contributor" });
  await audit(user, "user-role", "allowlist", e, null, role);
}

export async function removeAllowlistUser(email, user) {
  const e = (email || "").toLowerCase();
  await deleteDoc(doc(DB(), "allowlist", e));
  await audit(user, "user-remove", "allowlist", e, null, null);
}

// Called at sign-in: the user stamps their own sign-in metadata (rules allow self-update of
// everything except role/email). Non-fatal — a claim-only reviewer may have no allowlist doc.
export async function stampSignIn(user) {
  try {
    await updateDoc(doc(DB(), "allowlist", user.email.toLowerCase()), {
      status: "active",
      lastSignInAt: serverTimestamp(),
      displayName: user.displayName || "",
    });
  } catch { /* doc may not exist or be writable; sign-in must not depend on this */ }
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
    // Sequence begins at 1 (never 000). A Settings override may raise the start, never below 1.
    const rawStart = Number(starts[counterKey(year, series)] ?? starts[series] ?? 1);
    const start = !rawStart || rawStart < 1 ? 1 : rawStart;
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

// Persist the Drive mirror pointer + last-synced content signature so every session targets the
// same Sheet and skips writes that would be no-ops (`sig` is compared by the live syncer).
export async function setDocgenMeta(patch) {
  await setDoc(doc(DB(), "docgen_meta", "drive"), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

/* ===================== Task Tracker and Report ===================== */
// Three collections back this feature:
//   report_matters  — one doc per matter a team member logs for a reporting period (the
//                     raw material: JIRA-sourced later, manual now). Author-owned.
//   weekly_reports  — one doc per generated report (personal draft or combined), holding the
//                     editable narrative. Author + reviewer visible.
//   report_settings — editable roster + matter-group overrides · reviewer-only writes.

// ---- Report settings (reviewer-only writes; allowlisted reads) ----
export function listenReportSettings(cb) {
  return onSnapshot(doc(DB(), "report_settings", "config"), (snap) =>
    cb(snap.exists() ? snap.data() : {})
  );
}

export async function saveReportSettings(patch, user) {
  await setDoc(doc(DB(), "report_settings", "config"),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase() }, { merge: true });
  await audit(user, "settings", "report", "config", null, null);
}

// ---- Matters ----
// `mine` true → only the signed-in user's matters (contributor view). A reviewer may pass
// mine=false to see the whole team. Rules enforce the same boundary server-side.
export function listenReportMatters({ mine, email }, cb) {
  const col = collection(DB(), "report_matters");
  const q = mine
    ? query(col, where("authorEmail", "==", (email || "").toLowerCase()), orderBy("createdAt", "desc"))
    : query(col, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ _id: d.id, ...d.data() }))));
}

export async function createReportMatter(m, user) {
  const ref = await addDoc(collection(DB(), "report_matters"), {
    ...m,
    source: m.source || "manual",
    authorEmail: user.email.toLowerCase(),
    authorName: user.displayName || user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await audit(user, "create", "report_matter", ref.id, null, null);
  return ref.id;
}

export async function updateReportMatter(id, patch, user) {
  await updateDoc(doc(DB(), "report_matters", id), { ...patch, updatedAt: serverTimestamp() });
  await audit(user, "update", "report_matter", id, null, null);
}

export async function deleteReportMatter(id, user) {
  await deleteDoc(doc(DB(), "report_matters", id));
  await audit(user, "delete", "report_matter", id, null, null);
}

// ---- Weekly reports ----
export function listenWeeklyReports({ mine, email }, cb) {
  const col = collection(DB(), "weekly_reports");
  const q = mine
    ? query(col, where("authorEmail", "==", (email || "").toLowerCase()), orderBy("updatedAt", "desc"))
    : query(col, orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ _id: d.id, ...d.data() }))));
}

// Create a new weekly report (personal draft or combined). Returns the new id.
export async function createWeeklyReport(data, user) {
  const ref = await addDoc(collection(DB(), "weekly_reports"), {
    kind: data.kind || "personal",
    drafterName: data.drafterName || "",
    periodStart: data.periodStart || "",
    periodEnd: data.periodEnd || "",
    title: data.title || "",
    narrative: data.narrative || "",
    status: data.status || "draft",
    authorEmail: user.email.toLowerCase(),
    authorName: user.displayName || user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user.email.toLowerCase(),
  });
  await audit(user, "create", "weekly_report", ref.id, null, data.status || "draft");
  return ref.id;
}

// Update an existing report's editable fields (narrative, title, status).
export async function updateWeeklyReport(id, patch, user) {
  await updateDoc(doc(DB(), "weekly_reports", id), {
    ...patch, updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase(),
  });
  await audit(user, "update", "weekly_report", id, null, patch.status || null);
}

export async function deleteWeeklyReport(id, user) {
  await deleteDoc(doc(DB(), "weekly_reports", id));
  await audit(user, "delete", "weekly_report", id, null, null);
}
