# Master Playbook — canonical source of truth

**File:** `00.01_Pluang_Contracting_Playbook_v3.0_08_May_2026.docx`
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
- A copy of the current master is kept in the configured Google Drive folder for the Head of Legal;
  because the Drive connector cannot edit Word files in place, each new version is delivered for
  upload (newest dated file = current).
- Every calibration is recorded in the PRD change log (Section 12), mirroring PRD discipline.

## Why it lives here
Kept under version control so revisions are precise, reversible, and auditable, and so the exact
formatting is preserved across edits. This repository is private.
