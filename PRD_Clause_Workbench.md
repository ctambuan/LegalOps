# Product Requirements Document — Clause Library Workbench (Contracting Engine)

**Status:** LIVE (deployed to production; in early team rollout). App v0.6; Playbook v3.1 — all 74 clauses redrafted.
**Live URL:** https://legal-ops-two.vercel.app/
**Product positioning:** This PRD covers the **Contracting Engine**, the first live module of the
broader **Legal Operations Workbench**. Three further modules are scaffolded as "To Be Developed":
Document Number Generator, Compliance Tracker, Budget Tracker.
**Owner (Product):** the reviewer (owner) — Head of Legal, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth for clauses:** [Company] Legal Contract Review Playbook v3.1 (01 Jun 2026)
**Last updated:** see Change Log (Section 12)

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
  (Document Number Generator, Compliance Tracker, **Contracting Engine** [live], Budget Tracker).
- Frontend/Hosting: **Next.js (App Router) deployed on Vercel** (production project; live URL above).
- Data: **Cloud Firestore (Jakarta, asia-southeast2)**, Firebase project `legalops2026`.
- Auth: **Firebase Authentication (Google provider)**. Access + reviewer role resolve from the
  `allowlist/{email}` document's `role` field via Firestore security rules (a `reviewer:true` custom
  claim is also honoured but is optional and not required in the live setup).
- Clause loading (one-time / re-seed): the privileged clause text is served only to a verified
  signed-in user by a server route (`app/api/seed`, which verifies the Firebase ID token against
  Firebase's public keys); the **client then writes the clauses under the user's own Firestore
  session**, so security rules confirm a reviewer. No service-account key, no CLI, no public path.
  Runs automatically for a reviewer when the library is empty.
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

## 9. Security Rules (intent — full rules in /firestore.rules)

- Reads of `clauses`, `proposals`, `adopted`: only if request.auth.token.email in allowlist.
- Writes to `proposals` (create): authenticated allowlisted user; authorEmail must equal token email.
- Status transitions on `proposals` and any write to `adopted`: only reviewer-role (the reviewer (owner)).
- `audit`: create-only; no update/delete by anyone (immutable).
- `allowlist`: no client writes; managed via console / admin only.

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
- OI4. **Allowlist governance.** Who maintains the allowlist; offboarding process.
- OI5. **Playbook update process.** PARTIALLY ADDRESSED (2026-06-01): the manual `.docx → seed JSON`
  re-sync + version-tag bump is now a documented release checklist in `/playbook/README.md`, and the
  app stamps re-synced clauses and adopted addenda with a single env-overridable `PLAYBOOK_VERSION_TAG`
  (now `v3.1`) — so "Re-sync from master" reloads the current clause text and labels it correctly (it
  reloads from the derived seed JSON, by design, not live from Drive). Still open: preserving adopted-
  addenda linkage across a version bump (each addendum keeps the `playbookVersion` stamp it was adopted
  under, but there is no automated re-mapping of an addendum onto a re-numbered/redrafted clause).
- OI6. **Privileged clause text sent to the Claude (Anthropic) API.** ACCEPTED (2026-06-01): the Head of
  Legal has accepted that, when a user invokes the in-app AI assist (draft / improve / review / explain),
  the relevant clause text is sent to Anthropic's Claude API over TLS to generate a **working draft**.
  Controls: the `ANTHROPIC_API_KEY` is server-side only (never in the browser bundle); the assist route
  requires a valid Firebase ID token for this project; no data is sent unless a user explicitly clicks an
  AI action; outputs are labelled AI working drafts and carry no authority until a human reviews/adopts
  them. Anthropic's API does not train on submitted data; confirm the organisation's data-retention
  setting (zero-retention if required) and that this egress is acceptable alongside OI2/OI3. The feature
  can be disabled entirely by unsetting `ANTHROPIC_API_KEY` or `NEXT_PUBLIC_AI_ASSIST=off`.

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

---
*All subsequent changes append to Section 12 and update the relevant section inline.*
