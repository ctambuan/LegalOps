# Product Requirements Document — Company Data Module (formerly "Settings")

**Status:** PROPOSED — v2 (design-reviewed). Incorporates a senior design critique of v1: entity-centric IA, maker-checker governance, and explicit trust/safety design. Not yet built.
**Product positioning:** A new top-level module for the **Legal Operations Workbench** — a centralised, governed **Company Data** layer (the source of truth) that every other tool reads from. Sibling to the live **Contracting Engine** and **Document Number Generator** (see `PRD_Clause_Workbench.md`).
**Owner (Product):** the reviewer (owner) — Head of Legal, [Company]
**Author (Eng):** AI senior product engineer (working drafts; not a Legal Department position)
**Classification:** Confidential & Legally Privileged — [Company] internal use only
**Source of truth (today, to be migrated):** hardcoded arrays in `lib/docgen.js` (`ENTITIES`, `DEPARTMENTS` + approvers, `CABINETS`, `DOC_TYPES`, `CURRENCIES`) and the `2026_Corporate_Database_Control` workbook (Board Members, Business License, Corporate Approval Tracker sheets).
**Last updated:** see Change Log (Section 16)

> Controlling record for the Company Data module. Every architectural, product, or scope change MUST be
> reflected here and appended to the Change Log before it is adopted. A copy is to be kept in the
> configured project Drive folder. AI-assisted outputs are working drafts subject to human review by
> qualified [Company] counsel and do not constitute legal advice or a Legal Department position.

---

## 0. What changed from v1 (design-review response)

This version is a direct response to a senior product-design critique of v1. The substantive changes:

