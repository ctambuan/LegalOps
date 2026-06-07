# DEPLOY.md — Clause Library Workbench

> Confidential & Legally Privileged. Read the PRD (`PRD_Clause_Workbench.md`) Section 11
> (Open Items / Risks) before go-live. Resolve OI2 and OI3 (privileged data in personal Drive /
> Firebase, and Auth data residency) with the DPO / Head of Special Project.

## Prerequisites
- Node.js 20+
- A Google account with access to Firebase + a Vercel account + a GitHub account
- `firebase-tools` (`npm i -g firebase-tools`) and the Vercel CLI (`npm i -g vercel`)

## 1. Firebase project
1. Create a Firebase project at console.firebase.google.com.
2. **Firestore** → Create database → **Production mode** → location **asia-southeast2 (Jakarta)**.
   (This is irreversible. Confirm Jakarta is correct per the PRD before creating.)
3. **Authentication** → Sign-in method → enable **Google**.
4. Project settings → General → add a **Web app**; copy the config values.

## 2. Local setup
```bash
npm install
cp .env.local.example .env.local      # paste the web config values
```
Optional (company-agnostic template): set `NEXT_PUBLIC_COMPANY_LABEL` and
`NEXT_PUBLIC_PLAYBOOK_VERSION` to brand the deployment without editing source (see `lib/config.js`).

## 3. Security rules + indexes
```bash
firebase login
firebase use --add                     # select your project
firebase deploy --only firestore       # deploys firestore.rules + indexes
```
> **Re-run this whenever `firestore.rules` changes.** Pushing app code does **not** deploy
> rules — they ship on their own. After pulling a release that touches `firestore.rules`
> (e.g. the **Task Tracker and Report** module, which adds the `report_settings`,
> `report_matters` and `weekly_reports` collections), redeploy:
> ```bash
> firebase deploy --only firestore:rules
> ```
> Until you do, the new collections are denied and the feature's reads/writes will fail.

## 4. First reviewer + allowlist (no service account required)
Many Google Workspace orgs block service-account key creation. None is needed: the Firestore **console**
writes with owner privileges and bypasses security rules, so the allowlist is bootstrapped by hand.
1. Firestore Database → **Start collection** `allowlist`.
2. Document ID = the reviewer's email (lowercase). Add field `role` (string) = `reviewer`. Save.
3. Add each team member the same way with `role` = `contributor`.

`isReviewer()` resolves from the allowlist `role`, so no custom-claim step is required. (The optional
`scripts/seed.mjs` / `scripts/setReviewer.mjs` remain for environments that *do* allow a service account.)

## 5. Load the 74 Playbook clauses (one-time, in-app — no key, no CLI)
The clauses are loaded by the signed-in reviewer through the server-side loader (`app/api/seed`). The
privileged clause text lives only on the server and is never sent to the browser.
1. Deploy the app (Section 7) and sign in as the reviewer (whose allowlist doc exists from Section 4).
2. On the **Clause Library** tab, click **Load Playbook clauses**.

Re-seeding (e.g. when Playbook v3.1 issues) uses the same button. This relies on the `clauses` rule
`allow write: if isReviewer()`.

## 7. Deploy to Vercel
1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. In Vercel → Project → Settings → Environment Variables, add all six `NEXT_PUBLIC_FIREBASE_*`
   values (Production + Preview).
4. In Firebase console → Authentication → Settings → Authorized domains, add your Vercel domain(s).
5. Deploy (`vercel --prod` or via the Git integration).

## 8. Security re-check before go-live (do not skip)
- Run `npm audit` against the live npm registry and pin Next.js to the **latest patched release**
  (this sandbox could not give a clean audit; verify on real infrastructure).
- Verify in the deployed app:
  - A **non-allowlisted** Google account → sees "Not authorised", can read/write nothing.
  - A **contributor** → can browse + submit, but the Review tab is absent and Firestore rejects any
    write to `adopted` or status transition (test in console rules simulator).
  - **the reviewer (owner)** → review + approve/adopt + export work.
- Confirm Firestore is in asia-southeast2.

