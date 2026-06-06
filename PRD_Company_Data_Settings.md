# Product Requirements Document — Company Data Module (formerly "Settings")

**Status:** BUILT & DEPLOYED — v3.10. Phases 1–3 + Risk Register shipped and merged to `main` (PRs #40–#45); Firestore rules (incl. policy read-scoping + risks) **published/republished** to project `legalops2026` (2026-06-06). The whole ecosystem is live. **Sections 1–17 below describe the as-built system** and are kept in lockstep with the code; the **Change Log (Section 18)** is the authoritative chronological record. Remaining work (all optional, flagged for cost): populate data, Risk Register module, semantic embeddings, OCR — see Section 17.
**Product positioning:** A top-level module of the **Legal Operations Workbench** — a centralised, governed **Company Data** layer (the source of truth) every other tool reads from, plus the workbench's access-control surface and its AI agents. Sibling to the live **Contracting Engine** and **Document Number Generator** (see `PRD_Clause_Workbench.md`).
**Owner (Product):** the owner — General Counsel, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not a Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth (today, to be migrated):** hardcoded arrays in `lib/docgen.js` (`ENTITIES`, `DEPARTMENTS` + approvers, `CABINETS`, `DOC_TYPES`, `CURRENCIES`); the `allowlist` collection (`firestore.rules:9`); and the `2026_Corporate_Database_Control` workbook (Board Members, Business License, Corporate Approval Tracker sheets).
**Last updated:** see Change Log (Section 18)

> Controlling record for the Company Data module. Every architectural, product, or scope change MUST be
> reflected here and appended to the Change Log before it is adopted. A copy is kept in the configured
> project Drive folder. AI-assisted outputs are working drafts subject to human review by qualified
> [Company] counsel and do not constitute legal advice or a Legal Department position.

## PRD Maintenance Protocol (standing instruction — owner directive 2026-06-06)

Whenever the owner says **"update PRD"**, the assistant MUST, in order:
1. **Update this document** in the repository (`PRD_Company_Data_Settings.md`), including a new **Change Log**
   entry (Section 18), and bump the version.
2. **Publish the latest version to Google Drive** — the configured Workbench folder
   (`DRIVE_FOLDER_ID = 1EUxfSoMhazorsUNEbSPSqruhukd3Nure`) — as the live copy.
3. **Archive the previous Drive copy** into the Drive **Archived** subfolder
   (`DRIVE_ARCHIVE_FOLDER_ID = 1kRaTNcs0wMnseEo7XKfXYZmbThMcoVG-`), date/version-stamped, so only the current
   version sits in the Workbench folder.
4. Treat the **latest version as the single source** for the next update.

The repository file is the working source of truth; the Drive copy mirrors the latest at each "update PRD".
If a Drive step cannot be completed automatically (connector capability/permissions), the assistant must say
so and state the manual action required — never silently skip it.

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

Group RBAC + per-company scope. One role per account, applied across one or more companies
(`companies` = `"all"` or an array of entity codes). Capability helpers in `lib/constants.js` **mirror
`firestore.rules`** (the boundary): `isGC` / `hasCompany` / `isApproverFor` / `isMakerFor`.

| Role (stored key) | Capability | Scope |
|---|---|---|
| **General Counsel** (`gc`) | Super-admin: approve anything, edit live, manage users & company grants, tune agents, manage policies | Group (all companies) |
| **Regional Counsel** (`regional`) | Maker — proposes changes | Group (all companies) |
| **Head of Legal** (`hol`) | Approver + direct editor, for its companies | Per-company (assigned) |
| **Country Counsel** (`country`) | Maker — proposes changes | Per-company (assigned) |
| (Implicit) Unauthorised | No access — blocked at Auth and rules | — |

Legacy `reviewer`/`contributor` (the original owner's account) normalise to **GC**.

**Maker-checker flow:** a maker edits a record and clicks **Submit for approval** → a `cfg_proposals` doc
(`status: pending`, carrying its `company`) captures before/after → the proposer sees a "pending" marker →
an approver for that company (its Head of Legal, or the GC) sees the **Change Requests** queue with a
side-by-side diff → **Approve** writes it live; **Reject** returns a note; both audited. **No self-approval**
(GC is the backstop). GC and in-scope Heads of Legal edit directly (audited).

**User management is GC-only and direct** (not maker-checker) — access control does not sit in a proposal
queue. See Section 13.

## 4. Source-of-Truth & Migration Principle

- The hardcoded arrays in `lib/docgen.js` (`ENTITIES`, `DEPARTMENTS` + approvers) are the **seed/fallback**.
  The GC populates the editable collections with a one-click **"Load defaults"** in Entities / Approval
  Policy (a client-side seed write) — no separate seed file or server route.
- The Firestore `cfg_*` collections are then authoritative. Pure formula functions in `lib/docgen.js` stay
  pure and are fed live data via `useCompanyData()` instead of the module-level arrays.
- **Fallback:** `useCompanyData()` returns the seed constants when a collection is empty, so the Document
  Number Generator works from first deploy through full population.
- Records carry `status` (`active`|`archived`), `updatedBy`, `updatedAt`. Records are **archive-first**
  (Restore available); subcollection rows support direct delete.

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
├─ ②b RISK REGISTER — legal risks scoped by company; in-scope counsel log/update; grounds the Risk Analyst agent
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

## 6. Interaction Grammar (as built)

One consistent grammar — list → open → edit → submit → toast → audit:
- **Lists** reuse `.toolbar` / `.dtable` with search + counts; a **rich record** (an entity and its
  children) opens as a full **detail page**; simpler records use a modal.
- **Save** for a maker = **"Submit for approval"** (creates a proposal); for an in-scope approver = applies
  live. Both toast + `audit()`.
- Empty/first-run states on the main areas; Archive/Restore with truthful verbs (Section 7).
- *Deferred niceties (not yet built):* a cross-domain global search, an explicit dirty-state guard, and an
  inline per-record "last changed / revert" surface (the append-only `audit` collection records every
  change; it is not yet surfaced in the record UI).

## 7. Delete vs Archive (as built)

- Records use **Archive** (reversible; `status:"archived"`; hidden from pickers, retained for references)
  with **Restore** — the default for entities and policies; truthful verbs/icons (no trash icon that
  secretly archives).
- Subcollection rows (directors / lines of business / signers) support a direct **Delete** (they are not
  referenced elsewhere). A reference-checked hard delete of top-level records is not implemented — archive
  is the safe default.

## 8. Data Model (as built)

Prefixed `cfg_*`. Reads are allowlisted (entities/approvals group-wide; **policies are read-scoped**);
writes are capability-gated in `firestore.rules`. Makers mutate records only via `cfg_proposals`.

### ① Records — `cfg_entities/{code}` (doc id = entity code)
```
{ code, name, jurisdiction, address, registrationType, registrationNo, baseCurrency,
  entityType:"holding"|"controlled"|"non_controlled"|"", status:"active"|"archived", updatedBy, updatedAt }
   └─ directors/{id}: { name, title, appointmentDate, validity, privyId, status }
   └─ lob/{id}:       { code, description, licenseName, issuingAuthority, validityPeriod, status }
   └─ signers/{id}:   { signerName, title, maxThresholdUsd, validFrom, validTo, status }
```
### ② Approval Policy
- `cfg_thresholds/bands` → `{ low, high, updatedBy, updatedAt }` (the two USD band ceilings).
- `cfg_approvals/{deptCode}` → `{ department, departmentCode, admin, low, mid, high, updatedBy, updatedAt }`.

### ③ AI & Knowledge
- Agent roster is **fixed in code** (`lib/agentTemplates.js`); `cfg_agents/{presetId}` stores GC **overrides
  only**: `{ instruction?, model?, enabled, updatedBy, updatedAt }`.
- `cfg_policies/{id}` → `{ title, category, scope:"group"|"company", company, version, effectiveDate,
  sourceName, sourceFileId, sourceUrl, status, chunkCount, createdBy, updatedAt }`
   └─ chunks/{id}: `{ ord, text, scope, company, title }` (scope/company/title denormalised for rules + citation).

### ④ Team & Access — `allowlist/{emailLower}`
```
{ email, role:"gc"|"regional"|"hol"|"country", companies:"all"|[code…],
  status:"invited"|"active", displayName, invitedBy, invitedAt, lastSignInAt, updatedBy, updatedAt }
```
*Doc id = lowercased email (matches `email()` in rules). Written by the GC's own client session, governed
by rules — there is no Admin SDK (org policy blocks service-account keys).*

### Governance — `cfg_proposals/{id}`
```
{ domain:"entity", action:"create"|"update"|"archive", targetId, company, label, before, after,
  status:"pending"|"approved"|"rejected", proposerEmail, proposerName, reviewerEmail, reviewNote, createdAt, reviewedAt }
```

## 9. Consumption Layer (as built)

- One hook **`useCompanyData()`** (`lib/companyData.js`) subscribes (`onSnapshot`) to the live `cfg_*`
  collections and exposes `{ entities, approvals, thresholds, seeded, loading }`, each falling back to the
  `lib/docgen.js` seed when empty.
- Data-access functions live beside `listenDocgenSettings`/`saveDocgenSettings` in `lib/data.js`: makers'
  writes route through `cfg_proposals`; approval applies the change live; all `audit()`-logged.
- The **Document Number Generator** reads its entity picker, approver routing and threshold bands live from
  `useCompanyData()` (with seed fallback) — the first single-source-of-truth consumer.

## 10. Approval-Threshold Safety (as built)

- Approval **thresholds and per-department routing are GC-only** (group config, `firestore.rules`),
  edited directly in Approval Policy.
- A **consequence confirmation** is shown before saving a threshold change ("changes routing for all
  future agreements; existing records keep the approver recorded at generation"). The full historical
  impact preview (re-routing counts over past `docnumbers`) remains OI5.
- Bands validated ascending (`high > low > 0`). Routing is **band-key based** (`valueBucketKey` /
  `bucketLabel` / `approverCell` in `lib/docgen.js`) so editing the numbers can never desync routing.
  Historical `docnumbers` retain the `approvers` computed at generation.

## 11. Policy Library & Retrieval (RAG — as built)

1. **Ingest** (GC): add a policy with title / category / **scope (group or a company)** / effective date and
   its text — **paste, .txt, or upload PDF/DOCX** (extracted server-side at `/api/policy/extract` via
   `unpdf` / `mammoth`). The text box is the **extraction-preview gate** — confirm it reads correctly first.
2. **Chunk + store:** on save the text is chunked (`lib/policy.js` `chunkText`) into the `chunks`
   subcollection (scope/company/title denormalised). The original file is archived to Drive when
   `DRIVE_UPLOAD_ENABLED` (↗ link shown); the extracted text is the retrieval source of truth.
3. **Retrieve (client-side, lexical):** `retrievePolicyContext` loads the policies the user may see (group +
   their companies), ranks chunks by lexical overlap with the question, returns top-k + a sources list. **No
   embeddings / vector index / extra key** (cost decision, CLAUDE.md #4); semantic embeddings are a clean
   future upgrade (OI2).
4. **Generate:** chunks pass to **Claude** via `/api/assist` (`agent` mode) under the fixed guardrail
   preamble; the agent answers **only from context** and **cites `[n]` sources** (shown under the answer),
   or says the answer isn't stored.
5. **Scoping:** company policies and their chunks are readable **only in-scope** (rules); group policies by
   all. *Not yet:* versioning/supersede flags; OCR for scanned/image-only PDFs (paste fallback covers them).

## 12. Agents — Fixed Preset Roster (as built)

A **fixed roster of 7 presets** in `lib/agentTemplates.js`. GC may **tune** each agent's instruction + model
and **enable/disable** it (overrides in `cfg_agents/{presetId}`; reset = delete the override) — but cannot
add or delete agents. Each run is **one capped Claude call on an explicit user action** (no background AI).
The server prepends non-negotiable guardrails (trusted-sources-only / working-draft / no-fabrication) to
every agent's instruction.

**Cost discipline (CLAUDE.md #4):** default models are Haiku/Sonnet (**never Opus by default** — GC opts in
per appetite); per-agent `max_tokens` caps; extended thinking only where it pays; prompt caching on.

| Agent | Grounded in |
|---|---|
| Document Processing (draft / review / standard docs / approval-signing routing) | the user's input |
| Corporate Secretarial | live entities / directors / lines of business |
| Compliance & Licence Watch | live licence records (lines of business) |
| Legal Risk Analyst | the legal Risk Register (scope-aware) + the user's input |
| Report Generator | the matters provided |
| Legal Intake Triage | the request provided |
| **Ask Legal** | **policies (retrieved) + entities + approval matrix + signers** |

Structured grounding (`lib/structuredContext.js`) is scope-aware and client-side. A **test sandbox** lets GC
run an agent before saving; a **Try** runner lets any allowlisted user run an enabled agent. Answers carry
the "working draft — verify before relying" guardrail.

## 13. User Management (Team & Access)

**Mental model (honest).** The workbench cannot create or "enrol" a Google account — those are external
and already exist. "Adding a user" = **pre-authorize an email + send an invite**. The person signs in
with their existing Google account; **Firebase Auth auto-provisions their app user on first sign-in**;
Firestore rules let them in because their email is on the `allowlist`.

**Who can manage:** the **General Counsel** only. A direct admin action, not maker-checker.

**Add-user journey (decisions: auto-invite + domain-restricted):**
1. The GC opens **Team & Access → `+ Add user`**, enters an email, picks a **role** (General Counsel /
   Regional Counsel / Head of Legal / Country Counsel) and, for the per-company roles, **ticks the
   companies** in scope.
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

**Revoke / off-board:** removing a user **deletes their `allowlist` doc**; with no allowlisted record the
Firestore rules deny them on their next token refresh / sign-in. (No Admin SDK, so server-side refresh-token
revocation isn't available; access ends at token refresh, typically within the hour.)

**Guardrails:**
- **No self-lockout:** the GC cannot demote or remove their own account, and the **last remaining GC**
  cannot be removed/demoted.
- Email normalised to lowercase to match `email()` in the rules.
- Domain restriction enforced in **`firestore.rules`** (the boundary) and the form.
- Every add / role-change / resend / revoke is `audit()`-logged.

## 14. Firestore Rules (the security boundary — as built)

No Admin SDK exists (org policy blocks service-account keys), so **all authorization is enforced in
`firestore.rules`**, never client-only. Helpers each read the caller's `allowlist` doc: `isGC`,
`hasCompany(c)`, `isApproverFor(c)`, `isMakerFor(c)` (`isReviewer` is a GC alias for the legacy modules).

- **`allowlist`** — read own doc, or any if GC; create/update/delete **GC-only**, approved-domain check,
  role ∈ the four roles, **no self-demote/self-delete**; the owning user may update only their own sign-in
  metadata (never role/companies/email).
- **`cfg_entities`** (+ directors/lob/signers) — read: allowlisted; create: GC; update/archive + subcollections:
  `isApproverFor(entity code)`.
- **`cfg_thresholds` / `cfg_approvals` / `cfg_agents`** — read: allowlisted; write: GC.
- **`cfg_policies` (+ `chunks`)** — **read-scoped**: `scope == 'group' || hasCompany(company)`; write: GC.
- **`cfg_proposals`** — read: allowlisted; create: a maker in scope, `proposerEmail == self`,
  `status == 'pending'`, and `company == targetId` for update/archive; update (approve/reject):
  `isApproverFor(company)` **and not the proposer** (GC backstop); delete: never.

The canonical rules live in `firestore.rules`; deploy via the Firebase Console (project `legalops2026`).

## 15. Functional Requirements (as built)

- FR1. Top-level **Company Data** module; areas: Entities, Approval Policy, AI & Knowledge, Team & Access
  (GC), Change Requests (approvers).
- FR2. Entity detail **page** (Profile / Directors / Lines of Business / Authorised Signers) with group
  classification; Add/Edit/Archive (in-scope approver → live; maker → proposal).
- FR3. Approval Policy: GC-edited thresholds (ascending-validated, consequence confirmation) + per-department
  routing; consumed live by the Document Number Generator.
- FR4. **Fixed 7-agent roster**; GC tunes instruction + model and enables/disables; test sandbox; any
  allowlisted user runs an enabled agent; server-side guardrails + cost caps.
- FR5. **Policy Library**: ingest by paste / .txt / PDF / DOCX (server-side extraction) → preview → chunk →
  store; Drive-archived source; **lexical retrieval** grounds Ask Legal with `[n]` citations; read-scoped.
- FR6. **User Management (GC-only)**: add users by email (domain-restricted), assign role + company scope,
  auto-invite (Gmail) or copy-link; status + last sign-in; change-access / resend / revoke; no self-lockout;
  client writes governed by rules; audited.
- FR7. `useCompanyData()` consumption layer with seed fallback; Document Number Generator rewired.
- FR8. Maker-checker: scoped proposals + scoped Change Requests queue with diffs; approve/reject; no
  self-approval; pending markers.
- FR9. Archive-first with Restore; truthful icons/verbs.
- FR10. Agents grounded in live structured data (entities / approvals / signers / LoB / risk register), scope-aware.
- FR12. **Risk Register**: in-scope counsel log/update legal risks (read-scoped by company; closed via status);
  grounds the Legal Risk Analyst agent.
- FR11. All writes (propose, approve, reject, direct edit, archive, policy ingest, user add/role/revoke,
  agent tune) audited.

## 16. Phased Rollout (status)

1. **Phase 1 — Records + Approval Policy + maker-checker + RBAC + User Management.** ✅ BUILT & DEPLOYED
   (PRs #40–#42; rules published to `legalops2026`).
2. **Phase 2 — Agents** (fixed cost-disciplined roster, tune + test sandbox). ✅ BUILT & DEPLOYED (PR #41).
3. **Phase 3 — Policy Library + retrieval (RAG)**, PDF/DOCX ingest, Drive source, structured-data grounding.
   ✅ BUILT & DEPLOYED (PRs #42–#44).

4. **Risk Register** + Legal Risk Analyst grounding. ✅ BUILT & DEPLOYED (PR #45; rules republished 2026-06-06).

**Optional next:** semantic embeddings (if lexical proves too blunt — has cost); OCR for scanned PDFs
(has cost). All flagged for cost per CLAUDE.md #4.

## 17. Open Items

- OI1. **Second-pair-of-eyes on thresholds** — thresholds/routing are GC-only **direct** with a consequence
  confirmation; an approval gate on them is not implemented. Open if desired.
- OI2. **Semantic embeddings** — deferred by design; retrieval is lexical (free). Revisit (Voyage/Cohere) only
  if quality demands — has cost.
- OI3. **Policy source storage** — RESOLVED: original file archived to Drive (`drive.file`) when enabled;
  extracted text in Firestore is the retrieval source of truth.
- OI4. **Workbook importer** for Directors / LoB / current approvers, vs manual entry — open.
- OI5. **Impact-preview depth** — historical re-routing counts over `docnumbers` (today: a consequence
  confirmation only) — open.
- OI6. **Approved user domains** — RESOLVED: `pluang.com, batubara-id.com`, enforced in `firestore.rules` + form.
- OI7. **Invite email** — RESOLVED: sent as the signed-in GC via the Gmail API (`gmail.send`), gated by
  `NEXT_PUBLIC_USER_INVITE_EMAIL`; copy-link fallback otherwise. Template in Appendix A.
- OI8. **Off-domain exceptions** (external counsel/contractors) — open; default policy is domain-restricted.
- OI9. **Risk Register module** — RESOLVED: `risks` collection (read-scoped by company), Risk Register UI in
  Company Data, and Legal Risk Analyst grounded in it (`buildStructuredContext("risks")`).
- OI10. **Per-company read-scoping beyond policies** — entities/approvals are group-readable by all allowlisted
  (accepted for now); revisit if any entity-level data becomes confidential per company.

## 18. Change Log

- 2026-06-06 (v3.10 — **Rules republished → Risk Register live; full ecosystem deployed**) — Owner
  republished `firestore.rules` to `legalops2026` (the `risks` rules + Phase-3 policy read-scoping now
  live). PR #45 merged. Every planned area is built and deployed: Entities, Approval Policy, Risk Register,
  AI & Knowledge (7 grounded agents), Team & Access, Change Requests, Policy Library. Per the PRD
  Maintenance Protocol, this version is published to the Drive Workbench folder and v3.9 archived. Remaining
  items are optional and cost-flagged (semantic embeddings, OCR).
- 2026-06-06 (v3.9 — **Risk Register module BUILT**) — New `risks` collection (read-scoped by company:
  group readable by all, company risks in-scope; in-scope makers create/update, closed via status, delete
  reserved to approvers) in `firestore.rules` + `lib/data.js` (`listenRisks`/`addRisk`/`saveRisk`). Risk
  Register UI under Company Data (`app/CompanyData.js`, nav in `app/page.js`): log/edit risks with
  likelihood, impact, owner, mitigation, status; search + show-closed; scoped to the user's companies.
  **Legal Risk Analyst agent grounded** in the register (`lib/structuredContext.js` "risks" branch;
  `dataSource:"risks"`, `live:true`) — the last paste-only agent now reads live data. Resolves OI9. Deploy
  needs a **rules re-publish** (new `risks` rules) + app merge. Build passes.
- 2026-06-06 (v3.8 — **PRD Maintenance Protocol added**) — Owner directive: on every "update PRD", update
  the repo PRD + Change Log + version, publish the latest to the Google Drive Workbench folder, archive the
  prior Drive copy into the Archived subfolder, and use the latest as the source for the next update.
  Documented at the top of this PRD and in `CLAUDE.md`.
- 2026-06-06 (v3.7 — **PRD body synced to as-built**) — Rewrote Sections 1–17 to match the shipped system
  (the body had lagged the change log): status → BUILT & DEPLOYED; 4-role RBAC + company scope (§3); as-built
  data model incl. `cfg_*` overrides + policy chunks (§8); consumption hook surface (§9); GC-only direct
  thresholds + band-key routing (§10); lexical RAG + PDF/DOCX/Drive ingest (§11); fixed 7-preset roster +
  structured grounding (§12); user management as client-rules (no Admin SDK) with correct revoke semantics
  (§13); rules summary as shipped (§14); FRs/Phasing/Open-Items refreshed (§15–17, added OI9 Risk Register,
  OI10 read-scoping); Appendix A notes corrected. No code change.
- 2026-06-06 (v3.6 — **Agents grounded in structured data**) — `lib/structuredContext.js` builds a
  compact, **scope-aware** context from the live `cfg_*` records (entities, directors, lines of business,
  approval thresholds + matrix, authorised signers); company-scoped roles see only their companies'
  entity data, the approval matrix is group-wide. Wired so **Corporate Secretarial** (entities/directors/
  LoB), **Compliance & Licence Watch** (licence records), and **Ask Legal** (entities + approvals +
  signers, *plus* its policy retrieval) now answer from live dashboard data and decline when it isn't
  there. Client-side reads via existing rules; **no AI/embedding/infra cost** (capped context, a handful
  of Firestore reads). Route context wording generalised (records + policies). `live:true` for the three.
  Risk Analyst stays paste-based (no risk-register collection yet). Build passes; app-merge only.
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

Sent when the GC adds a user (if `NEXT_PUBLIC_USER_INVITE_EMAIL` is on; otherwise a copy-link is shown).
Merge fields in `{{double braces}}` are filled client-side from the Add-user form. Sent from the GC's own
Gmail address via the `gmail.send` scope (so replies reach them).

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
- `{{role}}` renders as a friendly label — General Counsel / Regional Counsel / Head of Legal / Country Counsel.
- An optional one-line **personal note** field on the Add-user form, if filled, is inserted above the
  "To get in" steps.
- A **Resend invite** action re-sends this same template unchanged.
- Final wording is subject to Head-of-Legal approval before first send.
