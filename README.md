# Clause Library Workbench

**Confidential & Legally Privileged — internal use only.**

A governed, multi-user proposal-and-adoption layer over the Legal Contract Review Playbook
v3.0. The team retrieves clauses, proposes improvements / fallbacks / expansions / new clauses, and
the Head of Legal reviews, approves, and adopts them into a master record exportable to Word.

This is a **proposal layer on top of** the Playbook, not a replacement — the Playbook remains the
controlled source of truth (see PRD §4, Anti-Drift Principle).

This is a company-agnostic template. Set the deploying organisation's identity in `lib/config.js`
(or via `NEXT_PUBLIC_COMPANY_LABEL` / `NEXT_PUBLIC_PLAYBOOK_VERSION`) without editing source.

## Stack
- Next.js 15 (App Router) on Vercel
- Cloud Firestore (asia-southeast2 / Jakarta)
- Firebase Authentication (Google) + email allowlist enforced in Firestore rules
- Client-side `.docx` export

## Key documents
- `PRD_Clause_Workbench.md` — the controlling spec. Every change is logged in its Change Log.
- `DEPLOY.md` — step-by-step deployment + pre-go-live security checks.
- `firestore.rules` — server-enforced access control.

## Roles
- **Contributor** — browse library, submit proposals, see status.
- **Reviewer (Head of Legal)** — all of the above + review queue, approve/adopt, export master.
- Anyone not on the allowlist is denied at Auth and at the rules layer.

## Develop
```bash
npm install
cp .env.local.example .env.local   # add Firebase web config
npm run dev
```

## Status
Pre-deployment. Build compiles, lints, and type-checks cleanly. Open compliance items (privileged
data residency, Drive write authorisation) are listed in PRD §11 and must be resolved with the DPO /
Head of Legal before go-live. AI-assisted outputs are working drafts and are not a Legal Department
position until reviewed and adopted.
