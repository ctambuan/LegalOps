# Product Requirements Document — Clause Library Workbench

**Status:** Draft v0.3 (pre-deployment; company-agnostic; codebase built & verified)
**Owner (Product):** the reviewer (owner) — Head of Legal, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth for clauses:** [Company] Legal Contract Review Playbook v3.0 (08 May 2026)
**Last updated:** see Change Log (Section 12)

> This PRD is the single controlling record for the Workbench. Every architectural, product, or
> scope change MUST be reflected here and appended to the Change Log before it is considered adopted.
> A copy of this document is to be maintained in the configured project Drive folder for future
> reference. AI-assisted outputs are working drafts subject to human review by qualified [Company]
> counsel and do not constitute legal advice or a Legal Department position until reviewed and adopted.

---

## 1. Problem Statement

The Playbook v3.0 is the authoritative, privileged source of [Company]'s contracting positions. Today,
collaborative improvement of that library is constrained: a Project-based AI workspace is siloed to a
single user, and there is no governed, multi-user pathway for the legal team to propose clause
improvements, additional fallbacks, conditional expansions, and net-new clauses, route them to the
Head of Legal for review, and adopt approved positions into a controlled record — without risking
drift from, or contamination of, the Playbook itself.

## 2. Goals & Non-Goals

**Goals**
- G1. Let authorised team members retrieve any Playbook v3.0 clause with its four-tier variants.
- G2. Let team members submit four contribution types: improvement, additional fallback,
  conditional expansion, new clause — each carrying proposed tier and classification.
- G3. Route every submission to a Head-of-Legal-only review queue with approve / request-changes /
  reject and a side-by-side diff against current Playbook text.
- G4. Maintain an adopted "master addenda" record of approved positions, exportable to .docx and
  written to Google Drive.
- G5. Preserve the Playbook's four-tier classification and citation discipline in every surface.
- G6. Persist all data durably, multi-user, with authenticated access restricted to named [Company]
  accounts, hosted in an appropriate data region.

**Non-Goals (v1)**
- NG1. The Workbench does NOT overwrite or replace the Playbook. It is a proposal-and-adoption layer
  on top of it. Adopted items are stamped as addenda to v3.0.
- NG2. No automated legal advice. No auto-approval. Human (Head of Legal) adoption is mandatory.
- NG3. No real-time co-editing of the same clause text (Google-Docs-style OT/CRDT) in v1.
- NG4. No public access. No external counterparty access.

## 3. Users & Roles

| Role | Who | Capabilities |
|---|---|---|
| Contributor | Named legal/compliance/product team members | Read library; submit proposals; view own submissions and status |
| Reviewer / Head of Legal | The workspace owner (reviewing counsel) and any designated deputy | All Contributor rights + review queue, approve/adopt, request changes, reject, export master |
| (Implicit) Unauthorised | Anyone not on the allowlist | No access — blocked at Auth and at Firestore rules |

Roles are enforced server-side via custom claims and Firestore security rules, NOT client-side flags.

## 4. Source-of-Truth & Anti-Drift Principle (critical)

- The clause library is seeded from Playbook v3.0 (74 clauses parsed: Baseline, Buy-Side, Sell-Side,
  Fallback, Red Flags, Purpose).
- Seed data is treated as READ-ONLY reference. Contributions never mutate seed records; they create
  separate proposal records that reference a seed clause by id.
- Adopted positions are stored as ADDENDA with explicit linkage to the Playbook clause and a version
  stamp. The canonical Playbook remains the Legal Department's controlled document.
- Every position displays its tier (Baseline / Acceptable Fallback / Escalation Required /
  Prohibited-High Risk) and classification (Mandatory Law / Internal Policy / Market-Standard /
  Preferred Posture). Only Mandatory Law with a verbatim cited source note is treated as verified law;
  all citations require verification before reliance.

## 5. Functional Requirements

- FR1. Clause Library: searchable, filterable by category; clause detail shows all variants verbatim
  with tier labels and copy-to-clipboard.
- FR2. Proposal form: type, jurisdiction, title, existing-clause reference, proposed tier,
  classification, operative text (house style), rationale/risk note, optional associated red flag.
  Mandatory-Law selection forces a verbatim-citation reminder and verification flag.
- FR3. Submission lifecycle: pending -> approved | changes-requested | rejected. Status, reviewer
  note, timestamps, and author retained.
- FR4. Review (Head of Legal only): queue with status filters; side-by-side current-vs-proposed;
  rationale and red-flag display; Mandatory-Law verification warning; approve-and-adopt / request
  changes / reject with note.
