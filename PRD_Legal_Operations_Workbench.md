# Product Requirements Document — Legal Operations Workbench (whole-dashboard PRD)

**Status:** LIVE — v4.0 (consolidated). The single controlling PRD for the **entire** Legal Operations Workbench. It merges and supersedes the two prior PRDs — *Clause Library Workbench / Contracting Engine* (lineage to App v0.9) and *Company Data Module* (lineage to v3.10) — reconciling their differences (roles, approval-matrix ownership). Nothing from either is dropped; both histories are preserved in the Change Log (Section 15).
**Live URL:** https://legal-ops-two.vercel.app/ · **Firebase project:** `legalops2026` (Firestore, asia-southeast2 / Jakarta) · **Hosting:** Vercel (production = `main`).
**Owner (Product):** the owner — **General Counsel**, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not a Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth for clauses:** [Company] Legal Contract Review Playbook v3.2 (02 Jun 2026)
**Last updated:** see Change Log (Section 15)

> This is the single controlling record for the Workbench. Every architectural, product, or scope change
> MUST be reflected here and appended to the Change Log before it is adopted. A copy is maintained in the
> configured project Google Drive folder. AI-assisted outputs are working drafts subject to human review by
> qualified [Company] counsel and do not constitute legal advice or a Legal Department position until adopted.

## PRD Maintenance Protocol (owner directive, 2026-06-06)
Whenever the owner says **"update PRD"**, the assistant MUST, in order: (1) update **this** file in the repo
(`PRD_Legal_Operations_Workbench.md`) + a Change Log entry + version bump; (2) publish the latest to the
Google Drive Workbench folder (`DRIVE_FOLDER_ID = 1EUxfSoMhazorsUNEbSPSqruhukd3Nure`) as the live copy;
(3) archive the previous Drive copy into the Drive **Archived** subfolder
(`DRIVE_ARCHIVE_FOLDER_ID = 1kRaTNcs0wMnseEo7XKfXYZmbThMcoVG-`), date/version-stamped; (4) the latest is the
source for the next update. The repo file is the working source of truth; the Drive copy mirrors it. The
Drive connector can create/copy/search but **not move/delete**, so the superseded Workbench-folder copy must
be deleted manually — flag it, never skip it.

---

## 1. Problem & Vision

The Legal Department's tools were siloed Excel/Project files (a single-user clause workspace; four parallel
document-number registers; a corporate-data workbook). The Workbench replaces them with **one governed,
multi-user dashboard** that: serves the contracting Playbook with a propose→review→adopt loop; generates
standardised document numbers; holds the group's **company master data** (entities, approvals, signers,
risks, policies) as the single source of truth every tool reads; and provides **cost-disciplined AI agents**
grounded in that data. Built for a group legal team led by the **General Counsel**, used across **regional
counsel**. Cost-efficiency is a feature: it must run on free/minimal-cost tiers and never cost more than the
manual work it replaces (Section 4).

## 2. Users, Roles & Governance (unified — supersedes the original 2-role model)

Group RBAC + per-company scope. One role per account, applied across one or more companies
(`companies` = `"all"` or an array of entity codes). Capability helpers in `lib/constants.js` **mirror
`firestore.rules`** (the boundary): `isGC` / `hasCompany` / `isApproverFor` / `isMakerFor`.

| Role (stored key) | Capability | Scope |
|---|---|---|
| **General Counsel** (`gc`) | Super-admin: approve anything, edit live, manage users & company grants, tune agents, manage policies, run the Contracting review queue, edit DocGen settings | Group (all companies) |
| **Regional Counsel** (`regional`) | Maker — proposes changes | Group (all companies) |
| **Head of Legal** (`hol`) | Approver + direct editor, for its companies | Per-company (assigned) |
| **Country Counsel** (`country`) | Maker — proposes changes | Per-company (assigned) |
| (Implicit) Unauthorised | No access — blocked at Auth and rules | — |

**Reconciliation note.** The original Contracting/DocNumber PRDs used a 2-role model (Contributor /
Reviewer). That is now generalised: **legacy `reviewer`/`contributor` (the original owner's account)
normalise to GC**, and the legacy modules' "reviewer-only" gates (Contracting review queue, DocGen Settings,
clause re-sync/calibrate) now resolve to **`isReviewer()` ⇒ `isGC()`**. Roles live in the `allowlist` doc's
`role` field (an optional `reviewer:true` custom claim is also honoured ⇒ GC); there is **no Admin SDK** (org
policy blocks service-account keys), so role/claims are not set server-side.

