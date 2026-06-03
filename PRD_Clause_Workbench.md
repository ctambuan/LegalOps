# Product Requirements Document — Clause Library Workbench (Contracting Engine)

**Status:** LIVE (deployed to production; in team rollout). App v0.8; Playbook v3.2 (first post-launch calibration). **Two modules now live — the Contracting Engine and the Document Number Generator (Section 12).** Live features include Claude AI assist (OI6), in-app Save to Drive (OI1), and a live Google-Sheet source-of-truth mirror for document numbers. All open items OI1–OI6 resolved or process-defined.
**Live URL:** https://legal-ops-two.vercel.app/
**Product positioning:** This PRD covers the **Legal Operations Workbench**. Two modules are live —
the **Contracting Engine** (Sections 1–11) and the **Document Number Generator** (Section 12). Two
further modules remain scaffolded as "To Be Developed": Compliance Tracker, Budget Tracker.
**Owner (Product):** the reviewer (owner) — Head of Legal, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth for clauses:** [Company] Legal Contract Review Playbook v3.2 (02 Jun 2026)
**Last updated:** see Change Log (Section 13)

> This PRD is the single controlling record for the Workbench. Every architectural, product, or
> scope change MUST be reflected here and appended to the Change Log before it is considered adopted.
> A copy of this document is to be maintained in the configured project Drive folder for future
> reference. AI-assisted outputs are working drafts subject to human review by qualified [Company]
> counsel and do not constitute legal advice or a Legal Department position until reviewed and adopted.

---

## 1. Problem Statement

The Playbook (now v3.1) is the authoritative, privileged source of [Company]'s contracting positions. Today,
collaborative improvement of that library is constrained: a Project-based AI workspace is siloed to a
single user, and there is no governed, multi-user pathway for the legal team to propose clause
improvements, additional fallbacks, conditional expansions, and net-new clauses, route them to the
Head of Legal for review, and adopt approved positions into a controlled record — without risking
drift from, or contamination of, the Playbook itself.

## 2. Goals & Non-Goals

**Goals**
- G1. Let authorised team members retrieve any Playbook clause (current master: v3.1) with its variants.
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
  on top of it. Adopted items are stamped as addenda with the current Playbook version (now v3.1).
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

- The clause library is seeded from the master Playbook (now v3.1; 74 clauses: Baseline, Buy-Side,
  Sell-Side, Fallback, Red Flags, Purpose, plus clause-specific Models where defined, e.g. CL-05 Term).
- Seed data is treated as READ-ONLY reference. Contributions never mutate seed records; they create
  separate proposal records that reference a seed clause by id.
- Adopted positions are stored as ADDENDA with explicit linkage to the Playbook clause and a version
  stamp. The canonical Playbook remains the Legal Department's controlled document.
- **Calibration into the bank (2026-06-02, Head-of-Legal decision).** A reviewer may, via a one-click
  **"Calibrate into bank"** action on an adopted addendum, write the approved text into the chosen
  variant slot of the live clause bank (Firestore) — a *deliberate human action*, not automatic on
  approval, preserving the anti-drift gate while removing the manual master-edit/re-sync round trip.
  If `GITHUB_TOKEN` is configured, the same action also commits the change to `data/clauses.seed.json`
  on the production branch, so the live bank and the machine source of truth stay in lockstep and a
  later re-sync will not revert it. The **binary master `.docx` is never auto-edited** — it remains the
  formatted human record, reconciled in batch at a version bump (the calibration discipline still applies).
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
- FR7. AI assist (optional; PRD OI6): authenticated users may invoke Claude to draft a new clause,
  improve/fallback an existing clause, review a counterparty's clause for risks, or explain a clause.
  Outputs are working drafts that pre-fill the proposal form (draft/improve) or display read-only
  (review/explain); they carry no authority until reviewed and adopted. Server-side key; disablable.

## 6. Non-Functional Requirements

- NFR1. Security: Firebase Auth (Google sign-in) + email allowlist enforced in Firestore rules.
  Privileged data; least-privilege access; no client-trusted role checks.
- NFR2. Data residency: Firestore in **asia-southeast2 (Jakarta)** per the workspace data-residency posture
  and the Playbook's cross-border-transfer caution. NOTE: Firebase Authentication is a global service;
  confirm this is acceptable with DPO/Head of Special Project. (Open item — see Section 11.)
- NFR3. Availability target: best-effort; internal tool. No formal SLA in v1.
- NFR4. Auditability: append-only audit collection; exports logged.
- NFR5. Accessibility: keyboard-navigable, sufficient contrast, semantic HTML.

## 7. Architecture (selected; as deployed)

- Product shell: **Legal Operations Workbench** — left-sidebar navigation across four modules
  (**Document Number Generator** [live], Compliance Tracker, **Contracting Engine** [live], Budget Tracker).
- Document Number Generator (Section 12): a unified form → atomic per-(year, series) sequence
  (Firestore transaction) → live `docnumbers` register, with a server FX route (`app/api/fxrate`,
  base USD) for value→USD/annum conversion and a live native-Google-Sheet mirror of the register in
  the Drive folder (CSV convert-on-import, same `drive.file` scope). Formula + data model in Section 12 / 8.
