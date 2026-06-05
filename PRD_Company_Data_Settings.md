# Product Requirements Document — Settings (Company Data) Module

**Status:** PROPOSED (spec for review; not yet built). Targets the **Legal Operations Workbench** as a new top-level module that promotes the current Document-Number-Generator "Settings" sub-tab into a workbench-wide, editable **Company Data** layer that every tool reads from.
**Product positioning:** This PRD covers the **Settings (Company Data)** module — a centralised, governed master-data and knowledge layer. It is a sibling to the live **Contracting Engine** and **Document Number Generator** modules (see `PRD_Clause_Workbench.md`). It does not replace those PRDs; it adds the configuration substrate they consume.
**Owner (Product):** the reviewer (owner) — Head of Legal, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not a Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth (today, to be migrated):** hardcoded arrays in `lib/docgen.js` (`ENTITIES`, `DEPARTMENTS` + approvers, `CABINETS`, `DOC_TYPES`, `CURRENCIES`) and the workbook `2026_Corporate_Database_Control` (Board Members, Business License, Corporate Approval Tracker sheets).
**Last updated:** see Change Log (Section 14)

> This PRD is the controlling record for the Settings module. Every architectural, product, or scope
> change MUST be reflected here and appended to the Change Log before it is considered adopted. A copy
> is to be maintained in the configured project Drive folder. AI-assisted outputs are working drafts
> subject to human review by qualified [Company] counsel and do not constitute legal advice or a Legal
> Department position until reviewed and adopted.

---

## 1. Problem Statement

The data the workbench runs on — the company entities, their directors and lines of business, the
approval matrix and its thresholds, authorised signers, the AI agents' instructions, and the policy
corpus — is today either **hardcoded in source** (`lib/docgen.js`) or **absent** (signers, agents,
policy library do not exist yet). Changing a single approver name, onboarding a new entity, or
adjusting a USD threshold currently requires an engineering change and redeploy.

The legacy "Settings" surface (`app/DocGen.js:475`) is also **scoped to one tool** (the Document
Number Generator) and only edits approver-name overrides on top of an otherwise immutable matrix —
the 25k / 100k threshold bands themselves are baked into code (`usdValueBucket`, `lib/docgen.js:120`).

The Legal and In-House Counsel team needs **one place** to view and edit all company data, with
**Add / Edit / Delete** on every record, where edits propagate **live** to every tool — and where
uploaded policies become a retrievable knowledge base (RAG) for the workbench's AI agents.

## 2. Goals & Non-Goals

**Goals**
- G1. Promote **Settings** to a top-level module ("Company Data"), separate from the daily workflow tools.
- G2. Make all master data **editable in-app** (Add / Edit / Delete) with no code change or redeploy.
- G3. Establish a **single source of truth**: every tool reads master data from one live config layer.
- G4. Cover five domains: **Entities** (+ Directors, + Lines of Business), **Approval Matrix** (with
  adjustable thresholds), **Authorised Signers** (per entity, with limit), **Agents** (name +
  instruction), and **Policy Library** (upload → index → retrieve for RAG).
- G5. Preserve the workbench's governance discipline: reviewer-only writes, allowlisted reads,
  append-only audit on every change, soft-delete for referential safety.
- G6. Zero-downtime migration: hardcoded constants become the **seed**; tools fall back to seed when a
  collection is empty, so nothing breaks before the data is populated.

**Non-Goals (v1)**
- NG1. No open editing by all users. Writes are **Head-of-Legal (reviewer) only** in v1 (per owner
  decision 2026-06-05). A finer-grained `editor` role is explicitly deferred (see Open Items).
- NG2. No automatic deletion of records referenced by live data — soft-archive instead.
- NG3. No real-time co-editing (OT/CRDT) of the same record.
- NG4. The Policy RAG layer does **not** give legal advice; retrieved answers are working drafts with
  citations, subject to the same human-review guardrail as the existing Claude assist.
- NG5. No public or counterparty access.

## 3. Users & Roles