- FR5. Master addenda: approved items collected; list + detail; export to formatted .docx; write to
  Google Drive (the configured Drive folder); each export logged.
- FR6. Audit trail: every state transition recorded (who, what, when) and immutable.

## 6. Non-Functional Requirements

- NFR1. Security: Firebase Auth (Google sign-in) + email allowlist enforced in Firestore rules.
  Privileged data; least-privilege access; no client-trusted role checks.
- NFR2. Data residency: Firestore in **asia-southeast2 (Jakarta)** per the workspace data-residency posture
  and the Playbook's cross-border-transfer caution. NOTE: Firebase Authentication is a global service;
  confirm this is acceptable with DPO/Head of Special Project. (Open item — see Section 11.)
- NFR3. Availability target: best-effort; internal tool. No formal SLA in v1.
- NFR4. Auditability: append-only audit collection; exports logged.
- NFR5. Accessibility: keyboard-navigable, sufficient contrast, semantic HTML.

## 7. Architecture (selected)

- Frontend/Hosting: **Next.js (App Router) deployed on Vercel.**
- Data: **Cloud Firestore (Jakarta, asia-southeast2).**
- Auth: **Firebase Authentication (Google provider) + email allowlist in security rules** and custom
  claims for reviewer role.
- Document export: client-side .docx generation (docx library) + Drive write via connector / Drive API.
- Records (PRD, change log, exports): **Google Drive** (the configured Drive folder).

Rationale: Next.js on Vercel gives a fast, modern, maintainable SPA/SSR hybrid with first-class DX;
Firestore gives realtime multi-user sync and rule-based security without standing up a server;
keeping data in Jakarta aligns with the conservative data-residency posture for privileged Indonesian
legal-team data. Firebase Auth is global — flagged as an open compliance item to verify, not assume.

## 8. Data Model (Firestore)

- `clauses/{id}` — seed reference (read-only): title, cat, purpose, baseline, buyside, sellside,
  fallback, redflags, playbookVersion.
- `proposals/{id}` — type, jurisdiction, title, baseRef, tier, classification, text, rationale,
  redflag, originalText, status, authorEmail, authorName, createdAt, reviewedAt, reviewerEmail,
  reviewNote.
- `adopted/{id}` — snapshot of approved proposal + adoptedAt, adoptedByEmail, playbookVersion,
  addendumNumber.
- `audit/{id}` — append-only: actorEmail, action, targetType, targetId, fromStatus, toStatus, at.
- `allowlist/{email}` — role: 'contributor' | 'reviewer'. Drives access + claims.

## 9. Security Rules (intent — full rules in /firestore.rules)

- Reads of `clauses`, `proposals`, `adopted`: only if request.auth.token.email in allowlist.
- Writes to `proposals` (create): authenticated allowlisted user; authorEmail must equal token email.
- Status transitions on `proposals` and any write to `adopted`: only reviewer-role (the reviewer (owner)).
- `audit`: create-only; no update/delete by anyone (immutable).
- `allowlist`: no client writes; managed via console / admin only.

## 10. Deployment Runbook (summary; full in /DEPLOY.md)

Prereqs: Node 20+, a Firebase project, a Vercel account, gcloud/firebase CLIs.
1. Create Firebase project; enable Auth (Google) and Firestore (asia-southeast2).
2. Add authorised emails to `allowlist` collection; set reviewer claim for the reviewer (owner).
3. `npm i`; set env vars (Firebase web config) locally and in Vercel.
4. Deploy Firestore rules + indexes: `firebase deploy --only firestore`.
5. Seed clauses: `node scripts/seed.mjs` (uses service account).
6. `vercel --prod` to deploy the app.
7. Verify: sign in as a non-allowlisted account (must be denied), as contributor (no review tab), as
   the reviewer (owner) (review + adopt + export).

## 11. Open Items / Risks (must be resolved before go-live)

- OI1. **Drive write authorisation.** RESOLVED for record-keeping (2026-06-01): the Drive connector now
  authenticates and writes to the configured project folder (this PRD and project records were written
  there). Still to confirm: whether the in-app master .docx export should write to the same Shared Drive
  folder via the same credential/scope, and the Shared-Drive vs normal-folder write-permission distinction.
- OI2. **Privileged data into personal Drive + Firebase.** RESOLVED (2026-06-01): the Head of Legal
  has reviewed and accepted storing privileged legal data in (a) the personal-named Google Drive folder
  ("04. Christine Personal File", within the Shared Drive) and (b) Firebase. This is recorded as a
  Head-of-Legal decision; no further DPO routing required for v1 on this point.