- Frontend/Hosting: **Next.js (App Router) deployed on Vercel** (production project; live URL above).
- Data: **Cloud Firestore (Jakarta, asia-southeast2)**, Firebase project `legalops2026`.
- Auth: **Firebase Authentication (Google provider)**. Access + reviewer role resolve from the
  `allowlist/{email}` document's `role` field via Firestore security rules (a `reviewer:true` custom
  claim is also honoured but is optional and not required in the live setup).
- Clause loading / "Re-sync from master": the privileged clause text is served only to a verified
  signed-in user by a server route (`app/api/seed`, which verifies the Firebase ID token against
  Firebase's public keys); the **client then writes the clauses under the user's own Firestore
  session**, so security rules confirm a reviewer. No service-account key, no CLI, no public path.
  Runs automatically for a reviewer when the library is empty. **Always-latest:** when `GITHUB_TOKEN`
  is set, the route reads `data/clauses.seed.json` **live from the production branch at request time**,
  so re-sync reflects every committed calibration regardless of deploy timing (falls back to the
  build-bundled seed if the token is unset). This removes the stale-snapshot risk where a re-sync
  shortly after a calibration could otherwise have reverted it.
- Document export: client-side .docx generation (docx library); download, or **save directly to the
  Drive folder** via the reviewer's Google OAuth token with the `drive.file` scope (no service-account
  key). Gated by `NEXT_PUBLIC_DRIVE_UPLOAD` (OI1).
- AI assist (Claude): a server route (`app/api/assist`, same Firebase-ID-token gate as `/api/seed`)
  calls the Anthropic Claude API (`claude-opus-4-8`, adaptive thinking, prompt-cached house-style
  system prompt) for four modes — draft, improve, review, explain. The `ANTHROPIC_API_KEY` is
  server-only; outputs are AI working drafts subject to human review (PRD OI6). Disable by unsetting
  the key or `NEXT_PUBLIC_AI_ASSIST=off`.
- Records (PRD, change log, exports): **Google Drive** — the dedicated **"Legal Operations Workbench"** folder (ID `1EUxfSoMhazorsUNEbSPSqruhukd3Nure`).

Rationale: Next.js on Vercel gives a fast, modern, maintainable SPA/SSR hybrid with first-class DX;
Firestore gives realtime multi-user sync and rule-based security without standing up a server;
keeping data in Jakarta aligns with the conservative data-residency posture for privileged Indonesian
legal-team data. Firebase Auth is global — flagged as an open compliance item to verify, not assume.

## 8. Data Model (Firestore)

