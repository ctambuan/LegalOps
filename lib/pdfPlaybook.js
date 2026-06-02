// lib/pdfPlaybook.js — render the current clause bank to a cleanly-formatted PDF (client-side, jsPDF).
// Used by "Save Playbook PDF to Drive". Returns { blob, filename }.
//
// FORMATTING DISCIPLINE (do not regress):
// jsPDF's built-in fonts (Times/Helvetica/Courier) only render WinAnsi; Unicode typography in the
// legal text (curly quotes, en/em dashes, bullets, ellipsis, NBSP, section sign, ligatures) renders
// as garbage. Every string MUST pass through clean() before it is drawn. We also keep clause headings
// with their first lines (no orphans), wrap to the content width, and number every page.
import { jsPDF } from "jspdf";

// Map Unicode typography -> plain characters the standard fonts render correctly.
// \u escapes throughout (literal smart-punctuation/invisibles in source are easy to get wrong).
const MAP = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",   // single quotes
  "“": '"', "”": '"', "„": '"', "‟": '"',   // double quotes
  "–": "-", "—": "-", "―": "-", "−": "-",   // en/em dashes, minus
  "…": "...",                                                // ellipsis
  "•": "-", "‣": "-", "‧": "-", "●": "-", "·": "-", // bullets/middots
  " ": " ", " ": " ", " ": " ", " ": " ", "​": "", "﻿": "", // spaces
  "§": "Section ", "¶": "Para ", "™": "(TM)", "®": "(R)", "©": "(C)",
  "½": "1/2", "¼": "1/4", "¾": "3/4",
  "ﬁ": "fi", "ﬂ": "fl", "⁄": "/",
};
const MAP_RE = new RegExp("[" + Object.keys(MAP).join("") + "]", "g");

function clean(s) {
  if (s == null) return "";
  let out = String(s).replace(MAP_RE, (ch) => MAP[ch] ?? ch).replace(/\t/g, "  ");
  // Keep newline, printable ASCII, and the Latin-1 supplement (accented letters jsPDF renders
  // via WinAnsi). Drop anything else so nothing prints as a corrupt glyph.
  out = out.replace(/[^\n\x20-\x7E¡-ÿ]/g, "");
  return out.replace(/ {3,}/g, "  ").replace(/ +\n/g, "\n"); // tidy stray runs / trailing spaces
}

const VARIANT_FIELDS = [
  { key: "baseline", label: "Baseline" },
  { key: "buyside", label: "Buy-Side" },
  { key: "sellside", label: "Sell-Side" },
  { key: "fallback", label: "Acceptable Fallback" },
];

function templatesFor(c) {
  if (Array.isArray(c.variants) && c.variants.length) {
    return c.variants.map((v) => ({ label: v.label || "Variant", text: v.text || "" }));
  }
  return VARIANT_FIELDS.filter((f) => (c[f.key] || "").trim()).map((f) => ({ label: f.label, text: c[f.key] }));
}
const splitLines = (s) => clean(s).split("\n").map((x) => x.trim()).filter(Boolean);

export function generatePlaybookPdf(clauses, { companyLabel = "[Company]", version = "" } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const M = 56;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const CW = W - M * 2;
  const BOTTOM = H - 56;            // leave room for the footer
  const FONT = "times";
  let y = M;

  const space = (need) => { if (y + need > BOTTOM) { doc.addPage(); y = M; } };

  // Draw a wrapped paragraph. lineH derives from size for consistent leading.
  const para = (text, { size = 10.5, style = "normal", color = [26, 23, 20], gap = 5, indent = 0, keepWith = 0 } = {}) => {
    const t = clean(text);
    if (!t) return;
    doc.setFont(FONT, style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
    const lineH = size * 1.32;
    const wrapped = doc.splitTextToSize(t, CW - indent);
    // Orphan control: keep this paragraph's first line(s) with what follows (headings).
    space(lineH * (1 + Math.min(keepWith, wrapped.length)));
    for (const ln of wrapped) {
      space(lineH);
      doc.text(ln, M + indent, y);
      y += lineH;
    }
    y += gap;
  };

  const rule = (color = [216, 208, 192], w = 0.7) => {
    space(10); doc.setDrawColor(color[0], color[1], color[2]); doc.setLineWidth(w);
    doc.line(M, y, W - M, y); y += 12;
  };

  // ---- Cover header ----
  doc.setFont(FONT, "bold"); doc.setFontSize(19); doc.setTextColor(26, 23, 20);
  doc.text(clean(`${companyLabel} - Contracting Playbook`), M, y); y += 24;
  doc.setFont(FONT, "normal"); doc.setFontSize(10.5); doc.setTextColor(122, 114, 104);
  doc.text(clean(`Clause Library${version ? "  |  " + version : ""}  |  Generated ${new Date().toLocaleDateString()}`), M, y); y += 15;
  doc.text("Confidential & Legally Privileged - internal use only.", M, y); y += 6;
  rule([107, 34, 48], 1.2); y += 4;

  // ---- Clauses ----
  const sorted = [...clauses].sort((a, b) => (a.id || 0) - (b.id || 0));
  for (const c of sorted) {
    // Keep the clause header block together (eyebrow + title + first body lines).
    space(64);
    para(`CL-${String(c.id).padStart(2, "0")}   |   ${(c.cat || "").toUpperCase()}`,
      { size: 8, style: "bold", color: [122, 114, 104], gap: 3 });
    para(c.title || "", { size: 13.5, style: "bold", gap: 4, keepWith: 1 });
    if (c.purpose) para(c.purpose, { size: 9.5, style: "italic", color: [90, 84, 76], gap: 7 });

    for (const t of templatesFor(c)) {
      para(t.label, { size: 10.5, style: "bold", color: [107, 34, 48], gap: 3, keepWith: 2 });
      para(t.text, { size: 10.5, gap: 8 });
    }

    const rf = splitLines(c.redflags);
    if (rf.length) {
      para("Red flags - do not accept without documented approval", { size: 9, style: "bold", color: [181, 101, 29], gap: 3, keepWith: 1 });
      rf.forEach((r) => para("-  " + r, { size: 9, color: [181, 101, 29], indent: 12, gap: 3 }));
      y += 2;
    }
    const notes = [...splitLines(c.counselNotes), ...splitLines(c.usageNotes)];
    if (notes.length) {
      para("Notes for Counsel", { size: 9, style: "bold", color: [122, 114, 104], gap: 3, keepWith: 1 });
      notes.forEach((n) => para("-  " + n, { size: 9, color: [122, 114, 104], indent: 12, gap: 3 }));
    }
    rule();
  }

  // ---- Footer (page x of n) on every page ----
  const total = doc.getNumberOfPages();
  const footL = clean(`${companyLabel} Contracting Playbook${version ? " - " + version : ""}`);
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont(FONT, "normal"); doc.setFontSize(8); doc.setTextColor(150, 142, 132);
    doc.text(footL, M, H - 28);
    doc.text(`Page ${p} of ${total}`, W - M, H - 28, { align: "right" });
  }

  const slug = (companyLabel.replace(/[^A-Za-z0-9]+/g, "") || "Company");
  const filename = `${slug}_Contracting_Playbook_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob: doc.output("blob"), filename };
}