**Maker-checker (Company Data).** A maker submits a change → `cfg_proposals` doc (`status: pending`, carrying
its `company`, before/after) → an approver for that company (its Head of Legal, or the GC) reviews a
side-by-side diff in **Change Requests** → **Approve** writes it live; **Reject** returns a note; both
audited; **no self-approval** (GC is the backstop). GC and in-scope Heads of Legal edit directly (audited).
**User management is GC-only and direct** (not maker-checker). The Contracting Engine uses its own
propose→review→adopt loop (Section 7).

## 3. Architecture & Security (as deployed)

- **Shell:** Next.js (App Router, client components) on **Vercel**; left-sidebar modules — Document Number
  Generator, Compliance Tracker, Contracting Engine, Budget Tracker, Task Tracker & Report, **Company Data**.
- **Data:** Cloud **Firestore** (Jakarta, `asia-southeast2`), project `legalops2026`. Realtime `onSnapshot`.
- **Auth:** **Firebase Authentication (Google)** + an **`allowlist`** collection (doc id = lowercased email).
  A user only gets in if allowlisted; role + companies resolve from the allowlist doc.
- **No Admin SDK / no service-account keys** (org policy). Therefore **Firestore security rules are the
  authorization boundary** (never client-only); privileged server routes verify the caller by validating the
  Firebase ID token manually (`lib/verifyIdToken.js`, used by `/api/seed`, `/api/assist`, `/api/calibrate`,
  `/api/policy/extract`). User management + master-data writes are client writes governed by rules.