- `clauses/{id}` — seed reference (read-only): title, cat, purpose, baseline, buyside, sellside,
  fallback, redflags, usageNotes, counselNotes, playbookVersion, and optional `variants[]`
  (clause-specific labelled drafting models, e.g. CL-05 Term's Model 1–4 — each `{label, tier, note,
  text}`). The clause-detail tabs and the library-card tags are both derived from `variants` when
  present, otherwise from the standard positions that have text — a single source so they always match.
- `proposals/{id}` — type, jurisdiction, title, baseRef, tier, classification, text, rationale,
  redflag, originalText, status, authorEmail, authorName, createdAt, reviewedAt, reviewerEmail,
  reviewNote.
- `adopted/{id}` — snapshot of approved proposal + adoptedAt, adoptedByEmail, playbookVersion
  (stamped from `PLAYBOOK_VERSION_TAG`). Addenda are numbered sequentially at export time, not stored.
- `audit/{id}` — append-only: actorEmail, action, targetType, targetId, fromStatus, toStatus, at.
- `allowlist/{email}` — role: 'contributor' | 'reviewer'. Drives access + claims.

Document Number Generator (Section 12):
- `docnumbers/{id}` — one generated number per record: date, pic, jira, department, docType, category,
  title, entity, counterparty, signingMethod; value fields (valueCurrency, valueAmount, valueFrequency,
  usdEquivalent, budgetStatus, unbudgeted, fxRate, fxDate, valueBucket); approvers; filing
  (cabinet, folderRow, folderNumber, folderCode); seq, number, series ('STD' | 'POL'), year;
  authorEmail, authorName, createdAt.
- `docgen_counters/{year}__{series}` — atomic running sequence (`next`), incremented in a Firestore
  transaction so concurrent generation never collides; sequence starts at 1 (never 000).
- `docgen_settings/config` — approver-matrix overrides (per department), default PIC, per-(year,series)
  sequence starts. Reviewer-writable.
- `docgen_meta/drive` — Drive mirror pointer: the register Sheet's fileId + last-synced content signature.

## 9. Security Rules (intent — full rules in /firestore.rules)

- Reads of `clauses`, `proposals`, `adopted`: only if request.auth.token.email in allowlist.
- Writes to `proposals` (create): authenticated allowlisted user; authorEmail must equal token email.
- Status transitions on `proposals` and any write to `adopted`: only reviewer-role (the reviewer (owner)).
- `audit`: create-only; no update/delete by anyone (immutable).
- `allowlist`: no client writes; managed via console / admin only.
- `docnumbers`: read if allowlisted; create if allowlisted (authorEmail == token email); update if
  reviewer OR allowlisted-for-filing-metadata-only (number/seq/author/usdEquivalent/approvers must stay
  unchanged); delete reviewer-only. `docgen_counters` + `docgen_meta`: read+write if allowlisted (needed
  by the generate transaction and the Sheet-sync pointer). `docgen_settings`: read allowlisted, write reviewer-only.

## 10. Deployment Runbook (summary; full in /DEPLOY.md) — as performed, key-free

1. Firebase project (`legalops2026`): Firestore created in **asia-southeast2 (Jakarta)**; Google
   sign-in enabled; Firestore security rules published (no composite indexes required).
2. **No service-account key** (org policy blocks key creation). The first reviewer + allowlist are
   created by hand in the Firestore console (console writes bypass rules with owner privileges):
   document ID = email (lowercase), field `role` = `reviewer` / `contributor`.
3. App deployed on **Vercel** with the six `NEXT_PUBLIC_FIREBASE_*` env vars (production = `main`).
4. The Vercel domain (`legal-ops-two.vercel.app`) added to Firebase **Authentication → Authorized
   domains** so Google sign-in works.
5. Reviewer signs in; the 74 clauses load automatically (server-served text + client-side write under
   the reviewer's session). Re-seed uses the same path.
6. Verify (Section 11 test): non-allowlisted account denied; contributor has no Review tab and cannot
   write `adopted`/transition; reviewer can review + adopt + export.

## 11. Open Items / Risks (must be resolved before go-live)

- OI1. **Drive write authorisation.** RESOLVED (2026-06-01): record-keeping writes go to the configured
  project folder via the connector; and the in-app master `.docx` export can now **save directly to the
  Drive folder** using the reviewer's own Google sign-in with the narrow `drive.file` OAuth scope (enabled
  on the consent screen 2026-06-01) — no service-account key (org policy compliant). Gated by
  `NEXT_PUBLIC_DRIVE_UPLOAD`; target folder via `NEXT_PUBLIC_DRIVE_FOLDER_ID`. Note: `drive.file` lets the
  app write files it creates into the folder; if the folder is a Shared Drive, uploads use
  `supportsAllDrives=true`. Verify in production that the reviewer's account has write access to the folder.
- OI2. **Privileged data in Google Drive + Firebase.** RESOLVED (2026-06-01): the Head of Legal has
  reviewed and accepted storing privileged legal data in (a) the dedicated **"Legal Operations Workbench"**
  Google Drive folder (ID `1EUxfSoMhazorsUNEbSPSqruhukd3Nure`) — the canonical Drive location, to which the
  records were moved on 2026-06-01 from the personal-named folder — and (b) Firebase. Recorded as a
  Head-of-Legal decision; no further DPO routing required for v1 on this point.
- OI3. **Data residency vs Firebase Auth global service.** RESOLVED (2026-06-01): the Head of Legal has
  accepted that Firestore data resides in Jakarta (asia-southeast2) while Firebase Authentication runs as
  a global service. Acceptable for v1.
- OI4. **Allowlist governance.** RESOLVED (process defined, 2026-06-01): ownership, onboarding,
  offboarding and a quarterly-review cadence are documented in `/docs/ALLOWLIST_GOVERNANCE.md`. Owner
  (accountable) is the Head of Legal; the `allowlist` collection is console-managed (client writes
  blocked at the rules layer). Offboarding = delete the `allowlist/{email}` doc (revokes access at the
  rules layer) + disable/delete the Firebase Auth user. An in-app admin screen is intentionally not
  built (would require relaxing the `allowlist` write rule); revisit only with Head-of-Legal sign-off.
- OI5. **Playbook update process.** RESOLVED (process defined, 2026-06-01): the manual `.docx → seed JSON`
  re-sync + version-tag bump is a documented release checklist in `/playbook/README.md`, and the app
  stamps re-synced clauses and adopted addenda with a single env-overridable `PLAYBOOK_VERSION_TAG`
  (now `v3.1`). For adopted-addenda linkage across a version bump: each addendum stores the
  `playbookVersion` it was adopted under; the Master view and the exported `.docx` now **display that
  version** and visibly flag any addendum adopted under an older version than the current master, so a
  reviewer can re-confirm those entries against the recalibrated clause text after a bump (step added to
  the release checklist). There is still no *automated* re-mapping of an addendum onto a re-numbered
  clause — by design it remains a human re-confirmation, consistent with the anti-drift principle.
- OI6. **Privileged clause text sent to the Claude (Anthropic) API.** ACCEPTED (2026-06-01): the Head of
  Legal has accepted that, when a user invokes the in-app AI assist (draft / improve / review / explain),
  the relevant clause text is sent to Anthropic's Claude API over TLS to generate a **working draft**.
  Controls: the `ANTHROPIC_API_KEY` is server-side only (never in the browser bundle); the assist route
  requires a valid Firebase ID token for this project; no data is sent unless a user explicitly clicks an
  AI action; outputs are labelled AI working drafts and carry no authority until a human reviews/adopts
  them. Anthropic's API does not train on submitted data; confirm the organisation's data-retention
  setting (zero-retention if required) and that this egress is acceptable alongside OI2/OI3. The feature
  can be disabled entirely by unsetting `ANTHROPIC_API_KEY` or `NEXT_PUBLIC_AI_ASSIST=off`.

## 12. Module — Document Number Generator (LIVE)

**Purpose.** Replace the manual Excel "2026 Document Number Generator" workbook (formula-driven,
single-file, siloed across four department sheets) with a governed, multi-user dashboard module that
generates standardised document numbers, stores every record in a live register, auto-resolves the
business approver, and tracks physical filing — with a Google Sheet that always mirrors the register
as a portable source of truth. Replaces four parallel Excel registers with one unified flow + one
database.

**12.1 Tabs.**
- **Form & Generate** — input form with a live preview; on Generate it allocates the sequence
  atomically, builds the number, resolves the approver, stores the record, and shows the result (with
  Copy) directly beneath the button.
- **Database** — the live register; navigate by year, filter and sort like a spreadsheet; reviewer can
  delete; Download CSV. Kept in lockstep with the Drive Sheet.
- **Filing Tracker** — **Wet-Ink documents only**; any authorised user records the cabinet/row/folder
  (Folder Code auto-built); the result flows back to the Database and the Sheet.
- **Settings** — editable approval matrix (per department), default PIC, per-year sequence starts.
  Reviewer-writable; others read-only.

**12.2 Numbering formula (faithful port of the workbook; verified against its sample rows).**
- Standard: `{No:000}/{JIRA}/{EntityCode}/{CounterpartyInitials}/{MonthRoman}/{Year}` — e.g.
  `001/L2231/BSC/SMB/VI/2026`.
- Policy: `{No:000}-POL-{EntityCode}-{Year}`.
- `No` — per-(year, series) running sequence, zero-padded to ≥3 digits, **starts at 001** (never 000).
- `JIRA` — Legal & Compliance rule: with a dash (`CMD-4847` → `C4847`, first letter + digits padded to
  4); a plain number is kept as-is.
- `EntityCode` — Pluang entity → code (e.g. PT Bumi Santosa Cemerlang → BSC).
- `CounterpartyInitials` — first letter of each significant word, **ignoring legal-form identifiers**
  (PT, CV, Pte Ltd, Tbk, Ltd, Inc, GmbH, Sdn Bhd, Pvt Ltd, …): `PT Tunas Maju Selaras` → `TMS`.
- `MonthRoman` — Roman month; `Year` — 4-digit.
- Business Unit is captured on the record (for approver routing + the register) but is **not** printed
  in the number (segment dropped 2026-06-02 once the database made it redundant).

**12.3 Contract value → USD/annum + approver routing.**
For Agreements the user records currency (USD, IDR, PHP, SGD, RMB→CNY, EUR, INR, HKD, AUSD→AUD, KRW,
JPY), an amount (auto thousands separators), and a frequency (Monthly/Annually/One time). The dashboard
converts to a **USD-per-annum equivalent at today's market rate** via the server route `app/api/fxrate`
(base USD; one-time fees are tested as-is, not annualised) and stores the USD figure + the rate/date.
A **required Budgeted / Unbudgeted** choice gates routing. Approver matrix (ported from the workbook
CONTROL SHEET, overridable in Settings):
- **Policy** → highest approver (`agreeOver` = "1 C-level AND Claudia/Richard").
- **Administrative Documents** → the department's admin approver.
- **Agreements, Unbudgeted** → highest approver, regardless of value.
- **Agreements, Budgeted** → by USD/annum: ≤ 25,000 → tier-1; 25,000–100,000 → tier-2; ≥ 100,000 → highest.

**12.4 Live Google Sheet source of truth.** Firestore is the realtime store. A background syncer pushes
the whole register to a **single native Google Sheet** in the Drive folder on any change (generate,
delete, filing edit, or another session's change) — CSV uploaded with Drive convert-on-import (no
Sheets API; same `drive.file` scope). Debounced and de-duplicated by a content signature held in
`docgen_meta` (no redundant writes, no cross-session thrash); uses a **silent cached token only** (no
surprise consent popups); falls back to in-app **Download CSV** when `NEXT_PUBLIC_DRIVE_UPLOAD` is off.

**12.5 Integrity.** Sequences are allocated in a Firestore transaction per (year, series), so concurrent
generation never collides. Records are immutable except reviewer corrections/deletes and the
filing-metadata update path (number/seq/author/value/approvers stay locked at the rules layer). Every
generate / delete / settings change is written to the append-only `audit` trail.

**12.6 Code.** `lib/docgen.js` (control-sheet data + pure formula logic), `lib/docgenDrive.js` (CSV/Sheet
build + content signature + Drive create/update), `app/DocGen.js` (UI), `app/api/fxrate/route.js`
(market FX), data access in `lib/data.js`. Data model in Section 8; rules in Section 9 / `/firestore.rules`.

**FX provider note.** Google publishes no stable public FX API (Google Finance API retired); the route
uses a free no-key market feed (open.er-api.com, base USD) covering all offered currencies — a one-line
endpoint swap if a licensed provider (e.g. Bloomberg/Reuters) is later preferred.

## 13. Change Log

| Date (UTC) | Version | Change | By |
|---|---|---|---|
| 2026-06-01 | v0.1 | Initial PRD authored. Stack selected: Next.js/Vercel + Firestore (Jakarta) + Firebase Auth w/ email allowlist. Anti-drift principle established. Open items logged, incl. unresolved Drive write authorisation. | AI eng (for the reviewer (owner)) |
| 2026-06-01 | v0.2 | Codebase built and verified. (a) Next.js upgraded off 14.2.5 to 15.5.7 after the build surfaced a published Next.js security advisory; deploy-time instruction added to pin latest patched release against the live registry (sandbox registry could not give a clean final audit). (b) Firebase init refactored to lazy, browser-only `getFb()` after the production build caught a static-prerender crash (`auth/invalid-api-key`); `lib/auth.js` and `lib/data.js` updated to match. (c) Added a "Not configured" runtime state so a deploy missing env vars fails visibly, not silently. (d) Firestore rules hardened: reviewer updates to proposals now cannot alter substantive fields (text, author, title, tier, classification) — only review fields. (e) Production build, lint, and type-check all pass clean (4/4 pages). Open items OI1–OI5 unchanged and still require resolution before go-live. | AI eng (for the reviewer (owner)) |
| 2026-06-01 | v0.3 | De-branded to a company-agnostic template. (a) All 521 `[Pluang]` party placeholders in the clause bank generalised to `[Company]`; 74 narrative references and a sample email genericised; 0 brand references remain in source. (b) Added `lib/config.js` with `COMPANY_LABEL` and `PLAYBOOK_VERSION` (env-overridable) so a single codebase serves any client; UI header, doc export header, and export filename now read from config. (c) Classification "Pluang Internal Policy" renamed to neutral "Internal Policy" across UI and export. (d) Repo/package renamed `clause-workbench`; PRD/README/DEPLOY de-branded; reviewer references generalised to "workspace owner". (e) Rebuilt — compiles, lints, type-checks clean. Drive write still non-functional (OI1) at the time. | AI eng |
| 2026-06-01 | v0.3 (record) | Drive connector now functional: PRD and project records written to the configured project folder. OI1 updated to reflect resolution for record-keeping; in-app export-to-Drive scope confirmation still pending. Codebase committed to the `legalops` repository. | AI eng |
| 2026-06-01 | v0.3 (decision) | Head of Legal sign-off: OI2 (privileged data in the personal-named Drive folder + Firebase) and OI3 (Firestore in Jakarta with global Firebase Auth) reviewed and ACCEPTED for v1. Open items remaining before go-live: OI1 (in-app export-to-Drive scope), OI4 (allowlist governance/offboarding), OI5 (Playbook re-seed process). | Head of Legal |
| 2026-06-01 | v0.4 | UI redesign approved by Head of Legal and applied: calm editorial ("trusted counsel") aesthetic — warm paper palette, serif display + clean sans UI, hairline rules, soft tier pills, left-sidebar navigation with per-section headers. System fonts only (external Google Fonts dependency removed). No functional/logic changes. Reviewed as static mockups before implementation; lint/build/type-check pass. Drive PRD copy is intentionally NOT auto-updated (per Head of Legal: refresh Drive source-of-truth only on request). | AI eng (design approved by Head of Legal) |
| 2026-06-01 | v0.5 | Deployment adapted to an org policy that blocks service-account key creation (no downloadable admin key available). (a) First reviewer + allowlist are bootstrapped by hand in the Firestore console (console writes bypass rules with owner privileges); reviewer role resolves from `allowlist.role`, so the custom-claim/setReviewer step is dropped. (b) Clause seeding moved to a server-side, reviewer-gated loader (`app/api/seed`) invoked by a one-time "Load Playbook clauses" button — no key, no CLI; the privileged clause text is served only server-side and never reaches the browser (no /public, no client bundle). (c) Firestore rule for `clauses` changed from `write: if false` to `write: if isReviewer()` to permit the one-time load and future re-seed (OI5). Anti-drift preserved: clause writes remain reviewer-only; contributors still cannot touch clauses. Live deployment to Firebase project `legalops2026` + Vercel in progress. | AI eng |
| 2026-06-01 | v0.6 | LIVE. (a) Product repositioned as **Legal Operations Workbench** with four top-level modules; the clause tool became the **Contracting Engine** (live); Document Number Generator, Compliance Tracker, Budget Tracker added as "To Be Developed" pages. (b) Landing/sign-in copy set by Head of Legal: title "Legal Operations Workbench", eyebrow "Built for Legal Department", "Confidential & Legally Privileged. Access is restricted to authorized accounts." (c) Deployed to Vercel (`legal-ops-two.vercel.app`) against Firebase `legalops2026`; Google sign-in working after adding the Vercel domain to Authorized domains. (d) Clause-loading hardened through three fixes: the server→Firestore REST write was not recognised as the user (rules denied), so writes were moved to the client's Firestore session; the token check via Google `tokeninfo` rejected Firebase ID tokens, replaced by direct RS256 verification against Firebase's public x509 certs; the manual button was replaced by automatic loading on first empty library for a reviewer. 74 clauses loaded successfully and visible to all signed-in allowlisted users. | AI eng (live rollout with Head of Legal) |

| 2026-06-01 | v0.7 | Master Playbook brought under control as the single source of truth. The genuine `Pluang Contracting Playbook v3.0` (.docx, fully formatted) is stored, version-controlled, in the repo at `/playbook/`. Head of Legal directed: on each adopted change, calibrate the **master directly** (revise the clause text, bump version), **never altering formatting** — edits are surgical to `word/document.xml` only, all other package parts copied byte-for-byte (round-trip validated). A copy is also kept in the Google Drive folder (uploaded by the Head of Legal, since the connector can't ingest/edit Word files in place); each new version is delivered for upload, newest dated file = current. The Firestore `clauses` collection is a derived read-only reference seeded from this master. Calibration process documented in `/playbook/README.md`. | AI eng (directed by Head of Legal) |

Open items still outstanding at v0.7: OI4 (allowlist governance / offboarding owner), OI5 (Playbook
re-seed of the derived `clauses` collection when the master version bumps). Recommended next: complete
the access safety test; add team members; replace the `[Company]` label with the real organisation name.

| 2026-06-01 | v3.1 (Playbook) | Full magic-circle redraft of all 74 clauses completed and deployed live, in 15 reviewed cohorts: every template made operative and paste-ready, consistent defined terms (the Company / the Counterparty / this Agreement etc.), UK/Commonwealth spelling, (a)/(i) numbering, cross-refs as `Clause [●] (Title)`; guidance separated into Notes for Counsel; risk-allocation cluster (CL-36–40) elevated; CL-05 Term recovered as Model 1–4 tabs. Master Playbook re-issued as **v3.1** (`/playbook/00.01_..._v3.1_2026-06-01.docx`): clause bodies replaced in place from the redrafted set; all front matter, methodology, negotiation matrix, glossary, headers/footers and numbering preserved; validated. Dashboard and master now carry the same clause content. | AI eng (redraft adopted by Head of Legal) |

| 2026-06-01 | v3.1 (record) | Drive records reorganised into a dedicated **"Legal Operations Workbench"** Google Drive folder (ID `1EUxfSoMhazorsUNEbSPSqruhukd3Nure`), now the canonical Drive location (superseding the personal-named folder; records moved by the Head of Legal). File-naming convention adopted for Drive records: **"Legal Operations Workbench - PRD v[X].[Y] - [YYYY-MM-DD]"** (and analogous for other artefacts). Drive-location references in this PRD (Section 7, OI2) updated accordingly. | AI eng |

| 2026-06-01 | v3.1 (engine) | Contracting Engine corrected to reflect the live v3.1 master. (a) **Version stamping fixed:** "Re-sync from master" was writing every clause to Firestore labelled `v3.0` (the seed JSON carries no version field and the writer defaulted to a literal "v3.0"), and adopted addenda were likewise stamped `v3.0`, despite the seed content being the v3.1 redraft. Introduced a single env-overridable `PLAYBOOK_VERSION_TAG` (now `v3.1`) used for both the clause re-sync stamp and the adopted-addenda stamp, and bumped the display `PLAYBOOK_VERSION` default to `v3.1 (01 Jun 2026)`. Confirmed the Drive folder's current master is `...v3.1_2026-06-01.docx`. (b) **Library-card tags now reflect each clause's own templates:** cards previously hardcoded five tags (Baseline/Buy-Side/Sell-Side/Fallback/Red Flags) lit on/off by flat fields, so clauses with bespoke models (CL-05 Term's Model 1–4) showed wrong/empty tags. A single `clauseTemplates()` helper now drives both the card tags and the clause-detail tabs from the same source (a clause's `variants` when defined, else the standard positions with text), so tags and tabs always match; CL-05 shows its model labels (shortened to "Model 1"…"Model 4" on the card, full label in the tab and on hover); tags carry tier-colour dots. (c) Manual `.docx → seed JSON` + version-tag release checklist documented in `/playbook/README.md`; OI5 updated to PARTIALLY ADDRESSED. Section 8 data model updated to record `variants[]`, usageNotes and counselNotes. Lint, build and type-check pass clean. No change to the anti-drift model: re-sync reloads the derived seed JSON (by design), not live from Drive. | AI eng |

| 2026-06-01 | v3.1 (AI assist) | Added an optional Claude-powered assist to the Contracting Engine (PRD OI6, accepted by the Head of Legal). New server route `app/api/assist` (Node runtime, same Firebase-ID-token gate as `/api/seed`, `ANTHROPIC_API_KEY` server-side only) calls the Anthropic API (`claude-opus-4-8`, adaptive thinking, prompt-cached house-style system prompt) in four modes — **draft** a new clause, **improve/fallback** an existing one, **review** a counterparty's clause for risks (severity-tagged), and **explain** a clause. UI: a "✨ Draft with Claude" action on the Contribute form (operative text → text field; any "Notes for Counsel" → rationale), and an "Ask Claude" panel in the clause detail (Explain / Review a counterparty version). All outputs are labelled AI working drafts with no authority until human review/adoption; nothing is sent externally unless a user clicks an AI action. Shared Firebase-token verifier extracted to `lib/verifyIdToken.js` (used by both `/api/seed` and `/api/assist`). Feature is disablable via `NEXT_PUBLIC_AI_ASSIST=off` or by unsetting the key. Added `@anthropic-ai/sdk`. Lint/build/type-check clean. New open item OI6 logged for the privileged-text egress. | AI eng (accepted by Head of Legal) |

| 2026-06-01 | v3.1 (Drive export) | In-app **Save to Drive** for the master export (OI1 resolved). The reviewer's Google sign-in now requests the narrow `drive.file` OAuth scope (enabled on the consent screen); the master `.docx` uploads straight into the "Legal Operations Workbench" folder under the reviewer's identity via the Drive REST API — no service-account key (org-policy compliant). New `lib/driveUpload.js`; `lib/auth.js` captures/refreshes the Google OAuth access token and exposes `getDriveAccessToken()`; `lib/firebase.js` adds the scope when enabled; `exportMaster()` now returns `{blob, filename}` so the same artefact can be downloaded or uploaded. Gated by `NEXT_PUBLIC_DRIVE_UPLOAD` (default off) with `NEXT_PUBLIC_DRIVE_FOLDER_ID`. 401s trigger a one-time token refresh + retry. Each save is logged to the audit trail. Lint/build/type-check clean. | AI eng (Drive scope enabled by Head of Legal) |

| 2026-06-01 | v3.1 (shipped to production) | All of the above merged to `main` via PR #27 and **deployed live**. During go-live a Vercel **two-project mismatch** surfaced — the GitHub repo was building one project while the public domain (`legal-ops-two.vercel.app`) served another, so production initially still showed v3.0; resolved by reconciling the connected project / env vars so `main` deploys to the live domain. Production environment variables configured: `ANTHROPIC_API_KEY` (AI assist), `NEXT_PUBLIC_DRIVE_UPLOAD=on` + `NEXT_PUBLIC_DRIVE_FOLDER_ID` (Save to Drive). Net result now live at `https://legal-ops-two.vercel.app/`: correct v3.1 version stamping, clause-aware card tags (CL-05 Model 1–4), Claude AI assist (draft/improve/review/explain), and in-app Save to Drive. Lesson recorded: keep a single Vercel project bound to `main`; retire any duplicate project to avoid stale-deploy confusion. Open items remaining: OI4 (allowlist governance/offboarding) and OI5 (adopted-addenda linkage across a Playbook version bump). | AI eng (deployed by Head of Legal) |

