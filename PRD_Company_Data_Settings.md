# Product Requirements Document — Company Data Module (formerly "Settings")

**Status:** PROPOSED — v2.2 (design-reviewed). User Management decisions resolved (approved domains + zero-cost Gmail invite); invite email drafted (Appendix A). Not yet built.
**Product positioning:** A new top-level module for the **Legal Operations Workbench** — a centralised, governed **Company Data** layer (the source of truth) that every other tool reads from, plus the access-control surface for the whole workbench. Sibling to the live **Contracting Engine** and **Document Number Generator** (see `PRD_Clause_Workbench.md`).
**Owner (Product):** the reviewer (owner) — Head of Legal, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not a Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth (today, to be migrated):** hardcoded arrays in `lib/docgen.js` (`ENTITIES`, `DEPARTMENTS` + approvers, `CABINETS`, `DOC_TYPES`, `CURRENCIES`); the `allowlist` collection (`firestore.rules:9`); and the `2026_Corporate_Database_Control` workbook (Board Members, Business License, Corporate Approval Tracker sheets).
**Last updated:** see Change Log (Section 18)

> Controlling record for the Company Data module. Every architectural, product, or scope change MUST be
> reflected here and appended to the Change Log before it is adopted. A copy is to be kept in the
> configured project Drive folder. AI-assisted outputs are working drafts subject to human review by
> qualified [Company] counsel and do not constitute legal advice or a Legal Department position.

---

## 0. What changed across versions (design-review response)

v2 was a direct response to a senior product-design critique of v1. v2.1 adds User Management.

