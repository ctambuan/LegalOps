// lib/docgen.js — Document Number Generator: control-sheet data + pure formula logic.
// This is the single source of truth for the numbering rules, faithfully ported from the
// "2026 Document Number Generator" workbook (CONTROL SHEET + the per-row array formulas).
// All functions here are pure (no Firestore, no DOM) so they can be unit-reasoned and reused
// by the form, the Drive mirror export, and any server route.

// ---- CONTROL SHEET · Pluang Entities (A6:B20) ----
// name → code, used as the {EntityCode} segment. "Pluang Group" (code "Group") is added for the
// Policy series (its SWITCH table), so the unified entity list covers every document type.
export const ENTITIES = [
  { name: "PT Bumi Santosa Cemerlang", code: "BSC" },
  { name: "PT PG Berjangka", code: "PGB" },
  { name: "PT Pluang Emas Sejahtera", code: "PES" },
  { name: "PT Sejahtera Membangun Negeri", code: "SMN" },
  { name: "PT Pluang Investasi Semesta", code: "PIS" },
  { name: "PT Sarana Santosa Sejati", code: "SSS" },
  { name: "PT Vasham Kosa Sejahtera", code: "VKS" },
  { name: "Pluang Technologies India Private Limited", code: "PTI" },
  { name: "Pluang Technologies Pte Ltd", code: "PTS" },
  { name: "Pluang Enterprises Pte Ltd", code: "PE" },
  { name: "Macrodimarc Technology Corporation", code: "MTC" },
  { name: "PT Pluang Maju Sekuritas", code: "PLUS" },
  { name: "Athena Technologies Ltd", code: "Athena" },
  { name: "Valleyfields Technologies Ltd", code: "Vfields" },
  { name: "Pluang Group", code: "Group" },
];

// ---- CONTROL SHEET · Department Threshold + Approvers (A35:I60) ----
// code      → the {DeptCode} segment (VLOOKUP A:B)
// admin     → approver for "Administrative Documents"            (col C)
// agree25   → "Agreements", value ≤ USD 25,000/annum             (col D)
// agree100  → "Agreements", USD 25,000 < value < USD 100,000     (col E)
// agreeOver → "Agreements", ≥ USD 100,000/annum OR Unbudgeted    (col F)
// legalTemplate / legalModified are the Legal Approvers (cols H/I) — identical across rows today.
const CLEVEL = "1 C-level AND Claudia/Richard";
const D = (name, code, admin, agree25, agree100) => ({
  name, code, admin, agree25, agree100, agreeOver: CLEVEL,
  legalTemplate: "Legal Team Member", legalModified: "Head of Legal",
});
export const DEPARTMENTS = [
  D("Accounting", "Acc", "Lindawati", "Lindawati", "Eric Proulx"),
  D("Business Development", "BD", "Jonathan Gregorius", "Jonathan Gregorius", "Stella Lukman"),
  D("Business Operations", "Ops", "Jonathan Soeparjadi", "Jonathan Soeparjadi", "Stella Lukman"),
  D("Compliance", "Comp", "Gusti Kahari and Stella Lukman", "Stella Lukman", "Stella Lukman"),
  D("Commercial", "Cmrcl", "Stella Lukman", "Stella Lukman", "Stella Lukman"),
  D("Corporate Developments", "CD", "Tanya Tanojo", "Tanya Tanojo", "Eric Proulx"),
  D("Customer Experience", "CE", "Jonathan Soeparjadi", "Jonathan Soeparjadi", "Stella Lukman"),
  D("Data Science and Analytics", "DSA", "Sing Kiat", "Sing Kiat", "Chris Jangala"),
  D("Engineering", "Eng", "Ankit Argawal", "Ankit Argawal", "Aditya Jha"),
  D("External Affairs", "EA", "Gusti Kahari and Stella Lukman", "Stella Lukman", "Stella Lukman"),
  D("Finance", "Fin", "Lindawati", "Lindawati", "Eric Proulx"),
  D("Human Resources and General Affairs for SG", "HRGASG", "Benny Rachmadin", "Benny Rachmadin", "Chris Jangala"),
  D("Human Resources and General Affairs for ID", "HRGAID", "Benny Rachmadin", "Benny Rachmadin", "Benny Rachmadin"),
  D("Human Resources and General Affairs for IN", "HRGAIN", "Benny Rachmadin", "Benny Rachmadin", "Aditya Jha"),
  D("Legal", "Leg", "Christine Tambunan", "Christine Tambunan", "Stella Lukman"),
  D("Marketing", "MB", "Agung Hendrawan", "Agung Hendrawan", "Stella Lukman"),
  D("Partnership (Local)", "LocPrtnr", "Ferdinandus Valentino", "Ferdinandus Valentino", "Stella Lukman"),
  D("Partnership (Offshore)", "OSPrtnr", "Ferdinandus Valentino", "Ferdinandus Valentino", "Eric Proulx"),
  D("Procurement", "Proc", "Ferdinandus Valentino", "Ferdinandus Valentino", "Eric Proulx"),
  D("Product", "Prod", "Kaustubh Kulkarni", "Kaustubh Kulkarni", "Aditya Jha"),
  D("Product Design", "PD", "Marvin Honanda", "Marvin Honanda", "Richard Chua"),
  D("Public Policy", "PP", "Jonathan Gregorius", "Jonathan Gregorius", "Stella Lukman"),
  D("Revenue Operations", "RO", "Chris Jangala", "Chris Jangala", "Claudia Kolonas"),
  D("Special Projects", "SP", "Jonathan Soeparjadi and Stella Lukman", "Stella Lukman", "Stella Lukman"),
  D("Tax", "Tax", "Tegar Wibisono", "Tegar Wibisono", "Eric Proulx"),
  D("Treasury", "Trea", "Zhao Rui", "Zhao Rui", "Eric Proulx"),
];

