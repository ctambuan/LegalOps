// lib/pdfPlaybook.js — render the current clause bank (all clauses, current text) to a PDF,
// client-side, with jsPDF. Used by the "Save Playbook PDF to Drive" action so the live,
// calibrated Playbook can be archived to the Drive folder. Returns { blob, filename }.
import { jsPDF } from "jspdf";

const VARIANT_FIELDS = [
  { key: "baseline", label: "Baseline" },
  { key: "buyside", label: "Buy-Side" },
  { key: "sellside", label: "Sell-Side" },
  { key: "fallback", label: "Acceptable Fallback" },
];

// A clause's drafting templates: its own labelled variants when defined, else the standard
// positions that have text. Kept in step with the app's clauseTemplates() logic.
function templatesFor(c) {
  if (Array.isArray(c.variants) && c.variants.length) {
    return c.variants.map((v) => ({ label: v.label || "Variant", text: v.text || "" }));
  }
  return VARIANT_FIELDS.filter((f) => (c[f.key] || "").trim()).map((f) => ({ label: f.label, text: c[f.key] }));
}

function lines(s) {
  return (s || "").split("\n").map((x) => x.trim()).filter(Boolean);
}

export function generatePlaybookPdf(clauses, { companyLabel = "[Company]", version = "" } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 48;                       // margin
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const CW = W - M * 2;               // content width
  let y = M;

  const ensure = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const para = (text, { size = 10, font = "times", style = "normal", gap = 4, color = [26, 23, 20], indent = 0 } = {}) => {
    doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color);
    const wrapped = doc.splitTextToSize(String(text), CW - indent);
    for (const ln of wrapped) { ensure(size + 2); doc.text(ln, M + indent, y); y += size + 2; }
    y += gap;
  };

  // Cover header
  doc.setFont("times", "bold"); doc.setFontSize(18); doc.setTextColor(26, 23, 20);
  doc.text(`${companyLabel} — Contracting Playbook`, M, y); y += 24;
  doc.setFont("times", "normal"); doc.setFontSize(11); doc.setTextColor(122, 114, 104);
  doc.text(`Clause Library${version ? " · " + version : ""} · Generated ${new Date().toLocaleString()}`, M, y); y += 16;
  doc.text("Confidential & Legally Privileged — internal use only.", M, y); y += 10;
  doc.setDrawColor(180, 170, 150); doc.line(M, y, W - M, y); y += 16;

  const sorted = [...clauses].sort((a, b) => (a.id || 0) - (b.id || 0));
  for (const c of sorted) {
    ensure(40);
    para(`CL-${String(c.id).padStart(2, "0")}  ·  ${(c.cat || "").toUpperCase()}`, { size: 8, font: "courier", style: "normal", color: [122, 114, 104], gap: 2 });
    para(c.title || "", { size: 13, style: "bold", gap: 3 });
    if (c.purpose) para(c.purpose, { size: 9.5, style: "italic", color: [90, 84, 76] });

    for (const t of templatesFor(c)) {
      para(t.label, { size: 10, style: "bold", color: [107, 34, 48], gap: 2 });
      para(t.text, { size: 10, gap: 6 });
    }
    const rf = lines(c.redflags);
    if (rf.length) {
      para("Red flags — do not accept without documented approval", { size: 9, style: "bold", color: [181, 101, 29], gap: 2 });
      rf.forEach((r) => para(`•  ${r}`, { size: 9, color: [181, 101, 29], indent: 10, gap: 2 }));
      y += 2;
    }
    const notes = [...lines(c.counselNotes), ...lines(c.usageNotes)];
    if (notes.length) {
      para("Notes for Counsel", { size: 9, style: "bold", color: [122, 114, 104], gap: 2 });
      notes.forEach((n) => para(`•  ${n}`, { size: 9, color: [122, 114, 104], indent: 10, gap: 2 }));
    }
    ensure(12); doc.setDrawColor(216, 208, 192); doc.line(M, y, W - M, y); y += 14;
  }

  const slug = (companyLabel.replace(/[^A-Za-z0-9]+/g, "") || "Company");
  const filename = `${slug}_Contracting_Playbook_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob: doc.output("blob"), filename };
}