| Role | Who | Capabilities in Settings |
|---|---|---|
| Contributor | Named legal / compliance / product team members on the allowlist | **Read** all Company Data; consume it through the tools |
| Reviewer / Head of Legal | Workspace owner and any designated deputy | All Contributor rights + **Add / Edit / Delete** every Company Data record; upload & re-index policies; manage agents |
| (Implicit) Unauthorised | Anyone not on the allowlist | No access — blocked at Auth and Firestore rules |

Enforced server-side via the existing `isReviewer()` / `isAllowlisted()` helpers in `firestore.rules`,
identical to the model already used for `docgen_settings`. No client-side-only gating.

## 4. Source-of-Truth & Migration Principle (critical)

- The hardcoded arrays in `lib/docgen.js` are treated as **seed data**, exported to
  `data/company.seed.json` and loaded once per collection via a server route, exactly mirroring the
  clause pattern (`data/clauses.seed.json` + `/api/seed` + `seedClausesViaApi`, `lib/data.js:103`).
- After seeding, the **Firestore `cfg_*` collections are authoritative**. The pure formula functions
  in `lib/docgen.js` (`buildDocumentNumber`, `businessApprovers`, etc.) remain pure and take data as
  arguments — they are not deleted, only fed from live data instead of the module-level arrays.
- **Fallback:** the consumption hook returns seed constants whenever a collection is empty, so the
  Document Number Generator keeps working from first deploy through to full population.
- Every record carries `status` (`active` | `archived`) and audit metadata (`updatedBy`, `updatedAt`).
  Deletes are **soft** by default; hard delete is reviewer-only and blocked when references exist.

## 5. Information Architecture & Navigation

- Add a top-level module **Settings** (label: "Settings — Company Data"), pinned to the **bottom** of
  the left sidebar (`app/page.js` `FEATURES` list) with a gear marker, visually separated from the
  workflow modules (`docgen`, `contracting`, `budget`, `tasktracker`).
- Selecting it reveals a subnav of five domains (reusing the existing `SubItem` pattern):

  | Subnav | Bucket | Contents |
  |---|---|---|
  | **Entities** | A | Entity profile + (per entity) Directors + Lines of Business |
  | **Approval Matrix** | B | Approval routes + editable threshold bands |
  | **Authorised Signers** | C | Signer per entity with adjustable limit |
  | **Agents** | C | Agent name + instruction (system prompt) |
  | **Policy Library** | D | Upload policies → indexed for retrieval (RAG) |

- **Entities is the spine.** Inside it, the user selects an entity and sees three tabs —
  *Profile · Directors · Lines of Business* — so all data about one entity lives together (matching how
  the workbook keys Board Members and Business License rows to the entity).

## 6. The Registry Interaction Pattern (one mental model for all five)

Every domain uses one consistent layout and journey, reusing existing components (`.toolbar`,
`.dtable`, the `.overlay`/`.modal` drawer used by `FilingModal`, `app/DocGen.js:425`):

1. **List view** — searchable, filterable table; item count chip; a primary **`+ Add`** button.
2. **Row actions** — **✎ Edit** and **🗑 Delete** on every row (reviewer only; hidden/disabled for
   contributors, matching the read-only treatment already used in `Settings`, `app/DocGen.js:501`).
3. **Add / Edit drawer** — right-side drawer with the record form and a live preview where relevant.
4. **Delete** — confirm dialog; **soft-archive** with a reference check. Deleting a record still
   referenced by live documents (e.g., an entity used by a generated document number) is blocked with a
   clear message and an *Archive instead* option.
5. **Persist & propagate** — Save writes to Firestore, fires a toast, updates every consuming tool live
   via `onSnapshot`, and appends an `audit()` entry.

**Canonical journey:** Settings → choose domain → search/scan list → `+ Add` (or ✎) → fill drawer →
Save → toast + live propagation + audit entry.

## 7. Data Model

All collections are reviewer-writable / allowlisted-readable, prefixed `cfg_`. Schemas below.

### A. Entities — `cfg_entities/{entityId}`
```
{ code: "BSC", name: "PT Bumi Santosa Cemerlang", jurisdiction: "Indonesia",
  address, registrationType: "NIB", registrationNo: "9120105122415",
  status: "active", updatedBy, updatedAt }
```
- Subcollection `directors/{id}`: `{ name, title, appointmentDate, validity, privyId,
  fitProperDecreeNo, fitProperIssuanceDate, status }` — sourced from the Board Members sheet.