- **Audit everything:** every write appends to the immutable, append-only `audit` collection (`audit()`).
- **Google Drive** integration (the reviewer's own OAuth, no SA key): `drive.file` to save exports/policy
  source files into the Workbench folder; broad `drive` scope (gated `NEXT_PUBLIC_DRIVE_MANAGE`) for in-app
  archiving of superseded files; `gmail.send` (gated `NEXT_PUBLIC_USER_INVITE_EMAIL`) for user invites.
- **AI (Claude):** server route `/api/assist` (Anthropic SDK, `claude-opus-4-8` default, adaptive thinking,
  prompt-cached system prompt; key server-only). Modes: the Contracting `draft/improve/review/explain` and a
  generic **`agent`** mode (Company Data agents) with a fixed guardrail preamble + per-call token cap.
- **Data residency:** Firestore in Jakarta; Firebase Auth is a global service (accepted, OI/NFR2).

## 4. Cost Discipline (a first-class requirement)

The dashboard exists to cut legal-ops cost; it runs on free/minimal tiers (Firestore Spark, Vercel Hobby,
Firebase Auth, the admin's own Gmail). **AI:** agents default to the cheapest capable model
(Haiku → Sonnet → Opus only when quality clearly pays — GC opts in per agent); per-use `max_tokens` caps;
prompt caching on; extended thinking only where it earns its tokens; **no automatic/background AI** — every
run is an explicit user action (cost is per run, not per defined agent). **Retrieval (RAG)** is lightweight
**lexical** ranking — no embeddings/vector DB/extra key (semantic embeddings deferred, OI). New paid
services/infra must be flagged for cost before adoption. (Mirrors `CLAUDE.md` principle #4.)

## 5. Data Model (Firestore — all collections)

**Contracting Engine**
- `clauses/{id}` — seed reference (read-only): title, cat, purpose, baseline, buyside, sellside, fallback,
  redflags, usageNotes, counselNotes, playbookVersion, optional `variants[]` ({label, tier, note, text}).
- `proposals/{id}` — type, jurisdiction, title, baseRef, tier, classification, text, rationale, redflag,
  originalText, status, authorEmail, authorName, createdAt, reviewedAt, reviewerEmail, reviewNote.
- `adopted/{id}` — snapshot of approved proposal + adoptedAt, adoptedByEmail, playbookVersion.

**Document Number Generator**
- `docnumbers/{id}` — date, pic, jira, department, docType, category, title, entity, entityCode,
  counterparty, signingMethod; value (valueCurrency, valueAmount, valueFrequency, usdEquivalent, budgetStatus,
  unbudgeted, fxRate, fxDate, valueBucket); approvers; filing (cabinet, folderRow, folderNumber, folderCode);
  seq, number, series ('STD'|'POL'), year; authorEmail, authorName, createdAt.
- `docgen_counters/{year}__{series}` — atomic running sequence (`next`), incremented in a transaction.
- `docgen_settings/config` — default PIC + per-(year,series) sequence starts (the approver matrix moved to
  Company Data; the legacy `approvers` field is stripped on save).
- `docgen_meta/drive` — Drive mirror pointer (Sheet fileId + content signature).

**Company Data** (`cfg_*`, prefix)
- `cfg_entities/{code}` — code, name, jurisdiction, address, registrationType, registrationNo, baseCurrency,
  entityType (`holding|controlled|non_controlled|""`), status. Subcollections: `directors`, `lob`, `signers`.
- `cfg_thresholds/bands` — { low, high }. `cfg_approvals/{deptCode}` — department, departmentCode, admin,
  low, mid, high.
- `cfg_agents/{presetId}` — GC **overrides only** for the fixed roster: { instruction?, model?, enabled }.
- `cfg_policies/{id}` — title, category, scope (`group|company`), company, version, effectiveDate,
  sourceName, sourceFileId, sourceUrl, status, chunkCount. Subcollection `chunks/{id}` — ord, text, scope,
  company, title (scope/company denormalised for rules + citation).
- `cfg_proposals/{id}` — domain, action (create|update|archive), targetId, company, label, before, after,
  status, proposerEmail, proposerName, reviewerEmail, reviewNote, timestamps.
- `risks/{id}` — title, description, company (entity code | "group"), likelihood, impact, mitigation, owner,
  status (open|mitigating|closed), createdBy, timestamps.

**Access / Task Tracker / Audit**
- `allowlist/{emailLower}` — email, role (`gc|regional|hol|country`), companies (`"all"|[codes]`), status
  (invited|active), displayName, invitedBy, invitedAt, lastSignInAt. Written by the GC's client session,
  governed by rules (no Admin SDK).
- `report_matters/{id}` — author-owned matters logged for a reporting period (manual now; JIRA LSRM later).
- `weekly_reports/{id}` — personal/combined weekly reports (kind, narrative, status, author/reviewer-visible).
- `report_settings/config` — roster + matter-group overrides (reviewer-writable).
- `audit/{id}` — append-only: actorEmail, action, targetType, targetId, fromStatus, toStatus, at.

## 6. Security Rules (the boundary — summary; canonical in `/firestore.rules`)

Helpers read the caller's `allowlist` doc: `isAllowlisted`, `isGC`, `hasCompany(c)`, `isApproverFor(c)`,
`isMakerFor(c)`; `isReviewer()` is a GC alias for the legacy modules.
- `allowlist` — read own doc, or any if GC; create/update/delete **GC-only**, approved-domain check
  (`pluang.com`, `batubara-id.com`), role ∈ the four roles, **no self-demote/self-delete**; the owner may
  update only their own sign-in metadata.
- `clauses` read allowlisted / write GC; `proposals` create by allowlisted-as-self + GC transitions
  (substantive fields immutable); `adopted` GC write; `audit` create-only, immutable.
- `docnumbers` create by allowlisted-as-self; update GC **or** allowlisted filing-metadata-only (number/seq/
  author/usdEquivalent/approvers locked); delete GC. `docgen_counters`/`docgen_meta` allowlisted r/w;
  `docgen_settings` read allowlisted / write GC.
- `cfg_entities` (+subs) read allowlisted; create GC; edit/archive `isApproverFor(code)`.
  `cfg_thresholds`/`cfg_approvals`/`cfg_agents` read allowlisted / write GC.
  `cfg_policies` (+chunks) **read-scoped** (`scope=='group' || hasCompany(company)`) / write GC.
- `cfg_proposals` create by in-scope maker (self, pending, `company==targetId` for update/archive);
  approve/reject `isApproverFor(company)` **and not the proposer**; delete never.
- `risks` **read-scoped** (`group || hasCompany`); create/update by in-scope maker; delete by in-scope approver.
- `report_matters`/`weekly_reports` author-or-reviewer visibility; `report_settings` write GC.

## 7. Module — Contracting Engine (Clause Library) · LIVE

The governed propose→review→adopt layer over the Contracting Playbook (v3.2), with anti-drift discipline.

- **Anti-drift / source of truth:** the clause library is seeded from the master Playbook (74 clauses;
  Baseline / Buy-Side / Sell-Side / Fallback / Red Flags / Purpose, plus clause-specific Models e.g. CL-05
  Term Model 1–4). Seed is READ-ONLY reference; contributions create separate `proposals` referencing a
  clause by id; approved items are `adopted` ADDENDA stamped with the Playbook version. The canonical
  Playbook (.docx in `/playbook/`) remains the controlled document.
- **Calibration into the bank** (deliberate human action): a one-click "Calibrate into bank" writes an
  adopted addendum's text into a chosen variant slot of the live clause bank (`calibrateClauseField`), and —
  if `GITHUB_TOKEN` is set — auto-commits to `data/clauses.seed.json` on the production branch (`/api/calibrate`,
  Firebase-token-gated + server-side GC check). The binary master `.docx` is never auto-edited (batch
  reconciliation at version bumps). "Re-sync from master" reads the seed JSON **live from the branch** when
  `GITHUB_TOKEN` is set (no stale-snapshot revert).
- **FRs:** searchable/filterable library with verbatim variants + tier labels + copy; proposal form (type,
  jurisdiction, title, baseRef, tier, classification, operative text, rationale, red flag; Mandatory-Law
  forces verbatim-citation + verification flag); lifecycle pending→approved|changes|rejected; GC-only review
  queue with side-by-side diff; adopted master list + **.docx export** + **Save to Drive** + full-Playbook
  **PDF**; immutable audit; **AI assist** (draft/improve/review/explain via `/api/assist`).
- Every position shows tier (Baseline / Acceptable Fallback / Escalation Required / Prohibited-High Risk) and
  classification (Mandatory Law / Internal Policy / Market-Standard / Preferred Posture); only Mandatory Law
  with a verbatim cited source is treated as verified law (verify before reliance).

## 8. Module — Document Number Generator · LIVE

Replaces the manual Excel workbook with a governed multi-user module.
- **Tabs:** Form & Generate (live preview; atomic sequence; result + Copy); Database (live register, by year,
  filter/sort, reviewer delete, Download CSV); Filing Tracker (Wet-Ink only; cabinet/row/folder → Folder
  Code); Settings (default PIC + per-year sequence starts — **the approval matrix now lives in Company Data →
  Approval Policy**, read live).
- **Numbering (faithful workbook port):** Standard `{No:000}/{JIRA}/{EntityCode}/{CounterpartyInitials}/{MonthRoman}/{Year}`
  (e.g. `001/L2231/BSC/SMB/VI/2026`); Policy `{No:000}-POL-{EntityCode}-{Year}`. `No` per-(year,series),
  starts at 001. `JIRA` `CMD-4847`→`C4847`. `EntityCode` from the live entity (carried as `entityCode`).
  `CounterpartyInitials` ignore legal-form identifiers (`PT Tunas Maju Selaras`→`TMS`). Business Unit stored
  for routing, not printed.
- **Value → USD/annum + routing:** currency + amount + frequency → USD-per-annum at today's rate
  (`/api/fxrate`, base USD; one-time fees as-is); required Budgeted/Unbudgeted gates routing. Approver matrix
  **read live from Company Data** (`cfg_approvals` + `cfg_thresholds`): Policy → highest; Administrative →
  dept admin; Agreement Unbudgeted → highest; Agreement Budgeted → by band (≤low → tier-1; low–high → tier-2;
  ≥high → highest). Band-key logic (`valueBucketKey`/`bucketLabel`/`approverCell`) so editing thresholds can
  never desync routing.
- **Live Google Sheet** mirror of the register in the Drive folder (CSV convert-on-import; `drive.file`;
  debounced, signature-deduped, silent token; falls back to Download CSV). Atomic sequences; immutable
  records except reviewer corrections + filing metadata; all changes audited.
- Code: `lib/docgen.js`, `lib/docgenDrive.js`, `app/DocGen.js`, `app/api/fxrate/route.js`, `lib/data.js`.
  FX feed: free no-key `open.er-api.com` (one-line swap to a licensed provider later).

## 9. Module — Company Data · LIVE

The editable master-data + access + AI layer (the single source of truth tools read).
- **Entities (Records):** entity detail **page** with tabs Profile · Directors · Lines of Business ·
  Authorized Signers; group **classification** (Holding / Controlled / Non-Controlled Subsidiary). Seeded
  from `lib/docgen.js` via one-click "Load defaults"; consumed live by tools through `useCompanyData()`.
- **Approval Policy:** GC-edited USD **thresholds** (consequence confirmation; ascending-validated) + per-
  department **routing**; the Document Number Generator reads both live.
- **Risk Register:** in-scope counsel log/update legal **risks** (likelihood, impact, owner, mitigation,
  status), read-scoped by company; closed via status; grounds the Legal Risk Analyst agent.
- **AI & Knowledge:**
  - **Agents** — a **fixed roster of 7 presets** (`lib/agentTemplates.js`): Document Processing
    (draft/review/standard-docs/approval-signing routing), Corporate Secretarial, Compliance & Licence Watch,
    Legal Risk Analyst, Report Generator, Legal Intake Triage, **Ask Legal**. GC **tunes** instruction +
    model and **enables/disables** (overrides in `cfg_agents`; reset = delete override) — cannot add/delete.
    Server prepends non-negotiable guardrails; cost-disciplined models + token caps; **test sandbox** (GC) +
    **Try** runner (any allowlisted user). Agents are **grounded in live data** scope-aware
    (`lib/structuredContext.js`): Secretarial → entities/directors/LoB; Compliance → licence records; Risk
    Analyst → the Risk Register; Ask Legal → policies (retrieved) + entities + approval matrix + signers.
  - **Policy Library (RAG):** ingest by paste / .txt / **PDF / DOCX** (server-side extraction at
    `/api/policy/extract` via `unpdf`/`mammoth`) → extraction-preview gate → **chunk + store** (original file
    archived to Drive when enabled) → **client-side lexical retrieval** (`retrievePolicyContext`) → answer
    via Claude **only from context, citing `[n]` sources**. Company policies + chunks are read-scoped.
- **Team & Access (GC-only):** add users by email (domain-restricted to `pluang.com`/`batubara-id.com`),
  assign role + company scope, auto-invite via the GC's Gmail (`gmail.send`, flag-gated) or copy-link; status
  + last sign-in; change-access / resend / revoke; no self-lockout. Honest model: pre-authorize + invite (no
  Google-account creation; Firebase Auth provisions on first sign-in).
- **Change Requests:** the maker-checker queue (Section 2) — scoped diffs, approve/reject, no self-approval.

## 10. Module — Task Tracker & Weekly Report (LSRM) · LIVE

Legal Service Request Management: team members **log matters** they handled in a reporting period
(`report_matters`, author-owned); Claude drafts a uniform house-style **weekly report** for review and
submission (`weekly_reports` — authors see their own, the GC sees the team and assembles the combined
report; every report editable/re-savable, each change audited). A live JIRA LSRM pull is a later phase.
Code: `app/TaskTracker.js`, `/api/report`, `lib/data.js`.

## 11. Modules — Scaffolded (To Be Developed)

**Compliance Tracker** and **Budget Tracker** are present in the shell as planned modules, not yet built.
(The corporate workbook's Business-License/Compliance and Board data partly live today under Company Data →
Entities' Lines of Business and Directors.)

## 12. Non-Functional Requirements

NFR1 Security: Firebase Auth + allowlist enforced in Firestore rules; least-privilege; no client-trusted role
checks. NFR2 Data residency: Firestore in Jakarta; Firebase Auth global (accepted). NFR3 Availability:
best-effort internal tool, no formal SLA. NFR4 Auditability: append-only audit; exports logged. NFR5
Accessibility: keyboard-navigable, sufficient contrast, semantic HTML. NFR6 Cost: free/minimal-cost tiers
(Section 4).

## 13. Deployment Runbook (summary; full in `/DEPLOY.md`)

1. Firebase `legalops2026`: Firestore in Jakarta; Google sign-in; **publish `firestore.rules`** (re-publish
   whenever rules change — e.g. Company Data scoping, `risks`). 2. **No service-account key** — bootstrap the
   first GC + allowlist by hand in the Firestore console (doc id = email, `role`, `companies`). 3. Deploy on
   Vercel with the `NEXT_PUBLIC_FIREBASE_*` env vars (production = `main`); add the Vercel domain to Auth →
   Authorized domains. 4. Env flags: `ANTHROPIC_API_KEY` (AI); `NEXT_PUBLIC_DRIVE_UPLOAD` + `NEXT_PUBLIC_DRIVE_FOLDER_ID`
   (Drive save / Sheet mirror / policy source); `NEXT_PUBLIC_DRIVE_MANAGE` + `NEXT_PUBLIC_DRIVE_ARCHIVE_FOLDER_ID`
   (in-app archiving); `NEXT_PUBLIC_USER_INVITE_EMAIL` (Gmail invites); `NEXT_PUBLIC_ALLOWED_USER_DOMAINS`;
   `NEXT_PUBLIC_APP_URL`; optional `GITHUB_TOKEN`/`GITHUB_REPO`/`GITHUB_BRANCH` (clause re-sync/calibrate).
   5. GC signs in; clauses auto-load; seed Company Data defaults; review the Team & Access roster.

## 14. Open Items

- **Resolved (legacy / Contracting & DocNumber):** OI1 Drive write authorisation (drive.file save + broad
  `drive` archiving, no SA key); OI2 privileged data in Drive+Firebase accepted; OI3 Jakarta + global Auth
  accepted; OI4 allowlist governance (`/docs/ALLOWLIST_GOVERNANCE.md`); OI5 Playbook re-seed/version-tag +
  addenda version flagging; OI6 privileged clause text to Claude accepted (server-only key, explicit action).
- **Resolved (Company Data):** policy source storage (Drive + Firestore text); approved user domains; invite
  email mechanism (Gmail `gmail.send`); Risk Register module (+ Risk Analyst grounding).
- **Open:** (a) second-pair-of-eyes gate on **threshold** edits (GC-only direct today); (b) **semantic
  embeddings** for retrieval (deferred; lexical now — has cost); (c) **OCR** for scanned PDFs (has cost);
  (d) workbook **importer** for Directors/LoB/approvers; (e) **historical impact preview** for threshold
  changes; (f) off-domain user exceptions (external counsel); (g) per-company **read-scoping beyond
  policies/risks** (entities/approvals are group-readable, accepted for now); (h) Compliance Tracker & Budget
  Tracker modules; (i) automated Drive archiving (connector can't move/delete — manual delete step today).

## 15. Change Log

> v4.0 consolidates two prior PRDs. Their full histories are preserved below as **Stream A** (Contracting
> Engine + Document Number Generator + Workbench foundation) and **Stream B** (Company Data Module). New
> unified entries continue at the top.

- 2026-06-06 | **v4.0 (Consolidation)** | Merged `PRD_Clause_Workbench.md` (App v0.9) and
  `PRD_Company_Data_Settings.md` (v3.10) into this single whole-dashboard PRD; reconciled roles (unified
  4-role RBAC + company scope; legacy reviewer/contributor → GC; legacy reviewer gates ⇒ isGC) and approval-
  matrix ownership (moved from DocGen Settings to Company Data → Approval Policy, read live by DocGen).
  Documented every module incl. Task Tracker & Weekly Report. The two prior PRD files become pointer stubs;
  `CLAUDE.md` and the "update PRD" protocol now target this file. Published to Drive; prior Drive copies
  archived. No code change.

### Stream B — Company Data Module (v1 → v3.10)
- 2026-06-06 (v3.10) Rules republished → Risk Register live; full ecosystem deployed (PR #45 merged).
- 2026-06-06 (v3.9) Risk Register module built + Legal Risk Analyst grounded (resolves OI9).
- 2026-06-06 (v3.8) PRD Maintenance Protocol added (publish to Drive + archive on every "update PRD").
- 2026-06-06 (v3.7) PRD body synced to as-built.
- 2026-06-06 (v3.6) Agents grounded in structured data (Corporate Secretarial, Compliance, Ask Legal).
- 2026-06-06 (v3.5) Policy source file archived to Drive on ingest.
- 2026-06-06 (v3.4) PDF/DOCX policy ingestion (server-side `/api/policy/extract`, unpdf + mammoth).
- 2026-06-06 (v3.3) Phase 3 — Policy Library + lexical retrieval (RAG v1); per-company policy read-scoping.
- 2026-06-06 (v3.2) Agent roster consolidated to 7 (Document Processing + Ask Legal).
- 2026-06-06 (v3.1) Agents → fixed preset roster + cost discipline (CLAUDE.md #4 added).
- 2026-06-06 (v3.0) Phase 2 — Agents built (cfg_agents, `/api/assist` agent mode + guardrail preamble).
- 2026-06-05 (v2.9) Pre-deploy security review (bound proposal company==targetId; strip legacy approvers;
  legacy contributor → GC).
- 2026-06-05 (v2.8) Approval Policy editor + DocGen rewire → Phase 1 feature-complete.
- 2026-06-05 (v2.7) Group RBAC + company scoping built (4 roles; GC-only admin; company-scoped approval).
- 2026-06-05 (v2.6) Maker-checker for entities + role rename (GC / Regional Counsel).
- 2026-06-05 (v2.5) Group classification on entities (Holding / Controlled / Non-Controlled).
- 2026-06-05 (v2.4) Records (Entities) area + `useCompanyData()` consumption layer; DocGen entity rewire.
- 2026-06-05 (v2.3) User Management (Team & Access) built — client writes governed by rules (no Admin SDK).
- 2026-06-05 (v2.2/2.1) User Management decisions (domains, Gmail invite); invite template (Appendix A).
- 2026-06-05 (v2) Restructured per senior design critique (entity-centric IA, maker-checker, archive-truth,
  policy extraction gate, templated agents). (v1) Initial spec — superseded.

### Stream A — Contracting Engine + Document Number Generator + Workbench foundation (v0.1 → v0.9)
- 2026-06-03 | v0.9 | Reviewer-only in-app Drive archiving of superseded docs (move, not delete; broad `drive`
  scope gated `NEXT_PUBLIC_DRIVE_MANAGE`, enabled in production). `lib/driveManage.js`, `app/DriveArchive.js`.
- 2026-06-02 | v0.8 (Document Number Generator) | Second module shipped live (PRs #32–#35): Form/Database/
  Filing/Settings; faithful workbook formula + CONTROL SHEET approver matrix; atomic per-(year,series)
  sequence; live register + native Google-Sheet mirror; value→USD/annum via `/api/fxrate`; Budgeted/Unbudgeted
  routing; Policy → highest approver; dropped Department segment; sequence starts at 001; entity
  "Macrodimarc"→"Flow Exchange Inc." (FLW). New collections docnumbers/docgen_counters/docgen_settings/docgen_meta.
- 2026-06-02 | v3.2 (Playbook) | First post-launch calibration end-to-end (CL-31 Non-Exclusivity); master
  `.docx` v3.1→v3.2 (surgical edit) + seed JSON in lockstep; one-click "Calibrate into bank" + `/api/calibrate`
  repo commit; full-Playbook PDF to Drive; "Re-sync from master" reads seed live from the branch.
- 2026-06-01 | v3.1 | Full magic-circle redraft of all 74 clauses (master v3.1); Drive records moved to the
  canonical "Legal Operations Workbench" folder; version stamping fixed (`PLAYBOOK_VERSION_TAG`); clause-aware
  card tags (CL-05 Model 1–4); **Claude AI assist** (draft/improve/review/explain, `/api/assist`, OI6);
  in-app **Save to Drive** (`drive.file`, OI1); shipped to production (PR #27); OI4/OI5 closed.
- 2026-06-01 | v0.1 → v0.7 | Initial PRD + build (Next.js 15/Vercel + Firestore Jakarta + Firebase Auth +
  allowlist; anti-drift principle); hardened rules; de-branded to `[Company]` template (`lib/config.js`);
  org-policy-compliant deployment (no SA key; console-bootstrapped allowlist; server-gated clause loader
  `/api/seed`); repositioned as **Legal Operations Workbench** (four modules); master Playbook brought under
  version control in `/playbook/`. (Full per-entry detail retained in git history / the archived v0.9 Drive copy.)

---

## Appendix A — Invite email template
Subject: "You've been granted access to the [Company] Legal Operations Workbench." Body greets the invitee,
states who granted access, the sign-in steps (open `{{appUrl}}`, Sign in with Google, use the exact invited
email), the access level, and a Confidential & Legally Privileged footer. Sent from the GC's own Gmail
(`gmail.send`); merge fields filled client-side; `{{role}}` renders as General Counsel / Regional Counsel /
Head of Legal / Country Counsel. Optional personal note; Resend reuses the template. Wording subject to GC approval.

*All subsequent changes append to Section 15 and update the relevant section inline.*
