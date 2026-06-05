// lib/config.js — deployment identity. Override per-client via env without touching source.
// COMPANY_LABEL appears in the UI header, the .docx export header, and the export filename.
export const COMPANY_LABEL =
  process.env.NEXT_PUBLIC_COMPANY_LABEL || "[Company]";

export const PLAYBOOK_VERSION =
  process.env.NEXT_PUBLIC_PLAYBOOK_VERSION || "v3.2 (02 Jun 2026)";

// Short version tag stamped onto Firestore records (clauses on re-sync, adopted
// addenda). Tracks the current master Playbook in playbook/ and the Drive folder.
export const PLAYBOOK_VERSION_TAG =
  process.env.NEXT_PUBLIC_PLAYBOOK_VERSION_TAG || "v3.2";

// AI assist (Claude) UI toggle. The server route also requires ANTHROPIC_API_KEY;
// this only controls whether the in-app AI buttons are shown. Default on.
export const AI_ASSIST_ENABLED =
  (process.env.NEXT_PUBLIC_AI_ASSIST || "on").toLowerCase() !== "off";

// In-app "Save to Drive" for the master export. Requires the reviewer's Google
// sign-in to carry the drive.file scope (enabled in the Google Cloud console).
// Default OFF — set NEXT_PUBLIC_DRIVE_UPLOAD=on once the scope is live.
export const DRIVE_UPLOAD_ENABLED =
  (process.env.NEXT_PUBLIC_DRIVE_UPLOAD || "off").toLowerCase() === "on";

// Target Drive folder for the master export (the "Legal Operations Workbench" folder).
export const DRIVE_FOLDER_ID =
  process.env.NEXT_PUBLIC_DRIVE_FOLDER_ID || "1EUxfSoMhazorsUNEbSPSqruhukd3Nure";

// Reviewer-only Drive housekeeping: move a superseded file out of the Workbench folder into its
// "Archived" subfolder. Requires the BROADER `drive` scope (not just drive.file) so the app can
// see and relocate files it did not itself create. This is a meaningful escalation — the reviewer
// grants full Drive access — so it is OFF by default; set NEXT_PUBLIC_DRIVE_MANAGE=on to enable.
export const DRIVE_MANAGE_ENABLED =
  (process.env.NEXT_PUBLIC_DRIVE_MANAGE || "off").toLowerCase() === "on";

// The "Archived" subfolder inside the Workbench folder. Auto-discovered/created at runtime when blank.
export const DRIVE_ARCHIVE_FOLDER_ID =
  process.env.NEXT_PUBLIC_DRIVE_ARCHIVE_FOLDER_ID || "1kRaTNcs0wMnseEo7XKfXYZmbThMcoVG-";

// ---- Company Data · User Management (Team & Access) ----
// Public base URL of the workbench, used in the invite email's sign-in link.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://legal-ops-two.vercel.app";

// Email domains an admin may add as users. Enforced BOTH here (UX) and in Firestore rules
// (the security boundary — adding a new domain requires editing firestore.rules as well).
export const ALLOWED_USER_DOMAINS =
  (process.env.NEXT_PUBLIC_ALLOWED_USER_DOMAINS || "pluang.com,batubara-id.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// Auto-send the invite email when an admin adds a user. Requires the `gmail.send` scope to be
// enabled on the OAuth consent screen (Google Cloud console) — same kind of escalation as Drive.
// OFF by default: until enabled, the UI falls back to a copyable invite link. Set
// NEXT_PUBLIC_USER_INVITE_EMAIL=on once the scope is live.
export const USER_INVITE_EMAIL_ENABLED =
  (process.env.NEXT_PUBLIC_USER_INVITE_EMAIL || "off").toLowerCase() === "on";