| v1 (rejected) | v2 / v2.1 (this doc) | Why |
|---|---|---|
| Five flat, equal "domains" | **Three grouped worlds** (Records · Approval Policy · AI & Knowledge) + admin areas | v1 mirrored the database, not how counsel think |
| Signers a separate top-level table | **Signers nested inside the Entity** detail page | Everything about one entity in one place |
| Approval matrix = a 25×4 editable grid | **Drill into one department**; thresholds edited with impact preview | A 100-cell wall is intimidating and error-prone |
| "Settings" at the bottom of the sidebar | Renamed **Company Data**, given prominence | It is the data backbone, not disposable preferences |
| Head-of-Legal-only writes (team can't configure) | **Maker-checker** (counsel propose → Head of Legal approves) | Resolves "configurable by the Counsel team" |
| 🗑 that silently archives | **Archive (reversible, default)** vs flagged hard **Delete** | The verb/icon must tell the truth |
| Versioned policies only | Policy **extraction-preview gate** + source/version on every cited answer | An AI citing the wrong/old policy is a liability |
| Free-text agent prompt | **Templated instruction + test sandbox** | Counsel are lawyers, not prompt engineers |
| (no user management) | **User Management (Team & Access)** — admin adds users by email; pre-authorize + auto-invite; domain-restricted | Admins must onboard the team without engineering or console access |
| (absent) | Empty states, dirty-state guard, visible "last changed / revert", global search, multi-currency framing | Trust and intuitiveness for rare-use master data |

## 1. Problem Statement

The data the workbench runs on — entities, directors, lines of business, the approval matrix and its
thresholds, authorised signers, AI agents' instructions, the policy corpus — **and the list of who may
use the workbench at all** — is today either hardcoded in source (`lib/docgen.js`), absent (signers,
agents, policy library), or editable only via the Firebase console / Admin SDK (the `allowlist`). The
Legal / In-House Counsel team needs **one governed place** to maintain all of this: to propose data
changes for Head-of-Legal approval, and for an admin to onboard new users by email — with approved
changes propagating live to every tool, and uploaded policies forming a trustworthy RAG knowledge base.

## 2. Goals & Non-Goals

**Goals**
- G1. Promote master data to a top-level **Company Data** module, grouped into intuitive worlds.
- G2. **Maker-checker governance**: any counsel proposes Add/Edit/Archive; the Head of Legal approves
  before anything goes live (reuses the existing propose→review→adopt pattern).
- G3. Single source of truth: every tool reads master data live from one config layer.
- G4. Safe high-consequence edits: threshold impact preview, reference-checked archiving, visible change
  history and revert, dirty-state protection.
- G5. Trustworthy policy RAG: extraction preview before use; version/source on every answer.
- G6. Safe agent authoring: templated instructions + a test sandbox.
- G7. **User Management**: an admin onboards users by email (pre-authorize + auto-invite), restricted to
  approved company domains, with roles, status, and revocation — no console access required.
- G8. Zero-downtime migration: hardcoded constants become the seed; tools fall back to seed when empty.

**Non-Goals (v1 build)**
- NG1. No direct writes to live data except via approval (counsel) or admin action (Head of Legal).
- NG2. No hard delete of records referenced by live data — reference-checked, archive-first.
- NG3. No real-time co-editing of the same record.
- NG4. The Policy RAG does not give legal advice; answers are cited working drafts under human review.
- NG5. **The workbench cannot and does not create or "enrol" anyone's Google account.** Google accounts
  are external and already exist. Adding a user *pre-authorizes* an email and *invites* it; Firebase Auth
  auto-provisions the app user record on that person's first Google sign-in. (See Section 13.)
- NG6. No public or counterparty access.

## 3. Users, Roles & Governance (Maker-Checker)

| Role | Who | Capabilities |
|---|---|---|
| Contributor (Counsel) | Named legal / compliance / product team on the allowlist | Read all Company Data; **propose** Add / Edit / Archive on any record; see status of own proposals; consume the data through every tool |
| Reviewer / Head of Legal (Admin) | Workspace owner and any designated deputy | All Contributor rights + **approve / reject** proposed changes; **direct edit** (own edits apply immediately, self-audited); upload & index policies; manage agents; **manage users (Team & Access)** |
| (Implicit) Unauthorised | Not on the allowlist | No access — blocked at Auth and rules |

**Maker-checker flow (reused from the Contracting Engine):** counsel edits a record and clicks **Submit
for approval** → a `cfg_proposals` doc (`status: pending`) captures before/after → the record shows
"Pending approval" to the proposer → the Head of Legal sees a **Change Requests** queue with a
side-by-side diff and an impact summary → **Approve** applies to live; **Reject** returns with a note;
both audited. The Head of Legal's own edits apply immediately (they are the checker) and are audited.

**User management is an admin function, NOT maker-checker:** adding/removing users is a direct,
reviewer-only control action (access control should not sit in a proposal queue). See Section 13.

## 4. Source-of-Truth & Migration Principle

- Hardcoded arrays in `lib/docgen.js` become **seed data** (`data/company.seed.json`), loaded once per
  collection via a server route, mirroring the clause pattern (`/api/seed` + `seedClausesViaApi`,
  `lib/data.js:103`).
- After seeding, the Firestore `cfg_*` collections are authoritative. Pure formula functions in
  `lib/docgen.js` stay pure and are fed live data instead of module-level arrays.
- **Fallback:** the consumption hook returns seed constants when a collection is empty, so the Document
  Number Generator works from first deploy through full population.
- Every record carries `status` (`active`|`archived`), `updatedBy`, `updatedAt`. Deletes are
  archive-first; hard delete is reviewer-only and blocked when references exist.

## 5. Information Architecture

Rename the module **Company Data**; give it prominent placement. Group into **three worlds** plus two
admin-only areas:

```
COMPANY DATA
│
├─ ① RECORDS — corporate records
│     Entities  ← the spine. Opening an entity = a full detail PAGE with tabs:
│         Profile · Directors · Lines of Business · Authorized Signers
│
├─ ② APPROVAL POLICY — governance rules (plain-language intro distinguishing it from signers)
│     Thresholds   — edit USD bands, with impact preview + effective date
│     Routing      — drill into ONE department to see/edit its approval routes
│
├─ ③ AI & KNOWLEDGE — clearly fenced from corporate records
│     Agents          — templated instruction + test sandbox
│     Policy Library  — upload → extraction-preview gate → indexed (version/source on every answer)
│
├─ ④ TEAM & ACCESS (admin-only) — manage users: add by email, role, status, invite, revoke
│
└─ ⑤ CHANGE REQUESTS (reviewer-only) — the maker-checker queue: diffs + impact + approve/reject
```

**Plain-language disambiguation** at the top of Approval Policy:
> *Approval routing* = who must **sign off internally** to enter into a document, by value and
> department. *Authorized signers* (under each Entity) = who may **legally sign** on the entity's behalf.

## 6. Interaction Grammar (consistent, but right-sized to the data)

One consistent grammar — list → open → edit → submit → toast → audit — with the container sized to the
record:
- **Simple records** (approver route, director, signer, user): right-side **drawer**.
- **Rich records** (an entity with its children): a full **detail page**.
- **List views** reuse `.toolbar` / `.dtable`; each has search, an item count, a primary **`+ Add`**, and
  per-row **✎ Edit** + **Archive/Delete** (Section 7).
- **Save** for counsel = **"Submit for approval"**; for the Head of Legal = applies live. Both toast + audit.
- **Dirty-state guard**, **visible "Last changed by X on Y" + Revert**, **empty/first-run states**, and a
  **cross-domain global search** ("find *Lindawati* anywhere").

## 7. Delete vs Archive (telling the truth)

- Default destructive action is **Archive** (reversible; `status:archived`; hidden from pickers, retained
  for references). Archived items appear under an **Archived** filter and can be **Restored**.
- True **Delete** (irreversible) appears **only** when a reference check finds the record is used nowhere
  live, clearly labelled permanent. Archiving/deleting a referenced record is blocked with a plain
  explanation. Icons/verbs match behaviour.

## 8. Data Model

Reviewer-writable / allowlisted-readable, prefixed `cfg_`. Counsel mutate them only via `cfg_proposals`.

### ① Records — `cfg_entities/{entityId}`
```
{ code:"BSC", name:"PT Bumi Santosa Cemerlang", jurisdiction:"Indonesia", address,
  registrationType:"NIB", registrationNo:"9120105122415", baseCurrency:"IDR",
  status:"active", updatedBy, updatedAt }
   └─ directors/{id}: { name, title, appointmentDate, validity, privyId, fitProperDecreeNo, status }
   └─ lob/{id}:       { code:"66153", description, licenseName, issuingAuthority, validityPeriod, status }
   └─ signers/{id}:   { signerName, title, maxThresholdUsd, jointWith:[signerId]|null, validFrom, validTo, status }
```
### ② Approval Policy
- `cfg_thresholds/bands` → `{ bands:[{ id, label, maxUsd }], effectiveFrom, updatedBy, updatedAt }`
- `cfg_approvals/{id}` → `{ department, departmentCode, bandId, approver, status }`

### ③ AI & Knowledge
- `cfg_agents/{agentId}` → `{ name, instructionTemplateId, instruction, guardrails, model:"claude-opus-4-8", policyScope:[policyId]|"all", status, updatedBy, updatedAt }`
- `cfg_policies/{policyId}` → `{ title, category, jurisdiction, fileRef, version, effectiveDate, status:"uploaded"|"extracted"|"indexing"|"indexed"|"older", extractionApprovedBy, chunkCount, indexedAt, updatedBy, updatedAt }`

### ④ Team & Access — `allowlist/{emailLower}` (existing collection, extended)
```
{ email:"jane@pluang.com", role:"contributor"|"reviewer", status:"invited"|"active"|"suspended",
  displayName, invitedBy, invitedAt, firstSignInAt, lastSignInAt, updatedBy, updatedAt }
```
*Doc id is the lowercased email, matching `email()` in the rules. Written only by the server route
(Section 13), never the client.*

### Governance — `cfg_proposals/{id}`
```
{ domain, targetId|null, action:"create"|"update"|"archive", before, after, impact,
  status:"pending"|"approved"|"rejected", proposerEmail, reviewNote, reviewerEmail, createdAt, reviewedAt }
```

## 9. Consumption Layer

- One hook **`useCompanyData()`** subscribes (`onSnapshot`) to the live `cfg_*` collections and exposes
  `{ entities, directorsByEntity, lobByEntity, signersByEntity, approvalBands, approvals, agents,
  policies }`, each with seed fallback.
- Data-access functions sit beside `listenDocgenSettings`/`saveDocgenSettings` (`lib/data.js:209`),
  routing counsel writes through `cfg_proposals` and applying approved changes live, with `audit()`.
- The **Document Number Generator** migrates its entity dropdown, approver routing, and threshold bands
  to `useCompanyData()`. Contracting, Budget and Task Tracker read from the same hook.

## 10. Approval-Threshold Safety

- Threshold/route edits show an **impact preview** before submission and again at approval (e.g. "alters
  routing for 25 departments; would have routed N of the last 12 months' documents differently").
- Bands strictly ascending by `maxUsd` (inline-validated). Signer `maxThresholdUsd` warned if above the
  entity's top band. Thresholds are USD; each entity declares `baseCurrency`; the FX assumption
  (`/api/fxrate`) is stated at the edit point. Threshold changes carry `effectiveFrom`; historical
  `docnumbers` retain the `approvers` computed at generation.

## 11. Policy RAG — Trust by Design

1. **Upload** → Drive (`drive.file`, `lib/driveUpload.js`) or Firebase Storage; row `status:"uploaded"`.
2. **Extraction-preview gate** (`/api/policy/extract`): extracted text shown to the reviewer to confirm
   before use (guards mangled tables / bad OCR) → `status:"extracted"`.
3. **Index** (`/api/policy/index`): chunk → embed (recommend **Voyage AI**; Cohere alt) → **Firestore
   vector search** (native; right-sized for dozens–hundreds of policies) → `status:"indexed"`.
4. **Retrieve + generate**: Agent embeds the query, pulls top-k chunks within `policyScope`, passes to
   **Claude** (`claude-opus-4-8`, via `/api/assist` + the agent's `instruction`). Every answer shows
   **source policy + section + version**, under the "verify before relying" guardrail.
5. **Versioning**: re-upload supersedes and flags the old one `older`; answers warn on superseded sources.

## 12. Agents — Safe Authoring for Non-Engineers

- Agents built from **instruction templates** with baked-in guardrails, not a naked prompt box.
- A **test sandbox** runs the agent on a sample question + scope and shows the cited answer **before
  saving**. Model defaults to `claude-opus-4-8`; `policyScope` constrains retrieval.

## 13. User Management (Team & Access)

**Mental model (honest).** The workbench cannot create or "enrol" a Google account — those are external
and already exist. "Adding a user" = **pre-authorize an email + send an invite**. The person signs in
with their existing Google account; **Firebase Auth auto-provisions their app user on first sign-in**;
Firestore rules let them in because their email is on the `allowlist`.

**Who can manage:** Head of Legal (reviewer/admin) only. This is a direct admin action, not maker-checker.

**Add-user journey (decisions: auto-invite + domain-restricted):**
1. Admin opens **Team & Access → `+ Add user`**, enters an email and picks a role
   (Contributor / Reviewer).
2. The email is validated against the **approved-domain allowlist**
   (`ALLOWED_USER_DOMAINS = pluang.com, batubara-id.com`). Off-domain emails are rejected with a clear
   message — protecting privileged legal data from typos and outside addresses.
3. On save, the reviewer's **own client session writes** the `allowlist/{emailLower}` doc with
   `status:"invited"` and the role, **governed by Firestore rules** (see Section 14). *(Implementation
   note: this project deliberately has no Admin SDK — `lib/verifyIdToken.js` documents that org policy
   blocks service-account keys — so there is no `/api/users` route and no custom claims. The role lives
   in the allowlist doc, which the app already honours, and the rules are the security boundary.)* An
   **invite email** is then sent (next paragraph).

   **Invite delivery (zero-cost):** the route sends the invite **as the signed-in admin via the Gmail
   API** (`gmail.send` scope added to the existing Google OAuth — the same auth already used for sign-in
   and `drive.file`). No third-party email service, no extra cost; the invitee receives it from the
   admin's own address, so replies/queries reach the right person. A Gmail App-Password + SMTP route is a
   viable fallback. Wording in Appendix A.
4. The list shows the user as **Invited**. On their first Google sign-in the row flips to **Active**
   (`firstSignInAt`/`lastSignInAt` recorded). No manual registration step on the admin's side.

**Team & Access list view:** email · display name (once known) · role · status (Invited/Active/Suspended)
· last sign-in · actions (**Change role**, **Resend invite**, **Suspend/Revoke**).

**Revoke / off-board:** removing or suspending a user deletes/flags the `allowlist` doc **and** revokes
their Firebase refresh tokens via the Admin SDK, so access is cut promptly rather than lingering until
token expiry.

**Guardrails:**
- **No self-lockout:** an admin cannot remove or demote themselves, and the **last remaining reviewer**
  cannot be removed/demoted.
- Email normalized to lowercase to match `email()` in the rules.
- Domain restriction enforced **server-side** (not just the form).
- Every add / role-change / resend / revoke is `audit()`-logged (actor, target email, change).

## 14. Firestore Rules (additions)

Live company data mirrors `docgen_settings` (reviewer write, allowlisted read). For the **`allowlist`**,
since there is no Admin SDK, the **rules themselves are the boundary**: reviewer-only create/update/delete
with an approved-domain check and no self-demote / self-delete; the owning user may read their own doc and
stamp only their sign-in metadata. (Implemented as shipped — see `firestore.rules`.)

```
match /cfg_entities/{id}  { allow read: if isAllowlisted(); allow write: if isReviewer();
  match /directors/{d} { allow read: if isAllowlisted(); allow write: if isReviewer(); }
  match /lob/{l}       { allow read: if isAllowlisted(); allow write: if isReviewer(); }
  match /signers/{s}   { allow read: if isAllowlisted(); allow write: if isReviewer(); }
}
match /cfg_thresholds/{id}{ allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_approvals/{id} { allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_agents/{id}    { allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_policies/{id}  { allow read: if isAllowlisted(); allow write: if isReviewer(); }

match /cfg_proposals/{id} {
  allow read:   if isAllowlisted();
  allow create: if isAllowlisted() && request.resource.data.proposerEmail == email()
                && request.resource.data.status == 'pending';
  allow update: if isReviewer();   // approve / reject only
  allow delete: if false;
}

// allowlist: unchanged — server (Admin SDK) only; readable by the owning user to resolve own role
match /allowlist/{e} { allow read: if isSignedIn() && e == email(); allow write: if false; }
```
Policy chunks/vectors are written by server routes via the Admin SDK; not client-writable.

## 15. Functional Requirements

- FR1. Top-level **Company Data** module; three worlds + admin-only Team & Access and Change Requests.
- FR2. Entity detail **page** (Profile / Directors / Lines of Business / Authorized Signers); Add/Edit/
  Archive on each (counsel → proposal; reviewer → live).
- FR3. Approval Policy: thresholds (ascending-validated, impact preview, effective date) + drill-down
  routing; plain-language signer-vs-approval framing.
- FR4. Agents: templated instruction + guardrails + **test sandbox**; model & policy scope.
- FR5. Policy Library: upload → **extraction-preview gate** → index → use; version/source on answers.
- FR6. **User Management**: admin adds users by email (domain-restricted), assigns role, auto-sends an
  invite email; list shows status + last sign-in; change-role / resend / revoke; no self-lockout; all
  via the Admin-SDK server route; fully audited.
- FR7. `useCompanyData()` consumption layer with seed fallback; Document Number Generator rewired.
- FR8. Maker-checker: proposals + reviewer queue with diff + impact; approve/reject; pending state shown.
- FR9. Archive-first with reference checks and Restore; truthful icons/verbs; hard delete only unreferenced.
- FR10. Dirty-state guard; visible "last changed / revert"; empty/first-run states; global search.
- FR11. All writes (propose, approve, reject, direct edit, archive, policy index, user add/role/revoke) audited.

## 16. Phased Rollout

1. **Phase 1 — Spine + records + approval policy + maker-checker + User Management.** Company Data nav
   and IA; migrate Entities (+Directors, +LoB, +Signers) and Approval Policy to `cfg_*` seeded from
   `lib/docgen.js`; build `useCompanyData()` + fallback; stand up `cfg_proposals` + Change Requests queue;
   build **Team & Access** + the `/api/users` admin route + invite email; rewire the Document Number
   Generator. Ships the trust/safety basics. *(User Management can land first within Phase 1, since the
   team must be onboarded to use everything else.)*
2. **Phase 2 — Agents:** templated agents + test sandbox, wired into `/api/assist`.
3. **Phase 3 — Policy RAG:** upload → extraction-preview → index → retrieve, with answer provenance.

## 17. Open Items

- OI1. **Reviewer self-edit vs self-proposal** for *thresholds* — confirm whether even reviewer threshold
  edits should pass through the queue for a second pair of eyes.
- OI2. **Embedding provider & cost** (Voyage vs Cohere); key handling alongside `ANTHROPIC_API_KEY`.
- OI3. **Policy storage** — Drive (`drive.file`) vs Firebase Storage; decide at Phase 3.
- OI4. **Workbook importer** for Directors / LoB / current approvers, vs manual entry.
- OI5. **Impact-preview depth** — exact vs approximate re-routing counts over historical `docnumbers`.
- OI6. **Approved user domains** — RESOLVED (2026-06-05): `ALLOWED_USER_DOMAINS = pluang.com,
  batubara-id.com`. Enforced server-side in `/api/users`.
- OI7. **Invite email mechanism** — RESOLVED (2026-06-05): send **as the signed-in admin via the Gmail
  API** (`gmail.send` scope on the existing Google OAuth) — zero cost, no third-party service. App-Password
  + SMTP is the fallback. Draft wording in Appendix A (subject to final Head-of-Legal approval).
- OI8. **Off-domain exceptions** (external counsel/contractors) — if ever needed, define an explicit
  per-user override path, since the default policy is domain-restricted.

## 18. Change Log

- 2026-06-06 (v3.5 — **Source file archived to Drive**) — On policy ingest, the original upload is stored
  in the Drive folder via `uploadToDrive` (drive.file, the reviewer's identity), and `sourceFileId`/
  `sourceUrl` are saved on the policy; the Library shows a ↗ link to the original. Gated by
  `DRIVE_UPLOAD_ENABLED` and never blocks the save (text is the source of truth for retrieval; if Drive is
  off or fails, the policy still saves). Resolves the v3.4 source-file-storage note.
- 2026-06-06 (v3.4 — **PDF / DOCX policy ingestion**) — Policy Library now extracts text from uploaded
  **PDF and DOCX** (plus .txt). Extraction runs **server-side** at `/api/policy/extract` (Node, ID-token
  gated) using `unpdf` (PDF) + `mammoth` (DOCX) — chosen over client parsing for reliability and to keep
  the parsers out of the client bundle; pure parsing, no AI cost. The extracted text populates the
  extraction-preview box for GC confirmation, then chunks/indexes as before; paste remains the fallback
  (and the answer for scanned/image-only PDFs). Ships via app merge only (no rules change). Build passes
  (a benign webpack `import.meta` warning from unpdf's serverless build; runs fine under the route's Node
  runtime — verify with one real PDF post-deploy). Resolves the v3.3 PDF/DOCX fast-follow.
- 2026-06-06 (v3.3 — **Phase 3 / Policy Library + retrieval (RAG v1) BUILT**) — `cfg_policies` + `chunks`
  subcollection (chunked on ingest; scope/company/title denormalised onto chunks). **Per-company
  read-scoping now enforced in `firestore.rules`** (resolves the F1 gate): group policies readable by all
  allowlisted, company policies only in-scope; GC writes only. `lib/policy.js`: `chunkText` + scope-aware
  **client-side lexical retrieval** (`retrievePolicyContext`) — no embeddings/vector index/extra key (cost
  decision per CLAUDE.md #4; semantic embeddings are a clean future upgrade). `/api/assist` agent mode
  accepts retrieved `context` and is told to answer only from it and cite `[n]` sources. **Ask Legal**
  (`retrieves:true`) now grounds answers in the policy corpus and shows its sources. UI: Policy Library
  (GC add/archive; ingest by paste or .txt — **PDF/DOCX extraction is the documented fast-follow**).
  **Deploy needs: (a) re-publish `firestore.rules` (policy scoping); (b) merge the app.** Build passes.
  Open items updated: OI2 (embeddings) → deferred by design (lexical v1); OI3 (storage) → policy *text* in
  Firestore, source-file storage (Drive) deferred with PDF/DOCX import.
- 2026-06-06 (v3.2 — **Agent roster consolidated to 7**) — Owner-directed: **Document Processing Agent**
  (draft / review / standard-docs / approval-signing routing in one), Corporate Secretarial, Compliance &
  Licence Watch, Legal Risk Analyst, **Report Generator**, Legal Intake Triage, and **Ask Legal** (general
  Q&A grounded in anything stored in the dashboard, with sources — absorbs Policy & Playbook Q&A). Roster-
  only change; UI/data/server unchanged. Build passes.
- 2026-06-06 (v3.1 — **Agents → fixed preset roster + cost discipline**) — Reworked Agents from
  free-create to a **fixed roster of 10 presets** defined in `lib/agentTemplates.js` (Contract Drafting,
  Redline Reviewer, NDA/Std-Doc Drafter, Corporate Secretarial, Approval & Signing Router, Compliance &
  Licence Watch, Risk Analyst, Policy & Playbook Q&A, Weekly Report/LSRM, Intake Triage). GC may **tune**
  each agent's instruction + model and **enable/disable** it (overrides in `cfg_agents/{presetId}`; reset
  to default = delete override) — but cannot add/delete agents. **Cost discipline (CLAUDE.md #4 added):**
  cheap default models (Haiku/Sonnet, never Opus by default — GC opts in per appetite), per-agent
  `max_tokens` caps, extended thinking only where it pays, prompt caching on, AI only on explicit action.
  Server `/api/assist` agent mode now clamps tokens + gates thinking. Build passes.
- 2026-06-06 (v3.0 — **Phase 2 / Agents BUILT**) — AI & Knowledge area: `cfg_agents` CRUD (GC-only writes
  per existing rules — no rules redeploy needed), agent instruction **templates** + a model allowlist
  (`lib/agentTemplates.js`), a new **"agent" mode** in `/api/assist` that runs a configured instruction
  under a fixed **guardrail preamble** (trusted-sources-only / working-draft / no-fabrication, applied
  server-side regardless of the saved instruction) on an allowlisted Claude model, and the UI
  (`app/CompanyData.js`): agent registry, **test sandbox** (run before saving), and a **Try** runner for
  any allowlisted user. Policy Library / RAG remains Phase 3. Ships via app merge only (rules + secrets
  unchanged). Build passes.
- 2026-06-05 (v2.9 — **Pre-deploy security review pass**) — Adversarial review of the rules + maker-checker
  + RBAC + DocGen rewire. Fixes: bound `cfg_proposals.company == targetId` for update/archive (no
  cross-company misrouting); auto-strip the legacy `docgen_settings.approvers` field on save (`deleteField`);
  legacy `contributor` (the original owner) normalises to **GC** in `lib/constants` + `firestore.rules`
  (no bootstrap lockout). Owner decisions: F1 (group-wide reads) accepted for Phase 1 — revisit before the
  Policy Library; F3 (rule read-budget) is within limits via Firestore's same-document caching (optional
  Playground check). Deploy gate: `firebase deploy --only firestore:rules`, seed defaults, verify the
  Team & Access roster, smoke-test end-to-end. Build passes.
- 2026-06-05 (v2.8 — **Approval Policy + DocGen rewire BUILT → Phase 1 feature-complete**) — Editable
  **thresholds** (`cfg_thresholds/bands`) and **per-department routing** (`cfg_approvals`) under Company
  Data → Approval Policy, GC-only (rules). Refactored the pure logic to be **band-key based**
  (`valueBucketKey`/`bucketLabel`/`approverCell`) so editing threshold numbers can never desync routing;
  `businessApprovers` now computes the band from the USD amount + live thresholds. The **Document Number
  Generator** (`Form` + `createDocNumber`) reads approvals + thresholds live via `useCompanyData()`; the
  approval matrix was **removed from DocGen Settings** (which now points to Company Data and keeps only
  default-PIC + sequence starts). Threshold edits show a consequence confirmation; the full historical
  impact preview remains OI5. Build passes. **Phase 1 is now feature-complete** (User Management;
  Records/Entities + group classification; maker-checker; group RBAC + company scoping; Approval Policy +
  consumption layer) — pending the rules deploy and a live end-to-end test before go-live.
- 2026-06-05 (v2.7 — **Group RBAC + company scoping BUILT**) — Replaced the 2-role model with four
  group roles (owner decisions): **General Counsel** (super-admin, group), **Regional Counsel** (maker,
  group), **Head of Legal** (approver+editor, per-company), **Country Counsel** (maker, per-company).
  `allowlist` doc gains `companies` (`"all"` or entity-code array). Decisions implemented: (1) **GC-only**
  user admin & company grants; (2) **company-scoped approval** — a change to Company X is approved by X's
  Head of Legal or the GC; (3) **one role across many companies** (multi-company tickbox). Enforced in
  `firestore.rules` (the boundary): `isGC`/`hasCompany`/`isApproverFor`/`isMakerFor`; entity create = GC,
  edit/archive + subcollections = company approver; `cfg_proposals` carry `company`, scoped create +
  scoped approve with **no self-approval** (GC backstop). UI: capability helpers in `lib/constants.js`,
  company picker + scope in Team & Access, scoped Change Requests queue, role+companies surfaced via
  `useAuth`. **Security notes flagged to owner:** (a) legacy `contributor` docs normalise to group-wide
  Regional Counsel — GC should review/re-assign every user's role + companies after deploy; (b) rules
  must be deployed for any of this to take effect. Build passes.
- 2026-06-05 (v2.6 — **Maker-checker + role rename BUILT**) — (1) **Role rename:** central `roleLabel()`
  (`lib/constants.js`) — reviewer → *General Counsel*, contributor → *Regional Counsel* — applied to the
  role chip (`app/page.js`), Team & Access, and the invite email (`lib/invite.js`); stored role values
  unchanged. (2) **Maker-checker for entities:** `cfg_proposals` data layer (`listenCfgProposals`,
  `proposeChange`, `decideCfgProposal` which applies the change on approve) in `lib/data.js`; Regional
  Counsel now see *Propose entity* / *Propose edit* (submit for approval) while the General Counsel edits
  directly; a **Change Requests** queue (`app/CompanyData.js`) shows before/after diffs with approve
  (applies live) / reject + note; pending banners and a per-row "pending" marker on the Entities tab.
  Scope: entity profile create/update/archive via the queue (subcollections + Approval route through the
  same mechanism as they are built). Build passes.
- 2026-06-05 (v2.5) — **Group structure on entities.** Positioned as a group-level register led by the
  General Counsel and shared across regional counsel. Added an `entityType` classification per entity —
  Holding Company / Controlled Subsidiary / Non-Controlled Subsidiary (multiple holdings allowed;
  classification is set per entity, never auto-assigned) — shown on the profile, as a list column, and as
  a filter (`app/CompanyData.js`). Build passes.
- 2026-06-05 (v2.4 — **Phase 1 / Records (Entities) BUILT**) — Shipped the Entities area and the
  consumption layer: `cfg_entities` + Directors/Lines-of-Business/Authorized-Signers subcollections
  (`lib/data.js`), `useCompanyData()` with seed fallback (`lib/companyData.js`), `firestore.rules` for all
  `cfg_*` collections + the maker-checker `cfg_proposals` queue (forward-compat), the Entities master-detail
  UI with reviewer Add/Edit/Archive and a one-click "load defaults" seed (`app/CompanyData.js`), and a kv
  style (`app/globals.css`). **First single-source-of-truth wire-up:** the Document Number Generator's entity
  picker now reads live entities and carries the entity code (`app/DocGen.js`, `lib/docgen.js`), so a
  newly-added entity flows straight into document numbers. Build passes. Editing is reviewer-direct in this
  increment; the maker-checker *propose* flow for contributors and the Approval-Policy editor (with DocGen
  approver/threshold rewire) are the remaining Phase 1 pieces.
- 2026-06-05 (v2.3 — **Phase 1 / User Management BUILT**) — Implemented Team & Access end-to-end:
  `lib/config.js` (domains, app URL, invite flag), `lib/firebase.js` (`gmail.send` scope), `firestore.rules`
  (allowlist governance), `lib/data.js` (`listenAllowlist` / `addAllowlistUser` / `updateAllowlistRole` /
  `removeAllowlistUser` / `stampSignIn`), `lib/auth.js` (sign-in stamping + Google-token alias), `lib/invite.js`
  (email build + Gmail send), `app/CompanyData.js` (module + Team & Access UI), `app/page.js` (nav/subnav/route).
  **Architectural correction:** no Admin SDK exists in this project (org policy blocks SA keys), so user
  management is reviewer-gated **client writes governed by rules**, not an `/api/users` route; roles live in
  the allowlist doc (no custom claims). Build passes. Other Company Data areas remain scaffolded.
  Operator steps to finish: deploy `firestore.rules`; to turn on auto-email set `NEXT_PUBLIC_USER_INVITE_EMAIL=on`
  after enabling the `gmail.send` scope on the OAuth consent screen (until then a copy-link fallback is shown).
- 2026-06-05 (v2.2) — Resolved OI6 (`ALLOWED_USER_DOMAINS = pluang.com, batubara-id.com`) and OI7 (invite
  sent **as the signed-in admin via the Gmail API**, `gmail.send` scope — zero cost). Added the invite
  email template (Appendix A). Status: PROPOSED.
- 2026-06-05 (v2.1) — Added **User Management (Team & Access)**: admin adds users by email
  (owner decisions: **auto-invite email** + **restrict to approved company domains**); honest "pre-authorize
  + invite, not Google-account creation" model; Admin-SDK `/api/users` route keeps `allowlist` client-
  unwritable; status/last-sign-in, change-role/resend/revoke, no-self-lockout guardrails. New open items
  OI6–OI8. Status: PROPOSED.
- 2026-06-05 (v2) — Restructured per senior design critique: three-world entity-centric IA; maker-checker
  governance; drill-down approval matrix with impact preview; archive-vs-delete truthfulness; policy
  extraction-preview gate + answer provenance; templated agents + test sandbox; dirty-state guard, visible
  history/revert, empty states, global search, multi-currency framing. Renamed "Settings" → "Company Data".
- 2026-06-05 (v1) — Initial spec. Five flat domains; Head-of-Legal-only writes. Superseded by v2.

---

## Appendix A — Invite email template

Sent automatically when an admin adds a user. Merge fields in `{{double braces}}` are filled by
`/api/users`. Sent from the admin's own Gmail address (so replies reach them).

**Subject:** You've been granted access to the [Company] Legal Operations Workbench

**Body (plain text):**
```
Hi {{inviteeName}},

{{inviterName}} has granted you access to the [Company] Legal Operations Workbench — the Legal
Department's internal tool for the clause library, document numbering, approvals and corporate records.

To get in:
  1. Open {{appUrl}}
  2. Click "Sign in with Google"
  3. Sign in with this exact account: {{inviteeEmail}}

Your access level: {{role}}.

Please note: access is restricted to authorised accounts, so you must sign in with the Google account
above ({{inviteeEmail}}) — a different address will not work. There is nothing to install and no separate
password to create; your existing Google sign-in is all you need.

If you weren't expecting this, or have any questions, reply to this email to reach {{inviterName}} before
signing in.

— Sent on behalf of the [Company] Legal Department

CONFIDENTIAL & LEGALLY PRIVILEGED. This message and the Workbench are the confidential and legally
privileged property of [Company] and its group companies, for authorised internal use only. If you
received this in error, please delete it and notify the sender.
```

**Notes**
- `{{role}}` renders as a friendly label — "Team Member (Contributor)" or "Head of Legal (Reviewer)".
- An optional one-line **personal note** field on the Add-user form, if filled, is inserted above the
  "To get in" steps.
- A **Resend invite** action re-sends this same template unchanged.
- Final wording is subject to Head-of-Legal approval before first send.