- Subcollection `lob/{id}`: `{ code: "66153", description, licenseName, issuingAuthority,
  validityPeriod, status }` — sourced from the Business License sheet (KBLI/SSIC codes).

*Replaces and supersedes the hardcoded `ENTITIES` array (`lib/docgen.js:10`).*

### B. Approval Matrix — thresholds split out so they are adjustable
- `cfg_thresholds/bands` → `{ bands: [{ id, label, maxUsd }], updatedBy, updatedAt }`
  (editable boundaries; the top band absorbs "Unbudgeted/outside budget").
- `cfg_approvals/{id}` → `{ department, departmentCode, bandId, approver, status }` (one routing cell).

*Replaces the hardcoded `DEPARTMENTS` approver columns (`lib/docgen.js:40`) and the baked-in 25k/100k
bands in `usdValueBucket` (`lib/docgen.js:120`). `businessApprovers` is refactored to read the live
matrix instead of `deptByName`.*

### C. Authorised Signers — `cfg_signers/{id}`
```
{ entityId, signerName, title, maxThresholdUsd, jointWith: [signerId]|null,
  validFrom, validTo, status, updatedBy, updatedAt }
```
*New capability. Per-entity signing authority with its own USD limit, distinct from approval routing.*

### C. Agents — `cfg_agents/{agentId}`
```
{ name: "Clause Reviewer", instruction: "<system prompt>", model: "claude-opus-4-8",
  policyScope: [policyId] | "all", status, updatedBy, updatedAt }
```
*Externalises the prompts currently hardcoded in `app/api/assist/route.js` so agents are data, not code.*

### D. Policy Library — `cfg_policies/{policyId}` (+ index, Section 9)
```
{ title, category, jurisdiction, fileRef (Drive id / Storage path), version,
  effectiveDate, status: "uploaded"|"indexing"|"indexed"|"older",
  chunkCount, indexedAt, updatedBy, updatedAt }
```

## 8. Consumption Layer (how every tool reads the data)

- A single client hook/context **`useCompanyData()`** subscribes (via `onSnapshot`) to the `cfg_*`
  collections and exposes `{ entities, directorsByEntity, lobByEntity, approvalBands, approvals,
  signers, agents, policies }`, each falling back to the corresponding seed constant when empty.
- Data-access functions live in `lib/data.js` next to the existing settings functions
  (`listenDocgenSettings` / `saveDocgenSettings`, `lib/data.js:209`), following the same shape:
  `listenCfgEntities`, `saveCfgEntity`, `archiveCfgEntity`, etc., each calling `audit()`.
- Tools migrate their imports:
  - **Document Number Generator** — entity dropdown, approver routing, and threshold bands read from
    `useCompanyData()` instead of `ENTITIES` / `DEPARTMENTS` / `usdValueBucket`.
  - **Contracting / Budget / Task Tracker** — read entities and (where relevant) signers and policies
    from the same hook.

## 9. Policy RAG Design (Policy Library + Agents)

1. **Upload** (Policy Library → `+ Add`): reviewer uploads a PDF/DOCX. File stored in the existing
   Drive folder via the `drive.file` scope already wired (`lib/driveUpload.js`, `DRIVE_FOLDER_ID`) or
   Firebase Storage; a `cfg_policies` row is created with `status: "uploaded"`.
2. **Index** (server route `/api/policy/index`): extract text → chunk → **embed**. Anthropic does not
   provide embeddings, so retrieval uses an embedding provider (recommend **Voyage AI**, Anthropic's
   recommended partner; Cohere is an alternative). Vectors are stored using **Firestore vector search**
   (native; sufficient for the dozens–hundreds of policies a legal team maintains — no separate vector
   DB required). `status → "indexed"`, `chunkCount` and `indexedAt` recorded.
3. **Retrieve + generate**: when an Agent runs, the query is embedded, the top-k chunks within the
   agent's `policyScope` are retrieved, and they are passed to **Claude** (`claude-opus-4-8`, reusing
   the `/api/assist` plumbing and the agent's `instruction`) as grounding. Answers are returned **with
   citations** to the policy title + section, under the existing "working draft — verify before
   relying" guardrail.