## 9. Drive write for the master .docx
The app generates the master `.docx` client-side (download). To place it in the configured Drive folder,
either upload manually, or (future) wire the Drive API with a write-scoped credential — see PRD OI1.
NOTE (2026-06-01): the Drive connector now authenticates and can write to the configured project folder
(the PRD and project records were written via it). Confirm whether the in-app export should use the same
credential/scope, and whether the target is a Shared Drive (different write permissions) or a normal folder.

## 10. In-app Drive archiving of superseded documents (broad `drive` scope)
The reviewer can move a superseded file out of the Workbench folder into its **Archived** subfolder
from inside the app (Contracting Engine → **Master & Export**, at the foot of the page). This is OFF
by default and is a deliberate scope escalation:

- **Why it needs more than `drive.file`:** Save-to-Drive only touches files the app itself created,
  so `drive.file` suffices. Archiving has to *see and relocate files the app did not create* (e.g. the
  PRD, an old master, a manual upload), which `drive.file` cannot do. The reviewer's Google sign-in
  therefore requests the broad `https://www.googleapis.com/auth/drive` scope when this feature is on.
- **Enable it:**
  1. Google Cloud console → APIs & Services → **OAuth consent screen** → add the scope
     `https://www.googleapis.com/auth/drive` (in addition to / replacing `drive.file`). This is a
     sensitive scope; if the consent screen is in "Production" you may face Google verification unless
     all users are inside your Workspace org (internal app).
  2. Vercel env: set `NEXT_PUBLIC_DRIVE_MANAGE=on`. Optionally set
     `NEXT_PUBLIC_DRIVE_ARCHIVE_FOLDER_ID` (defaults to the existing **Archived** subfolder
     `1kRaTNcs0wMnseEo7XKfXYZmbThMcoVG-`; if blank the app finds/creates an `Archived` folder at runtime).
  3. Reviewers must **sign out and back in once** to grant the broader scope.
- **Safety:** archiving is a *move, not a delete* — the file stays in Drive (in Archived) and is fully
  restorable. The control is reviewer-only and every action runs under the signed-in reviewer's identity.
- **Turn it off:** set `NEXT_PUBLIC_DRIVE_MANAGE=off`; the app falls back to the narrow `drive.file`
  scope and the archive panel disappears.

### 10a. Unattended auto-archiving (Apps Script)
The in-app panel above is **manual / on-demand**. For hands-off archiving — including the PRD Google
Doc published by the Claude/MCP connector during "update PRD" (the connector can create/copy but not
move/delete) — install the time-driven Apps Script in **`scripts/drive-archiver/`**. It keeps only the
current PRD in the Workbench folder and moves superseded copies into **Archived** on a schedule.
- Runs as the **GC's own Google identity** (no service-account key), moves rather than deletes
  (reversible), and is **free** (Apps Script + a time trigger). Setup is a ~3-minute paste-and-run;
  see `scripts/drive-archiver/README.md`.
- The two are complementary: the in-app panel for ad-hoc moves, the script as the unattended safety net.

## 11. Task Tracker and Report module
The **Task Tracker and Report** tab (Legal Service Request Management dashboard + Weekly Report)
lets the team log matters per reporting period and have Claude draft a uniform, house-style weekly
report (see `docs/weekly_report_style_guide.md`). To bring it live after deploying the app code:

1. **Deploy the Firestore rules** (the one step a code deploy does **not** cover):
   ```bash
   firebase deploy --only firestore:rules
   ```
   This authorises the three new collections — `report_settings`, `report_matters`,
   `weekly_reports` — each enforcing *author owns their own; reviewer (Head of Legal) sees and
   manages all*. Without it the dashboard renders but every add/generate/save is denied.
2. **AI generation key:** report drafting calls Claude server-side via `app/api/report/route.js`,
   which reuses the existing `ANTHROPIC_API_KEY` (the same var the Contracting Engine assistant
   uses). If that is already set, generation works immediately; otherwise set it in Vercel env.
   The key is server-only — never `NEXT_PUBLIC`, never in the browser bundle.
3. **Roster & matter groups** seed from defaults (`lib/reportConfig.js`), so the form is usable on
   day one. The Head of Legal can edit both in-app via the reviewer-only **Manage lists** panel on
   the dashboard (persisted to `report_settings`), with no code change.
4. **Phase 2 (not yet built):** the live JIRA LSRM pull (per-user OAuth) will auto-populate
   "My matters"; for now matters are entered manually.