// ---- CONTROL SHEET · Cabinet Code (A23:B31) — for the optional Filing Tracker / Folder Code ----
export const CABINETS = [
  { name: "Big White Cabinet", code: "BWC" },
  { name: "Big Black Safe Deposit", code: "BSD" },
  { name: "Green Safe Deposit 1", code: "GSD 1" },
  { name: "Green Safe Deposit 2", code: "GSD 2" },
  { name: "Green Safe Deposit 3", code: "GSD 3" },
  { name: "Grey Safe Deposit", code: "MSD" },
  { name: "Sent Out", code: "OUT" },
  { name: "Handed Over to PIC", code: "PIC" },
];

// ---- CONTROL SHEET · Type of Document (A62:A68) + Policy (separate register) ----
// Selecting "Policy" switches the number to the Policy series format (…-POL-…).
export const DOC_TYPES = [
  "Letter", "Non Disclosure Agreement", "Quotation", "Agreement",
  "Power of Attorney", "Minutes of Delivery", "Policy",
];

// ---- CONTROL SHEET · Department Threshold (the Document Type / Value dropdowns) ----
export const DOC_CATEGORIES = ["Administrative Documents", "Agreements or Binding Documents"];
export const DOC_VALUES = [
  "≤ USD 25,000 per annum",
  "USD 25,000 < value < USD 100,000 per annum",
  "≥ USD 100,000 per annum",
  "Unbudgeted or outside approved budget",
];
export const SIGNING_METHODS = ["Electronic", "Wet-Ink"];

// Documents whose type routes to the Policy ("POL") series rather than the standard series.
export const POLICY_TYPES = ["Policy"];
export const seriesForType = (docType) => (POLICY_TYPES.includes(docType) ? "POL" : "STD");

// ---- lookups ----
export const entityCode = (name) => ENTITIES.find((e) => e.name === name)?.code || "";
export const deptByName = (name) => DEPARTMENTS.find((d) => d.name === name) || null;
export const deptCode = (name) => deptByName(name)?.code || "";
export const cabinetCode = (name) => CABINETS.find((c) => c.name === name)?.code || "";

