# Master Playbook — canonical source of truth

**Current file:** `00.01_Pluang_Contracting_Playbook_v3.2_2026-06-02.docx` (v3.2 — CL-31 Non-Exclusivity baseline recalibrated from an adopted addendum)
**Prior versions:** `00.01_Pluang_Contracting_Playbook_v3.1_2026-06-01.docx` and `..._v3.0_08_May_2026.docx` (retained for audit)
**Classification:** Confidential & Legally Privileged — internal use only.

This Word document is the **controlling master** for the clause library and contracting positions
(the human-authored Playbook). The app's Firestore `clauses` collection is a *derived* read-only
reference seeded from this master; this `.docx` is the authority.

## Calibration discipline (decided by the Head of Legal, 2026-06-01)
- When a clause change is **adopted** in the Contracting Engine, the master is **edited directly**:
  the specific clause text is revised and the document version is bumped (e.g. v3.0 → v3.1).
- **Formatting is never altered.** Edits are surgical: only the affected text runs inside
  `word/document.xml` are changed; all other package parts (styles, numbering, headers/footers,
  theme, footnotes) are copied byte-for-byte. Validated round-trip; see commit history.
- Each revision is saved as a new **dated, versioned** file (the prior version is retained for audit).
- A copy of the current master is kept in the dedicated **"Legal Operations Workbench"** Google Drive
  folder (ID `1EUxfSoMhazorsUNEbSPSqruhukd3Nure`) for the Head of Legal; because the Drive connector
  cannot edit/upload Word files, each new version is delivered to the Head of Legal for upload there
  (newest dated file = current). v3.1 is uploaded there as of 2026-06-01.
- Every calibration is recorded in the PRD change log (Section 12), mirroring PRD discipline.

## Releasing a new version to the app (e.g. v3.1 → v3.2)
The `.docx` ↔ app sync is **manual by design** (the anti-drift step). When the master is bumped,
these must move together in the same commit, or the app will serve stale or mislabelled text:
1. **Regenerate `data/clauses.seed.json`** from the new `.docx` so the seeded clause text matches
   the master. ("Re-sync from master" in the app reloads from this JSON, not from Drive.)
2. **Bump the version tag** — set `NEXT_PUBLIC_PLAYBOOK_VERSION_TAG` (short, e.g. `v3.2`) and
   `NEXT_PUBLIC_PLAYBOOK_VERSION` (display, e.g. `v3.2 (DD Mon 2026)`) in the deploy env, or update
   the defaults in `lib/config.js`. The tag is what gets stamped onto re-synced clauses and adopted
   addenda in Firestore.
3. **Update the "Current file" line above** and retain the prior `.docx` for audit.
4. **Deliver the new `.docx`** to the Head of Legal for upload to the Drive folder (newest dated
   file = current), and record the calibration in the PRD change log (Section 12).
5. **Re-confirm adopted addenda (PRD OI5).** After the bump, the Master view and the exported `.docx`
   flag every adopted addendum still stamped with the *previous* version. Review each flagged addendum
   against the recalibrated clause text and either re-affirm it (re-adopt) or revise it, so no addendum
   silently drifts from the new master. This is a deliberate human check — there is no automated
   re-mapping.

## Why it lives here
Kept under version control so revisions are precise, reversible, and auditable, and so the exact
formatting is preserved across edits. This repository is private.
