// lib/config.js — deployment identity. Override per-client via env without touching source.
// COMPANY_LABEL appears in the UI header, the .docx export header, and the export filename.
export const COMPANY_LABEL =
  process.env.NEXT_PUBLIC_COMPANY_LABEL || "[Company]";

export const PLAYBOOK_VERSION =
  process.env.NEXT_PUBLIC_PLAYBOOK_VERSION || "v3.0 (08 May 2026)";