- OI3. **Data residency vs Firebase Auth global service.** RESOLVED (2026-06-01): the Head of Legal has
  accepted that Firestore data resides in Jakarta (asia-southeast2) while Firebase Authentication runs as
  a global service. Acceptable for v1.
- OI4. **Allowlist governance.** Who maintains the allowlist; offboarding process.
- OI5. **Playbook update process.** When Playbook v3.1 issues, how is the seed re-synced without
  losing adopted addenda linkage.

## 12. Change Log

| Date (UTC) | Version | Change | By |
|---|---|---|---|
| 2026-06-01 | v0.1 | Initial PRD authored. Stack selected: Next.js/Vercel + Firestore (Jakarta) + Firebase Auth w/ email allowlist. Anti-drift principle established. Open items logged, incl. unresolved Drive write authorisation. | AI eng (for the reviewer (owner)) |
| 2026-06-01 | v0.2 | Codebase built and verified. (a) Next.js upgraded off 14.2.5 to 15.5.7 after the build surfaced a published Next.js security advisory; deploy-time instruction added to pin latest patched release against the live registry (sandbox registry could not give a clean final audit). (b) Firebase init refactored to lazy, browser-only `getFb()` after the production build caught a static-prerender crash (`auth/invalid-api-key`); `lib/auth.js` and `lib/data.js` updated to match. (c) Added a "Not configured" runtime state so a deploy missing env vars fails visibly, not silently. (d) Firestore rules hardened: reviewer updates to proposals now cannot alter substantive fields (text, author, title, tier, classification) — only review fields. (e) Production build, lint, and type-check all pass clean (4/4 pages). Open items OI1–OI5 unchanged and still require resolution before go-live. | AI eng (for the reviewer (owner)) |
| 2026-06-01 | v0.3 | De-branded to a company-agnostic template. (a) All 521 `[Pluang]` party placeholders in the clause bank generalised to `[Company]`; 74 narrative references and a sample email genericised; 0 brand references remain in source. (b) Added `lib/config.js` with `COMPANY_LABEL` and `PLAYBOOK_VERSION` (env-overridable) so a single codebase serves any client; UI header, doc export header, and export filename now read from config. (c) Classification "Pluang Internal Policy" renamed to neutral "Internal Policy" across UI and export. (d) Repo/package renamed `clause-workbench`; PRD/README/DEPLOY de-branded; reviewer references generalised to "workspace owner". (e) Rebuilt — compiles, lints, type-checks clean. Drive write still non-functional (OI1) at the time. | AI eng |
| 2026-06-01 | v0.3 (record) | Drive connector now functional: PRD and project records written to the configured project folder. OI1 updated to reflect resolution for record-keeping; in-app export-to-Drive scope confirmation still pending. Codebase committed to the `legalops` repository. | AI eng |
| 2026-06-01 | v0.3 (decision) | Head of Legal sign-off: OI2 (privileged data in the personal-named Drive folder + Firebase) and OI3 (Firestore in Jakarta with global Firebase Auth) reviewed and ACCEPTED for v1. Open items remaining before go-live: OI1 (in-app export-to-Drive scope), OI4 (allowlist governance/offboarding), OI5 (Playbook re-seed process). | Head of Legal |
| 2026-06-01 | v0.4 | UI redesign approved by Head of Legal and applied: calm editorial ("trusted counsel") aesthetic — warm paper palette, serif display + clean sans UI, hairline rules, soft tier pills, left-sidebar navigation with per-section headers. System fonts only (external Google Fonts dependency removed). No functional/logic changes. Reviewed as static mockups before implementation; lint/build/type-check pass. Drive PRD copy is intentionally NOT auto-updated (per Head of Legal: refresh Drive source-of-truth only on request). | AI eng (design approved by Head of Legal) |
| 2026-06-01 | v0.5 | Deployment adapted to an org policy that blocks service-account key creation (no downloadable admin key available). (a) First reviewer + allowlist are bootstrapped by hand in the Firestore console (console writes bypass rules with owner privileges); reviewer role resolves from `allowlist.role`, so the custom-claim/setReviewer step is dropped. (b) Clause seeding moved to a server-side, reviewer-gated loader (`app/api/seed`) invoked by a one-time "Load Playbook clauses" button — no key, no CLI; the privileged clause text is served only server-side and never reaches the browser (no /public, no client bundle). (c) Firestore rule for `clauses` changed from `write: if false` to `write: if isReviewer()` to permit the one-time load and future re-seed (OI5). Anti-drift preserved: clause writes remain reviewer-only; contributors still cannot touch clauses. Live deployment to Firebase project `legalops2026` + Vercel in progress. | AI eng |

---
*All subsequent changes append to Section 12 and update the relevant section inline.*
