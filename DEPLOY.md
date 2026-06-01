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

## 4. Service account (for seeding + reviewer claim)
1. Firebase console → Project settings → Service accounts → Generate new private key.
2. Save as `service-account.json` in the project root (it is gitignored — never commit it).

## 5. Seed the 74 Playbook clauses
```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed
```

## 6. Allowlist + reviewer
The reviewer (workspace owner) must sign in once first (so her user record exists), then:
```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  npm run setclaims -- owner@example.com reviewer teammate@example.com contributor
```
Re-run with additional `<email> <role>` pairs to add team members. Removing someone: delete their
`allowlist/{email}` doc in the console (and unset the reviewer claim if applicable).

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
