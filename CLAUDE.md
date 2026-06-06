# CLAUDE.md — Engineering principles & project memory

This file is read by Claude Code at the start of every session. It is the durable record of how to
design, architect, and build in this repository. Follow it unless the user overrides it in the moment.

## Non-negotiable engineering principles (owner directive, 2026-06-05)

1. **Security, reliability, sustainability, scalability — first, always.** Every design, architecture,
   and code decision must explicitly weigh these four. Prefer the choice that is safer, more robust,
   more maintainable, and that scales — even when it is more work than a quick hack. Call out the
   trade-off when they conflict.

2. **Trusted sources only.** No AI agent and no code may take information from non-credible or
   unofficial sources. Prioritise, in order: (a) the data inside this dashboard / its Firestore
   collections, (b) the configured connectors (the MCP servers / official APIs), (c) other clearly
   official, authoritative sources. Never scrape or rely on unofficial/unknown web content for
   substantive output. When grounding an answer (e.g. RAG), cite the in-dashboard source.

3. **Pause and flag security risks.** When work reveals a threat, an unsecured system, a privilege-
   escalation path, an exposed secret, or any weak point — **stop, highlight it clearly to the user,
   and always propose a concrete fix**. Do not silently work around it or proceed as if it were fine.

## Architecture facts (stable — rely on these)

- **Stack:** Next.js (App Router, client components) + Firebase (Firestore + Google Auth). Hosted on
  Vercel. Verify changes with `npm run build` before committing.
- **No Firebase Admin SDK.** Org policy blocks service-account keys (`lib/verifyIdToken.js`). Therefore:
  - **Firestore security rules are the authorization boundary** — never trust client-side gating alone.
  - Server routes verify the caller by validating the Firebase ID token manually (`verifyRequest`).
  - Roles live in the `allowlist` doc's `role` field (and optional `reviewer` custom claim); there is
    no server-side claim-setting. User management is reviewer-gated client writes governed by rules.
- **Access model (group RBAC + company scope):** Google sign-in + an `allowlist` collection (doc id =
  lowercased email) holding `{ role, companies }`. Roles: **gc** (General Counsel, super-admin, group),
  **regional** (Regional Counsel, maker, group), **hol** (Head of Legal, approver+editor, per-company),
  **country** (Country Counsel, maker, per-company). `companies` is `"all"` or an array of entity codes.
  Legacy `reviewer`/`contributor` (the original owner's account) both normalise to `gc`. Capability helpers live in `lib/constants.js`
  (UI) and **mirror `firestore.rules` (the boundary)**: `isGC`, `hasCompany`, `isApproverFor`, `isMakerFor`.
  Key invariants: only GC manages users & grants (no privilege escalation by others); approvals are
  company-scoped (GC, or that company's Head of Legal) with **no self-approval**; scope is enforced in
  rules, never UI-only.
- **Audit everything.** Every write goes through `audit()` (append-only `audit` collection). Keep it so.
- **Master data → Company Data module.** Editable `cfg_*` collections (entities, etc.) are the single
  source of truth; the hardcoded arrays in `lib/docgen.js` are the seed/fallback. Tools read via
  `useCompanyData()`. Governance is maker-checker (`cfg_proposals`): counsel propose, the General
  Counsel approves. See `PRD_Company_Data_Settings.md` (the controlling spec — update it on every change).
- **Data sensitivity:** Confidential & Legally Privileged. Treat all content accordingly; restrict
  access by default; prefer soft-archive over hard delete for records others may reference.

## Workflow conventions

- Development branch for this work: `claude/elegant-hypatia-ACTT5`. Commit with clear messages; push
  only when asked or when a unit is complete and building.
- Keep `PRD_Company_Data_Settings.md` in lockstep with the code — append to its Change Log.
- Reuse existing UI components/classes (`.toolbar`, `.dtable`, `.overlay/.modal`, review-queue classes)
  for visual consistency; reuse defined CSS tokens (`--base`, `--proh`, `--esc`, `--line`, `--ink3`).