| 2026-06-01 | v3.1 (OI4/OI5 closed) | Closed the last two open items. **OI4 (allowlist governance):** added `/docs/ALLOWLIST_GOVERNANCE.md` defining ownership (Head of Legal), onboarding, offboarding (delete `allowlist/{email}` + disable the Auth user), and a quarterly review cadence; console-managed, no in-app admin screen (would require relaxing the `allowlist` write rule — deferred behind sign-off). **OI5 (addenda linkage across a version bump):** the Master view and exported `.docx` now display each addendum's adopted `playbookVersion` and visibly flag any adopted under an older version than the current `PLAYBOOK_VERSION_TAG`, with a re-confirm step added to the `/playbook/README.md` release checklist — human re-confirmation by design (no automated re-mapping). No new functional risk; lint/build/type-check clean. | AI eng (governance owned by Head of Legal) |

| 2026-06-02 | v3.2 (Playbook) | **First post-launch calibration** — the discipline exercised end-to-end. An adopted addendum (**CL-31 Non-Exclusivity**, an *Improvement* to the Baseline, proposed by Christine Tambunan and approved by the Head of Legal) was folded into the master: the CL-31 Baseline operative text was revised in the master `.docx` (surgical single-`<w:t>`-run edit; all other package parts copied byte-for-byte; saved as `…_v3.2_2026-06-02.docx`, v3.1 retained for audit) **and** in `data/clauses.seed.json` (identical text — seed and master kept in lockstep). Version bumped v3.1 → v3.2 (`PLAYBOOK_VERSION_TAG`, display default, header, source-of-truth line, `playbook/README.md`). After deploy, **"Re-sync from master"** loads the recalibrated CL-31 into the dashboard clause bank, now stamped v3.2; the prior adopted addendum will show as adopted under v3.1 (older) until re-confirmed, per the OI5 flow. Demonstrates the anti-drift loop: propose → adopt (addendum) → human calibration of the master → re-sync. | AI eng (adopted by Head of Legal) |