4. **Versioning**: re-uploading a policy supersedes the prior version and flags the old one `older` —
   mirroring the Playbook version-tag discipline (`PLAYBOOK_VERSION_TAG`).

## 10. Firestore Rules (additions)

Append rules mirroring `docgen_settings` (reviewer write, allowlisted read) for every new collection:

```
match /cfg_entities/{id}  { allow read: if isAllowlisted(); allow write: if isReviewer();
  match /directors/{d}    { allow read: if isAllowlisted(); allow write: if isReviewer(); }
  match /lob/{l}          { allow read: if isAllowlisted(); allow write: if isReviewer(); }
}
match /cfg_thresholds/{id}{ allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_approvals/{id} { allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_signers/{id}   { allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_agents/{id}    { allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_policies/{id}  { allow read: if isAllowlisted(); allow write: if isReviewer(); }
```
Policy text chunks/vectors used only by server routes are written via the Admin SDK and not exposed to
client writes.

## 11. Validation & Guardrails

- **Uniqueness:** entity `code` unique; approver cells unique per (department, band).
- **Threshold integrity:** bands must be strictly ascending by `maxUsd`; a signer's `maxThresholdUsd`
  is warned if it exceeds the entity's top approval band.
- **Required fields** enforced per domain before Save.
- **Safe delete:** reference check across `docnumbers` (and other consuming collections) before any
  hard delete; default action is soft-archive.
- **Audit:** every Add / Edit / Delete / Archive / policy-index flows through `audit()`
  (`lib/data.js:82`), reviewer-readable, append-only and immutable.

## 12. Functional Requirements

- FR1. Top-level Settings module with five-domain subnav; reviewer sees edit controls, contributors
  see read-only.
- FR2. Entities registry with Add/Edit/Archive; per-entity Directors and Lines of Business subtables
  with the same controls.
- FR3. Approval Matrix editor: edit approver per (department × band) and edit the band boundaries
  themselves; live-validated ascending thresholds.
- FR4. Authorised Signers registry per entity with adjustable USD limit.
- FR5. Agents registry: Add/Edit/Delete agent name + instruction; selectable model and policy scope.
- FR6. Policy Library: upload, list, version, re-index, archive; status surfaced
  (uploaded/indexing/indexed/older).
- FR7. `useCompanyData()` consumption layer with seed fallback; Document Number Generator rewired to it.
- FR8. All writes audited; all deletes reference-checked and soft by default.

## 13. Phased Rollout

1. **Phase 1 — Lift & make editable (highest value, lowest risk):** add the Settings top-level nav;
   migrate **Entities (+ Directors, + LoB), Approval Matrix (+ thresholds), and Authorised Signers** to
   `cfg_*` collections seeded from `lib/docgen.js`; build `useCompanyData()`; rewire the Document Number
   Generator to read live with seed fallback. Removes all "edit code to change a company" friction.
2. **Phase 2 — Agents:** Agents registry wired into `/api/assist` so prompts become data.
3. **Phase 3 — Policy RAG:** upload → index → retrieve; connect Agents to the policy index.

## 14. Open Items

- OI1. **Editor role (deferred).** v1 is Head-of-Legal-write-only per owner decision (2026-06-05). If
  the Counsel team later needs edit rights, introduce an `editor` role (one `firestore.rules` change)
  and a per-domain split. Tracked, not built.
- OI2. **Embedding provider & cost.** Confirm Voyage AI vs Cohere; capture API-key handling alongside
  `ANTHROPIC_API_KEY`.
- OI3. **Policy storage location.** Drive (`drive.file`, already wired) vs Firebase Storage — decide at
  Phase 3 based on whether policies must be human-browsable in the Drive folder.
- OI4. **Directors/LoB import.** One-off importer from the `2026_Corporate_Database_Control` workbook
  to pre-populate Directors and Lines of Business, vs manual entry.

## 15. Change Log

- 2026-06-05 — Initial spec drafted. Owner decisions captured: (a) writes are **Head-of-Legal only** in
  v1; (b) proceed via **detailed spec/PRD first** before implementation. Status: PROPOSED.
