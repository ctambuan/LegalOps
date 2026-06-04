// lib/reportConfig.js — Task Tracker and Report module configuration.
// The section taxonomy, action tags, matter groups and team roster that drive the
// Weekly Legal Report. The drafting discipline these encode is documented in
// docs/weekly_report_style_guide.md and reproduced as the AI system prompt in
// app/api/report/route.js. Keep the three in sync.

// Report sections, ranked by management attention (most → least). The AI classifies
// every matter into exactly one of these.
export const REPORT_SECTIONS = [
  { key: "A", title: "Actions Required From Management This Week",
    preamble: "Matters requiring a management decision, approval, signature, or alignment this period." },
  { key: "B", title: "Material Matters: For Management Awareness",
    preamble: "No management decision is required on the following matters. They are reported for management's awareness and visibility." },
  { key: "C", title: "Active Commercial and Partnership Matters",
    preamble: "All matters below are being managed by the Legal Team. Where a matter is pending a specific internal team or counterparty, this is identified. No management direction is required." },
  { key: "D", title: "Corporate Secretarial, Tax and Compliance", preamble: "" },
  { key: "E", title: "Legal Operations", preamble: "" },
  { key: "F", title: "Scheduled BAU, Administrative and Resolved Matters",
    preamble: "Routine matters completed during the week. Noted for completeness and record-keeping. No management visibility required." },
];

// Controlled vocabulary for the management action sought (Section A matters only).
export const ACTION_TAGS = [
  "DECISION REQUIRED",
  "APPROVAL AND SIGNATURE",
  "SIGNATURE",
  "APPROVAL",
  "ALIGNMENT",
];

// Matter Group dropdown — mirrors the Microsoft Form. Reviewer may override via
// report_settings; this is the default seed.
export const MATTER_GROUPS = [
  "Business Developments",
  "Compliance and EA Support",
  "Corporate Developments",
  "Corporate Secretarial and Compliance",
  "Data Privacy",
  "Disputes, Claims and Litigations",
  "Finance, Tax and Accounting",
  "HR and GA",
  "Legal Operations",
  "Marketing and Branding",
  "Partnership",
  "Procurement",
  "Product and Tech",
  "Special Project",
  "Revenue Operations",
  "Commercial",
  "Other",
];

// Team roster (the Name field). Reviewer may override via report_settings.
export const DEFAULT_ROSTER = [
  "Christine Tambunan",
  "Alsya Nadira",
  "Alifianissa Putri Yuwono",
  "Vinca Vinenska",
];