| 2026-06-02 | v3.2 (calibration + PDF) | **One-click calibration and full-Playbook PDF.** (a) Master & Export now has a per-addendum **"Calibrate into bank"** control (reviewer picks the target variant): it writes the approved text into the live clause bank (Firestore, `calibrateClauseField`) instantly, and — if `GITHUB_TOKEN` is configured — also auto-commits the change to `data/clauses.seed.json` on the production branch via the new server route `app/api/calibrate` (Firebase-token gated **and** server-side reviewer-checked via Firestore REST; fine-grained PAT, contents:write, single repo). Decided by the Head of Legal to keep a deliberate human gate (not automatic on approval) while removing the manual master-edit/re-sync round trip; the binary master `.docx` is never auto-edited (batch reconciliation at version bumps). §4 updated. (b) New **"Save Playbook PDF to Drive"** button renders the current clause bank (all clauses, current text) to PDF (`lib/pdfPlaybook.js`, jsPDF) and uploads it to the Drive folder via the reviewer's `drive.file` scope (generic `uploadToDrive`). Export buttons relabelled to distinguish the adopted-addenda `.docx` from the full-Playbook PDF. New env: `GITHUB_TOKEN`/`GITHUB_REPO`/`GITHUB_BRANCH` (optional). Lint/build/type-check clean. | AI eng (calibration model approved by Head of Legal) |