| v1 (rejected) | v2 (this doc) | Why |
|---|---|---|
| Five flat, equal "domains" | **Three grouped worlds** (Records · Approval Policy · AI & Knowledge) | v1 mirrored the database, not how counsel think |
| Signers a separate top-level table | **Signers nested inside the Entity** detail page | Everything about one entity in one place; matches Directors/LoB |
| Approval matrix = a 25×4 editable grid | **Drill into one department**; thresholds edited with impact preview | A 100-cell wall is intimidating and error-prone |
| "Settings" at the bottom of the sidebar | Renamed **Company Data**, given prominence | It is the data backbone, not disposable preferences |
| Head-of-Legal-only writes (team can't configure) | **Maker-checker** (counsel propose → Head of Legal approves) | Resolves the contradiction with "configurable by the Counsel team" |
| 🗑 that silently archives | **Archive (reversible, default)** vs flagged hard **Delete** | The verb/icon must tell the truth |
| Versioned policies only | Policy **extraction-preview gate** + source/version on every cited answer | An AI citing the wrong/old policy is a liability |
| Free-text agent prompt | **Templated instruction + test sandbox** | Counsel are lawyers, not prompt engineers |
| (absent) | Empty states, dirty-state guard, visible "last changed / revert", global search, multi-currency framing | Trust and intuitiveness for rare-use master data |

## 1. Problem Statement

The data the workbench runs on — entities, their directors and lines of business, the approval matrix
and its thresholds, authorised signers, the AI agents' instructions, and the policy corpus — is today
either **hardcoded in source** (`lib/docgen.js`) or **absent** (signers, agents, policy library do not
exist). Changing one approver, onboarding an entity, or adjusting a USD threshold requires an
engineering change and redeploy. The legacy "Settings" surface (`app/DocGen.js:475`) is scoped to one
tool and only overrides approver names on an otherwise immutable matrix.

The Legal / In-House Counsel team needs **one governed place** to maintain all company data, where the
team can **propose** changes, the Head of Legal **approves**, and approved edits propagate **live** to
every tool — and where uploaded policies become a **trustworthy** retrievable knowledge base (RAG).

## 2. Goals & Non-Goals

**Goals**
- G1. Promote master data to a top-level **Company Data** module, grouped into three intuitive worlds.
- G2. **Maker-checker governance**: any counsel proposes Add/Edit/Archive; the Head of Legal approves
  before anything goes live (reuses the existing propose→review→adopt pattern).
- G3. Single source of truth: every tool reads master data live from one config layer.
- G4. Make high-consequence edits **safe**: impact preview for thresholds, reference-checked archiving,
  visible change history and revert, dirty-state protection.
- G5. Make the policy RAG **trustworthy**: extraction preview before use, version/source on every answer.
- G6. Make agent authoring **safe for non-engineers**: templated instructions + a test sandbox.
- G7. Zero-downtime migration: hardcoded constants become the seed; tools fall back to seed when empty.

**Non-Goals (v1 build)**
- NG1. No direct writes to live data by anyone except via approval. Counsel changes are always proposed;
  only the Head of Legal's approval (or their own direct edits) mutate live data.
- NG2. No hard delete of records referenced by live data — reference-checked, archive-first.
- NG3. No real-time co-editing (OT/CRDT) of the same record.
- NG4. The Policy RAG does not give legal advice; answers are cited working drafts under the existing
  human-review guardrail.
- NG5. No public or counterparty access.

## 3. Users, Roles & Governance (Maker-Checker)

| Role | Who | Capabilities |
|---|---|---|
| Contributor (Counsel) | Named legal / compliance / product team on the allowlist | Read all Company Data; **propose** Add / Edit / Archive on any record; see the status of their own proposals; consume the data through every tool |
| Reviewer / Head of Legal | Workspace owner and any designated deputy | All Contributor rights + **approve / reject** proposed changes (the gate that mutates live data); **direct edit** (their own edits apply immediately, self-audited); upload & index policies; manage agents |
| (Implicit) Unauthorised | Not on the allowlist | No access — blocked at Auth and rules |

**The flow (reused from the Contracting Engine):**
1. A counsel opens a record, edits it, and clicks **Submit for approval**. A `cfg_proposals` doc is
   created (`status: pending`) capturing the before/after. Nothing live changes.
2. The record shows a **"Pending approval — your change"** badge to the proposer; the live value is
   unchanged for everyone else.
3. The Head of Legal sees a **Change Requests** queue (a fourth, governance-only subnav item) with a
   **side-by-side diff** of current vs proposed, plus an **impact summary** for high-consequence changes.
4. **Approve** applies the change to the live `cfg_*` collection and stamps it; **Reject** returns it
   with a note. Either way it is audited.
5. The Head of Legal's *own* Add/Edit/Archive apply immediately (they are the checker) and are audited.

Enforced server-side: live `cfg_*` collections are reviewer-write only; `cfg_proposals` are creatable
by any allowlisted user as themselves and transitionable only by a reviewer — identical to the existing
`proposals` rules (`firestore.rules:34`).

## 4. Source-of-Truth & Migration Principle

- Hardcoded arrays in `lib/docgen.js` become **seed data** (`data/company.seed.json`), loaded once per
  collection via a server route, mirroring the clause pattern (`/api/seed` + `seedClausesViaApi`,
  `lib/data.js:103`).
- After seeding, the Firestore `cfg_*` collections are authoritative. The pure formula functions in
  `lib/docgen.js` (`buildDocumentNumber`, `businessApprovers`) stay pure and take data as arguments —
  fed from live data instead of module-level arrays.
- **Fallback:** the consumption hook returns seed constants when a collection is empty, so the Document
  Number Generator works from first deploy through full population.
- Every record carries `status` (`active` | `archived`), `updatedBy`, `updatedAt`. Deletes are
  archive-first; hard delete is reviewer-only and blocked when references exist.

## 5. Information Architecture (the v2 redesign)

Rename the module **Company Data** and give it prominent placement (not the sidebar basement). Group
into **three worlds** plus one governance queue:

```
COMPANY DATA
│
├─ ① RECORDS — corporate records
│     Entities  ← the spine. Opening an entity = a full detail PAGE with tabs:
│         Profile · Directors · Lines of Business · Authorized Signers
│         (signers live HERE — all of one entity's data in one place)
│
├─ ② APPROVAL POLICY — governance rules (plain-language intro distinguishing it from signers)
│     Thresholds   — edit USD bands, with impact preview + effective date
│     Routing      — drill into ONE department to see/edit its handful of approval routes
│
├─ ③ AI & KNOWLEDGE — clearly fenced from corporate records
│     Agents          — templated instruction + test sandbox
│     Policy Library  — upload → extraction-preview gate → indexed (version/source on every answer)
│
└─ ④ CHANGE REQUESTS (reviewer-visible) — the maker-checker queue: diffs + impact + approve/reject
```

**Why entity-centric:** a signer *belongs to* an entity; directors and lines of business already do.
Configuring "PT BSC" should mean one detail page, not chasing the same entity across three tables.

**Plain-language disambiguation** sits at the top of the Approval Policy world:
> *Approval routing* = who must **sign off internally** to enter into a document, by value and
> department. *Authorized signers* (under each Entity) = who may **legally sign** on the entity's behalf.

## 6. Interaction Grammar (consistent, but right-sized to the data)

One consistent *grammar* — list → open → edit → submit → toast → audit — but the **container is sized to
the record**, not forced uniform (a v1 error):

- **Simple records** (an approver route, a director, a signer): right-side **drawer** with the form.
- **Rich records** (an entity, with its children): a full **detail page**, not a cramped drawer.
- **List views** reuse existing `.toolbar` / `.dtable`; each list has search, an item count, and a
  primary **`+ Add`**. Rows show **✎ Edit** and **Archive/Delete** (Section 7).
- **Save** for counsel = **"Submit for approval"** (creates a `cfg_proposals` doc); for the Head of
  Legal = applies live. Both fire a toast and an `audit()` entry.
- **Dirty-state guard:** navigating away from an unsaved form prompts to confirm or keep editing.
- **Visible history:** every record footer shows **"Last changed by X on Y"** with a **Revert** action
  (reviewer) — the audit trail made visible where it reassures, not buried.
- **Empty / first-run states:** every empty domain shows guided "Add your first …" copy, not a blank
  table. First entry into Company Data offers a short "what lives here" orientation.
- **Global search:** a cross-domain search ("find *Lindawati* anywhere") spanning entities, approvers,
  signers, agents, and policy titles.

## 7. Delete vs Archive (telling the truth)

- The default destructive action is **Archive** (reversible; sets `status: archived`; hidden from
  pickers but retained for historical references). Archived items live in an **"Archived" filter** in
  each list and can be **Restored**.
- A true **Delete** (irreversible) is offered **only** when a reference check finds the record is used
  nowhere live, and is clearly labelled as permanent. Attempting to archive/delete a referenced record
  (e.g., an entity used by existing document numbers) is blocked with a plain-language explanation.
- Icons and verbs match behaviour: no trash icon that secretly archives.

## 8. Data Model

Reviewer-writable / allowlisted-readable, prefixed `cfg_`. Counsel mutate them only via `cfg_proposals`.

### ① Records
**Entities — `cfg_entities/{entityId}`**
```
{ code:"BSC", name:"PT Bumi Santosa Cemerlang", jurisdiction:"Indonesia",
  address, registrationType:"NIB", registrationNo:"9120105122415",
  baseCurrency:"IDR", status:"active", updatedBy, updatedAt }
   └─ directors/{id}: { name, title, appointmentDate, validity, privyId, fitProperDecreeNo, status }
   └─ lob/{id}:       { code:"66153", description, licenseName, issuingAuthority, validityPeriod, status }
   └─ signers/{id}:   { signerName, title, maxThresholdUsd, jointWith:[signerId]|null,
                        validFrom, validTo, status }
```
*Replaces `ENTITIES` (`lib/docgen.js:10`); Signers nested here, not a separate table.*

### ② Approval Policy
- `cfg_thresholds/bands` → `{ bands:[{ id, label, maxUsd }], effectiveFrom, updatedBy, updatedAt }`
  (editable boundaries; top band absorbs "Unbudgeted/outside budget"). Edits run an **impact preview**.
- `cfg_approvals/{id}` → `{ department, departmentCode, bandId, approver, status }` (one routing cell).

*Replaces the hardcoded `DEPARTMENTS` approver columns and the baked-in 25k/100k bands in `usdValueBucket`
(`lib/docgen.js:120`). `businessApprovers` is refactored to read the live matrix.*

### ③ AI & Knowledge
- **Agents — `cfg_agents/{agentId}`**: `{ name, instructionTemplateId, instruction, guardrails,
  model:"claude-opus-4-8", policyScope:[policyId]|"all", status, updatedBy, updatedAt }`.
- **Policies — `cfg_policies/{policyId}`**: `{ title, category, jurisdiction, fileRef, version,
  effectiveDate, status:"uploaded"|"extracted"|"indexing"|"indexed"|"older", extractionApprovedBy,
  chunkCount, indexedAt, updatedBy, updatedAt }`.

### Governance
- **`cfg_proposals/{id}`**: `{ domain, targetId|null (null=create), action:"create"|"update"|"archive",
  before, after, impact, status:"pending"|"approved"|"rejected", proposerEmail, reviewNote,
  reviewerEmail, createdAt, reviewedAt }`.

## 9. Consumption Layer (how tools read the data)

- One hook **`useCompanyData()`** subscribes (`onSnapshot`) to the live `cfg_*` collections and exposes
  `{ entities, directorsByEntity, lobByEntity, signersByEntity, approvalBands, approvals, agents,
  policies }`, each falling back to the seed constant when empty.
- Data-access functions sit beside the existing settings functions in `lib/data.js`
  (`listenDocgenSettings`/`saveDocgenSettings`, `lib/data.js:209`), each routing counsel writes through
  `cfg_proposals` and applying approved changes to the live collection, with `audit()` throughout.
- **Document Number Generator** migrates its entity dropdown, approver routing, and threshold bands to
  `useCompanyData()` instead of `ENTITIES` / `DEPARTMENTS` / `usdValueBucket`. Contracting, Budget and
  Task Tracker read entities (and where relevant signers/policies) from the same hook.

## 10. Approval-Threshold Safety (high-consequence edits)

- Editing a band or a routing cell shows an **impact preview** *before* submission and again at the
  reviewer's approval step: e.g. *"This change alters routing for 25 departments and would have routed
  N of the last 12 months' documents differently."*
- Bands must be strictly ascending by `maxUsd` (validated inline). A signer's `maxThresholdUsd` is
  warned if it exceeds the entity's top band.
- Thresholds are USD; each entity declares a `baseCurrency`, and the FX assumption (today via
  `/api/fxrate`) is stated at the point of editing so multi-currency entities are not a silent trap.
- Threshold changes carry an `effectiveFrom`; historical documents retain the routing recorded at
  generation time (the `docnumbers` record already stores its computed `approvers`).

## 11. Policy RAG — Trust by Design

1. **Upload** (Policy Library → `+ Add`): PDF/DOCX to the existing Drive folder (`drive.file`,
   `lib/driveUpload.js`) or Firebase Storage; `cfg_policies` row `status:"uploaded"`.
2. **Extraction-preview gate** (`/api/policy/extract`): text is extracted and **shown to the reviewer to
   confirm** ("does this look right?") before the policy can be used — guarding against mangled tables /
   bad OCR. Approving sets `status:"extracted"`.
3. **Index** (`/api/policy/index`): chunk → embed (recommend **Voyage AI**, Anthropic's recommended
   embedding partner; Cohere alternative) → store with **Firestore vector search** (native; sufficient
   for the dozens–hundreds of policies a legal team holds — no separate vector DB). `status:"indexed"`.
4. **Retrieve + generate**: an Agent embeds the query, pulls top-k chunks within its `policyScope`, and
   passes them to **Claude** (`claude-opus-4-8`, reusing `/api/assist` and the agent's `instruction`).
   Every answer shows its **source policy title + section + version**, under the existing "working
   draft — verify before relying" guardrail.
5. **Versioning / staleness:** re-uploading supersedes and flags the old version `older` (mirrors
   `PLAYBOOK_VERSION_TAG`); answers visibly warn if a cited policy is superseded.

## 12. Agents — Safe Authoring for Non-Engineers

- Agents are created from **instruction templates** (e.g. "Policy Q&A", "Clause Reviewer") with baked-in
  guardrails, not a naked prompt box.
- A **test sandbox** lets the author run the agent against a sample question (and selected policy scope)
  and see the cited answer **before saving** — no untested agent reaches the team.
- Model defaults to `claude-opus-4-8`; `policyScope` constrains which policies the agent may retrieve.

## 13. Firestore Rules (additions)

Mirror the existing `proposals`/`docgen_settings` rules:
```
// live company data: reviewer write, allowlisted read
match /cfg_entities/{id}  { allow read: if isAllowlisted(); allow write: if isReviewer();
  match /directors/{d} { allow read: if isAllowlisted(); allow write: if isReviewer(); }
  match /lob/{l}       { allow read: if isAllowlisted(); allow write: if isReviewer(); }
  match /signers/{s}   { allow read: if isAllowlisted(); allow write: if isReviewer(); }
}
match /cfg_thresholds/{id}{ allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_approvals/{id} { allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_agents/{id}    { allow read: if isAllowlisted(); allow write: if isReviewer(); }
match /cfg_policies/{id}  { allow read: if isAllowlisted(); allow write: if isReviewer(); }

// maker-checker queue: any allowlisted user proposes as themselves; only a reviewer transitions
match /cfg_proposals/{id} {
  allow read:   if isAllowlisted();
  allow create: if isAllowlisted() && request.resource.data.proposerEmail == email()
                && request.resource.data.status == 'pending';
  allow update: if isReviewer();   // approve / reject only
  allow delete: if false;
}
```
Policy chunks/vectors are written by server routes via the Admin SDK; not client-writable.

## 14. Functional Requirements

- FR1. Top-level **Company Data** module; three worlds + a reviewer-only Change Requests queue.
- FR2. Entity detail **page** with Profile / Directors / Lines of Business / Authorized Signers tabs;
  Add/Edit/Archive on each (counsel → proposal; reviewer → live).
- FR3. Approval Policy: edit thresholds (ascending-validated, with impact preview + effective date) and
  drill-down per-department routing; plain-language signer-vs-approval framing.
- FR4. Agents registry: templated instruction + guardrails + **test sandbox**; model & policy scope.
- FR5. Policy Library: upload → **extraction-preview gate** → index → use; version/source on answers.
- FR6. `useCompanyData()` consumption layer with seed fallback; Document Number Generator rewired to it.
- FR7. Maker-checker: counsel submit proposals; reviewer queue with diff + impact; approve/reject;
  proposer sees pending state on the record.
- FR8. Archive-first with reference checks and Restore; truthful icons/verbs; hard delete only when
  unreferenced.
- FR9. Dirty-state guard; visible "last changed / revert"; empty/first-run states; global search.
- FR10. All writes (propose, approve, reject, direct edit, archive, policy index) audited.

## 15. Phased Rollout

1. **Phase 1 — Records + Approval Policy + maker-checker spine (highest value):** Company Data nav and
   three-world IA; migrate Entities (+Directors, +LoB, +Signers) and Approval Policy to `cfg_*` seeded
   from `lib/docgen.js`; build `useCompanyData()` + seed fallback; stand up `cfg_proposals` + the Change
   Requests queue (reusing the clause review components); rewire the Document Number Generator. Ships the
   trust/safety basics (archive-first, impact preview, dirty-state, visible history, empty states).
2. **Phase 2 — Agents:** templated agents + test sandbox, wired into `/api/assist`.
3. **Phase 3 — Policy RAG:** upload → extraction-preview → index → retrieve, with trust UX on answers.

## 16. Open Items

- OI1. **Reviewer self-edit vs self-proposal.** v2 lets the Head of Legal edit live directly
  (self-audited). Confirm whether even reviewer edits to *thresholds* should pass through the queue for a
  second pair of eyes.
- OI2. **Embedding provider & cost** (Voyage vs Cohere); key handling alongside `ANTHROPIC_API_KEY`.
- OI3. **Policy storage** — Drive (`drive.file`, wired) vs Firebase Storage; decide at Phase 3.
- OI4. **Workbook importer** for Directors / Lines of Business / current approvers, vs manual entry.
- OI5. **Impact-preview depth** — exact vs approximate re-routing counts over historical `docnumbers`.

## 17. Change Log

- 2026-06-05 (v2) — Restructured per senior design critique: three-world entity-centric IA; **maker-checker
  governance** (owner decision 2026-06-05, reusing propose→review→adopt); drill-down approval matrix with
  impact preview; archive-vs-delete truthfulness; policy extraction-preview gate + answer provenance;
  templated agents + test sandbox; dirty-state guard, visible history/revert, empty states, global search,
  multi-currency framing. Renamed module "Settings" → "Company Data". Status: PROPOSED.
- 2026-06-05 (v1) — Initial spec. Five flat domains; Head-of-Legal-only writes. Superseded by v2.
