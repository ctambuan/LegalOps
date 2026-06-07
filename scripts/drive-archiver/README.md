# Drive auto-archiver (Apps Script)

Keeps the **Workbench** Drive folder showing only the **current PRD**: a time-driven Google Apps
Script moves every superseded PRD copy into the **Archived** subfolder automatically. This retires
the manual delete/move step in the "update PRD" protocol — and, unlike the in-app archiver
(`app/DriveArchive.js`), it also catches the Google Doc published by the Claude/MCP connector, which
can create/copy but **cannot** move or delete.

## Why this design (CLAUDE.md principles)

- **Security / org policy** — runs as the **authorizing user's own Google identity** (the GC's
  account). No service-account key, consistent with the app's reviewer-OAuth model.
- **Sustainability** — it **moves, never deletes**. Every action is reversible: restore from
  Archived at any time.
- **Cost** — Apps Script + a time trigger are **free**; no new paid infra.
- **Reliability** — **idempotent**. With 0–1 PRD present it does nothing, so it's safe on any
  schedule. A scope guard means it only ever touches files whose name contains `PRD` sitting
  **directly** in the Workbench folder; subfolders, masters and other exports are untouched.

## Setup (once, ~3 minutes)

1. Go to **[script.google.com](https://script.google.com)** → **New project**.
2. Replace the default `Code.gs` with the contents of [`Code.gs`](./Code.gs).
3. Sign in as the **General Counsel** account (the identity that should own the moves).
4. Run the **`setup`** function (▶). Approve the Drive authorization prompt the first time.
   - `setup()` writes the folder IDs to **Script Properties**, installs the recurring trigger
     (every 6h by default), and prints a **dry-run preview** of what it would archive.
5. (Optional) Run **`dryRun`** any time to preview without changing anything; run **`sweep`** to
   archive immediately.

The folder IDs default to the live Workbench (`1EUxfSoM…`) and Archived (`1kRaTNcs…`) folders,
matching `lib/config.js`. To point at different folders, edit the Script Properties
`WORKBENCH_FOLDER_ID` / `ARCHIVE_FOLDER_ID` (Project Settings → Script Properties). Leave
`ARCHIVE_FOLDER_ID` blank to auto-find/create an `Archived` subfolder.

## Functions

| Function | What it does |
|---|---|
| `setup()` | One-time installer: writes properties, installs the trigger, prints a dry-run. Safe to re-run. |
| `dryRun()` | Prints what a real run **would** move. Changes nothing. |
| `sweep()` | The function the trigger calls — archives superseded PRDs for real. |
| `installTrigger()` | (Re)installs the recurring time trigger (de-dupes first). |
| `removeTriggers()` | Stops the schedule / removes all triggers this script owns. |

## How "current" is chosen

The keeper is the file with the **highest `vMAJOR.MINOR`** parsed from its name (so `v4.0` beats
`v3.10` beats `v3.9` beats `v0.8`); ties break to the **most recently created** file. Archived
copies are name-stamped `[archived YYYY-MM-DD]` (idempotent) so they're self-describing.

## Relationship to the rest of the system

- **In-app archiver** (`app/DriveArchive.js`, gated by `NEXT_PUBLIC_DRIVE_MANAGE`) stays as the
  manual, on-demand tool for reviewers inside the dashboard. The two are complementary; this script
  is the unattended safety net.
- Resolves PRD open item **(i) "automated Drive archiving (manual delete today)"**. When you next
  run the **update PRD** protocol, update that item and the Maintenance Protocol note accordingly.

## To uninstall

Run `removeTriggers()` (stops the schedule), then delete the Apps Script project. No data is lost —
nothing was ever deleted, only moved.