// ---- formula helpers (faithful ports of the workbook's array formulas) ----

// {No} segment: TEXT(seq,"000") — zero-padded to at least three digits.
export const padSeq = (seq) => String(Math.max(0, Number(seq) || 0)).padStart(3, "0");

// ROMAN(MONTH(date)) — month 1..12 → Roman numeral.
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const romanMonth = (month) => ROMAN[Number(month)] || "";

// {JIRA} segment, Legal & Compliance rule (the canonical one for the unified flow):
//   =IFERROR(LEFT(C,1)&TEXT(MID(C,FIND("-")+1,99),"0000"), C)
// "CMD-4847" → "C4847"; "CMD-847" → "C0847"; a plain "1234" (no dash) → "1234".
export function jiraCode(jira) {
  const s = String(jira ?? "").trim();
  if (!s) return "";
  const dash = s.indexOf("-");
  if (dash === -1) return s;                       // no dash → raw value (IFERROR branch)
  const digits = s.slice(dash + 1).replace(/[^0-9]/g, "");
  if (!digits) return s;                            // nothing numeric after dash → raw value
  return s[0].toUpperCase() + digits.padStart(4, "0");
}

// {CounterpartyInitials}: TEXTJOIN of the first letter of each word.
//   "Tunas Maju Selaras" → "TMS";  "Otoritas Jasa Keuangan" → "OJK".
export function counterpartyInitials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// Folder Code (U column): SUBSTITUTE(cabinet," ","")-row-folder. Blank unless all parts present.
export function folderCode({ cabinet, folderRow, folderNumber }) {
  const cc = cabinetCode(cabinet);
  if (!cc || folderRow === "" || folderRow == null || folderNumber === "" || folderNumber == null) return "";
  const strip = (v) => String(v).replace(/\s+/g, "");
  return `${strip(cc)}-${strip(folderRow)}-${strip(folderNumber)}`;
}

// Business Approvers (O column). Optional `overrides` lets Settings replace any approver name;
// it is keyed by department name → { admin, agree25, agree100, agreeOver }.
export function businessApprovers({ department, category, value }, overrides = {}) {
  const base = deptByName(department);
  if (!base) return "";
  const ov = overrides[department] || {};
  const get = (k) => (ov[k] ?? base[k]) || "";
  if (category === "Administrative Documents") return get("admin");
  if (category === "Agreements or Binding Documents") {
    if (value === "≤ USD 25,000 per annum") return get("agree25");
    if (value === "≥ USD 100,000 per annum" || value === "Unbudgeted or outside approved budget")
      return get("agreeOver");
    return get("agree100"); // USD 25,000 < value < USD 100,000
  }
  return "";
}

// {Year} and {month} come from the date-of-input. Accepts "YYYY-MM-DD" (the form's input value)
// or a Date; returns calendar parts in local terms without timezone drift for the string form.
export function dateParts(dateInput) {
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const [y, m, d] = dateInput.slice(0, 10).split("-").map(Number);
    return { year: y, month: m, day: d };
  }
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return { year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() };
}

// Build the full Document Number from a form record + an assigned sequence number.
//   Standard:  {No}/{JIRA}/{Dept}/{Entity}/{CPInitials}/{MonthRoman}/{Year}
//   Policy:    {No}-POL-{Entity}-{Year}
export function buildDocumentNumber(record, seq) {
  const { year, month } = dateParts(record.date);
  const no = padSeq(seq);
  const ent = entityCode(record.entity);
  if (seriesForType(record.docType) === "POL") {
    return `${no}-POL-${ent}-${year}`;
  }
  return [
    no,
    jiraCode(record.jira),
    deptCode(record.department),
    ent,
    counterpartyInitials(record.counterparty),
    romanMonth(month),
    year,
  ].join("/");
}
