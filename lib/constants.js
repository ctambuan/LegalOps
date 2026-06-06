// lib/constants.js — Playbook classification scheme. Single definition reused across UI and export.
export const TIERS = {
  baseline:   { c: "base", l: "Baseline Position" },
  fallback:   { c: "fall", l: "Acceptable Fallback" },
  escalation: { c: "esc",  l: "Escalation Required" },
  prohibited: { c: "proh", l: "Prohibited / High Risk" },
};

export const CTYPES = {
  improve:  "Improvement",
  fallback: "Add Fallback",
  expand:   "Conditional Expansion",
  new:      "New Clause",
};

export const CLASSES = [
  "Mandatory Law",
  "Internal Policy",
  "Market-Standard",
  "Preferred Posture",
];

export const JURISDICTIONS = [
  "Group-wide", "Indonesia", "Singapore", "Philippines", "India", "Seychelles", "Cross-border",
];

// Role identity labels. The stored role values stay 'reviewer' / 'contributor' (rules + data
// untouched); these are the group-level display names led by the General Counsel.
export const ROLE_LABELS = {
  reviewer: "General Counsel",
  contributor: "Regional Counsel",
};
export const roleLabel = (r) => ROLE_LABELS[r] || r || "—";

export { PLAYBOOK_VERSION } from "./config";