| 2026-06-02 | v3.2 (live re-sync) | **"Re-sync from master" now always catches the latest.** `app/api/seed` reads `data/clauses.seed.json` **live from the production branch at request time** when `GITHUB_TOKEN` is set (GitHub contents API, raw, no-store), instead of only the seed bundled at the last build — so re-sync reflects every committed calibration immediately, regardless of deploy timing. Fixes a stale-snapshot footgun where a re-sync shortly after a "Calibrate into bank" could have reverted the calibration. Falls back to the bundled seed if the token is unset/fetch fails; the loader toast now reports the source ("latest from master" vs "bundled snapshot"). Clarified that the structured master for re-sync is the seed JSON (kept current by calibration); the Playbook PDF is the rendered archive, not a re-sync source. §7 + env example updated. Lint/build/type-check clean. | AI eng |

| 2026-06-02 | v0.8 (Document Number Generator — build) | **Second Workbench module shipped live** (PR #32). Built the Document Number Generator with Form / Database / Settings tabs, replacing the manual Excel workbook with a governed, multi-user module: faithful port of the workbook formula and the CONTROL SHEET approver matrix (`lib/docgen.js`, verified against the workbook's sample rows); **atomic per-(year, series) sequence** via a Firestore transaction (`docgen_counters`) so concurrent generation can never collide; a live `docnumbers` register (`Database` tab); and a **native Google Sheet in the Drive folder that mirrors the register on every change** (CSV convert-on-import via the existing `drive.file` scope; `lib/docgenDrive.js`). New Firestore collections `docnumbers` / `docgen_counters` / `docgen_settings` / `docgen_meta` with rules (Section 9). The Sheet sync was then made **fully live/automatic** (background, debounced, signature-deduped, silent-token) rather than a manual button. Lint/build clean. | AI eng (for the Head of Legal) |
| 2026-06-02 | v0.8 (value, filing, FX) | **Value engine + Filing Tracker** (PR #33). (a) Counterparty initials now **ignore legal-form identifiers** (PT, CV, Pte Ltd, Tbk, Ltd, Inc, GmbH, Sdn Bhd, Pvt Ltd, …) so `PT Tunas Maju Selaras` → `TMS`. (b) Contract value entered as **currency + amount (auto separators) + frequency**, converted to a **USD-per-annum equivalent at today's market rate** via new server route `app/api/fxrate` (base USD; one-time fees tested as-is) to route the approver; the USD figure + rate/date are stored and mirrored to the Sheet. (c) New **Filing Tracker** sub-tab shows **Wet-Ink documents only** and lets any authorised user record cabinet/row/folder (Folder Code auto-built); rule relaxed so allowlisted users may update **filing metadata only** (number/seq/author/value/approvers stay immutable). Lint/build clean. | AI eng |
| 2026-06-02 | v0.8 (routing + refinements) | (a) **Budgeted / Unbudgeted** made a **required** choice on agreements (gates routing: Unbudgeted → highest approver; Budgeted → USD/annum tier). (b) **Policy** documents always route to the highest approver. (c) **Number format simplified**: dropped the Department segment → `{No}/{JIRA}/{Entity}/{CounterpartyInitials}/{Month}/{Year}` (Business Unit still stored for routing/register). (d) **Sequence starts at 001** (never 000). (e) Entity **"Macrodimarc Technology Corporation" → "Flow Exchange Inc." (FLW)**. (f) Generated-number result card moved to **below the Generate button** (visible without scrolling). PRs #34–#35. Deploy note: a merge to `main` did not always auto-trigger a Vercel build — resolved each time with an empty "trigger deploy" commit; keep a single Vercel project bound to `main`. | AI eng (for the Head of Legal) |
| 2026-06-03 | v0.9 (Drive archiving of superseded docs) | **Reviewer-only in-app Drive housekeeping.** New panel at the foot of Contracting Engine → **Master & Export** lists the documents in the Workbench Drive folder and lets the reviewer move a superseded file (revised PRD, old master, stale export) into the existing **Archived** subfolder in two clicks. Implemented as a *move, not a delete* (Drive parent re-link via the Files API `addParents`/`removeParents`), so files stay restorable. New `lib/driveManage.js` (`listFolderFiles` / `ensureArchiveFolder` / `moveFileToFolder`) and `app/DriveArchive.js`; runs under the reviewer's own OAuth token (401 → one refresh + retry), no service-account key. **Scope decision (Head of Legal):** archiving must act on files the app did not create, which `drive.file` cannot do, so when enabled the reviewer's Google sign-in requests the broad `https://www.googleapis.com/auth/drive` scope — a deliberate escalation, accepted, gated OFF by default behind `NEXT_PUBLIC_DRIVE_MANAGE` (falls back to narrow `drive.file` when off). New env `NEXT_PUBLIC_DRIVE_MANAGE` / `NEXT_PUBLIC_DRIVE_ARCHIVE_FOLDER_ID` (defaults to the live Archived folder). DEPLOY.md §10 documents the consent-screen change + re-login. Lint/build/type-check clean. | AI eng (broad Drive scope approved by Head of Legal) |

---
*All subsequent changes append to Section 13 and update the relevant section inline.*
