# Allowlist Governance & Offboarding (PRD OI4)

**Classification:** Confidential & Legally Privileged — internal use only.

Who may access the Legal Operations Workbench is controlled entirely by the Firestore
`allowlist` collection. This runbook defines who owns it and how to on/offboard people.
It resolves PRD §11 open item **OI4**.

## How access works (recap)
- A person can use the app only if a document exists at `allowlist/{email}` (email lowercased),
  with a `role` field of `reviewer` or `contributor`.
- Firestore rules enforce this server-side: reads of `clauses`/`proposals`/`adopted` require an
  allowlisted token; reviewer-only actions require `role == 'reviewer'` (or a `reviewer:true`
  custom claim). Client writes to `allowlist` are blocked (`allow write: if false`) — it is
  managed only from the Firebase console (or Admin SDK).
- No allowlist document ⇒ no access, even with a valid Google sign-in. Removing the document
  revokes access at the rules layer immediately on the user's next request.

## Ownership
- **Owner (accountable):** the Head of Legal.
- **Operator (may execute changes):** the Head of Legal, or a named deputy the Head of Legal
  designates in writing. Changes are made in the Firebase console for project `legalops2026`
  (**Firestore → `allowlist`**).
- Only the project Owner/Editor on the Firebase/Google Cloud project can edit the collection.
  Keep that Google Cloud IAM membership tight (Head of Legal + one backup).

## Onboarding a person
1. Firebase console → Firestore → `allowlist` → **Add document**.
2. **Document ID** = the person's email, **lowercased** (e.g. `jane.doe@company.com`).
3. Fields: `role` = `contributor` (default) or `reviewer`; optional `addedAt` = today's date,
   `addedBy` = your email.
4. Tell the person to sign in with that exact Google account.
   - Reviewer rights resolve from `role: 'reviewer'`. (The optional `reviewer:true` custom claim
     via `scripts/setReviewer.mjs` is **not** required in the live, key-free setup.)

## Offboarding a person (do all that apply)
1. **Remove access (required):** Firestore → `allowlist` → delete the `allowlist/{email}` document.
   Access is revoked at the rules layer on their next request.
2. **Disable the identity (recommended):** Firebase console → **Authentication → Users** →
   find the email → **Disable** or **Delete** the user, so they cannot obtain a fresh ID token.
3. **Revoke a reviewer claim (only if one was ever set):** if `reviewer:true` was set via the
   Admin SDK for that user, clear it (`setCustomUserClaims(uid, {reviewer:false})`); tokens carry
   the claim for up to ~1 hour, so step 2 (disable) is the immediate control.
4. **Reassign their in-flight work:** their submitted proposals and audit entries are retained for
   the record (immutable); no deletion needed. Adopted positions are unaffected.

## Periodic review
- The Head of Legal reviews the full `allowlist` at least **quarterly** (and immediately on any
  team change), confirming each entry is still a current, authorised team member and the role
  (reviewer vs contributor) is still correct.
- Cross-check against the company's HR offboarding process so leavers are removed promptly.

## Audit note
- Firestore does not keep a built-in history of `allowlist` edits. Record each add/remove in the
  PRD change log (or a simple shared log) with date, email, role, and who made the change, so the
  access history is auditable.

## Optional future enhancement (not built)
An in-app reviewer-only allowlist admin screen would require relaxing the `allowlist` write rule
from `if false` to `if isReviewer()` and adding write paths — a security-sensitive change. It is
deliberately **not** implemented; console management keeps the trust boundary simple. Revisit only
if console-based management becomes a bottleneck, and have the Head of Legal sign off the rule change.
