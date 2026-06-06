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

// Group access model (owner decision 2026-06-05). One role per account, applied across one or more
// assigned companies (scope). Stored role values are the keys below; legacy 'reviewer'/'contributor'
// are normalised to gc/regional for continuity. Capability checks here mirror firestore.rules — the
// rules remain the real security boundary; these power UI gating only.
export const ROLES = {
  gc:       { label: "General Counsel",  rank: 4, approver: true, maker: true, scope: "group",   admin: true },
  regional: { label: "Regional Counsel", rank: 2, approver: false, maker: true, scope: "group" },
  hol:      { label: "Head of Legal",    rank: 3, approver: true, maker: true, scope: "company" },
  country:  { label: "Country Counsel",  rank: 1, approver: false, maker: true, scope: "company" },
};

export function normalizeRole(r) {
  // Legacy roles both belong to the original owner who built the workbench → General Counsel.
  if (r === "reviewer" || r === "contributor") return "gc";
  return r && ROLES[r] ? r : null;
}
export const roleLabel = (r) => ROLES[normalizeRole(r)]?.label || "—";

// Scope: `companies` is the string "all" (group-wide) or an array of entity codes.
export const inScope = (companies, code) =>
  companies === "all" || (Array.isArray(companies) && companies.includes(code));

// Capability helpers (company = entity code the action targets). GC can do everything.
export const isGCRole = (role) => normalizeRole(role) === "gc";
export const canApprove = (role, companies, code) => {
  const r = normalizeRole(role);
  return r === "gc" || (r === "hol" && inScope(companies, code));
};
// Direct live edit of an existing company = approver-level (GC or that company's Head of Legal).
export const canEditEntity = canApprove;
// Proposing a change to an existing company = any maker in scope.
export const canProposeEntity = (role, companies, code) => {
  const r = normalizeRole(role);
  return r === "gc" || r === "regional" || ((r === "hol" || r === "country") && inScope(companies, code));
};
// Creating a brand-new company is a group-structure act: GC direct, Regional may propose.
export const canCreateEntity = (role) => normalizeRole(role) === "gc";
export const canProposeNewEntity = (role) => ["gc", "regional"].includes(normalizeRole(role));

export { PLAYBOOK_VERSION } from "./config";
