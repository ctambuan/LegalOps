// lib/config.js — deployment identity. Override per-client via env without touching source.
// COMPANY_LABEL appears in the UI header, the .docx export header, and the export filename.
export const COMPANY_LABEL =
  process.env.NEXT_PUBLIC_COMPANY_LABEL || "[Company]";

export const PLAYBOOK_VERSION =
  process.env.NEXT_PUBLIC_PLAYBOOK_VERSION || "v3.1 (01 Jun 2026)";

// Short version tag stamped onto Firestore records (clauses on re-sync, adopted
// addenda). Tracks the current master Playbook in playbook/ and the Drive folder.
export const PLAYBOOK_VERSION_TAG =
  process.env.NEXT_PUBLIC_PLAYBOOK_VERSION_TAG || "v3.1";

// AI assist (Claude) UI toggle. The server route also requires ANTHROPIC_API_KEY;
// this only controls whether the in-app AI buttons are shown. Default on.
export const AI_ASSIST_ENABLED =
  (process.env.NEXT_PUBLIC_AI_ASSIST || "on").toLowerCase() !== "off";
