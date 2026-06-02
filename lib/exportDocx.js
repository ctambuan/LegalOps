// lib/exportDocx.js — generate the adopted-addenda master as a formatted .docx (client side).
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
} from "docx";
import { saveAs } from "file-saver";
import { TIERS, CTYPES } from "./constants";
import { COMPANY_LABEL, PLAYBOOK_VERSION } from "./config";

function tsToDate(ts) {
  try { return ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null); } catch { return null; }
}

export async function exportMaster(adopted, { download = true } = {}) {
  const children = [];
  const H = (text, size, color) =>
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size, font: "Georgia", color })] });

  children.push(H(COMPANY_LABEL.toUpperCase(), 28));
  children.push(H(`CLAUSE LIBRARY — ADOPTED ADDENDA TO CONTRACT REVIEW PLAYBOOK ${PLAYBOOK_VERSION}`, 22));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: `Confidential & Legally Privileged · Generated ${new Date().toLocaleString()}`,
      italics: true, size: 18, font: "Georgia", color: "6b2230" })] }));
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1a1714" } },
    spacing: { before: 200 }, children: [] }));

  adopted.forEach((m, i) => {
    children.push(new Paragraph({ spacing: { before: 280, after: 80 },
      children: [new TextRun({ text: `${i + 1}.  ${m.title}`, bold: true, size: 24, font: "Georgia" })] }));
    children.push(new Paragraph({ spacing: { after: 60 }, children: [
      new TextRun({ text: "Tier: ", bold: true, size: 18, font: "Georgia" }),
      new TextRun({ text: (TIERS[m.tier]?.l || m.tier) + "    ", size: 18, font: "Georgia" }),
      new TextRun({ text: "Classification: ", bold: true, size: 18, font: "Georgia" }),
      new TextRun({ text: (m.classification || "") + "    ", size: 18, font: "Georgia" }),
      new TextRun({ text: "Jurisdiction: ", bold: true, size: 18, font: "Georgia" }),
      new TextRun({ text: m.jurisdiction || "", size: 18, font: "Georgia" }),
    ] }));
    const adoptedAt = tsToDate(m.adoptedAt);
    children.push(new Paragraph({ spacing: { after: 40 }, children: [
      new TextRun({ text: `Type: ${CTYPES[m.type] || m.type} · Proposed by ${m.authorName || m.authorEmail} · `
        + `Adopted ${adoptedAt ? adoptedAt.toLocaleDateString() : "—"}${m.playbookVersion ? " under Playbook " + m.playbookVersion : ""}${m.baseRef ? " · Ref " + m.baseRef : ""}`,
        italics: true, size: 16, font: "Georgia", color: "7a7268" })] }));
    children.push(new Paragraph({ spacing: { after: 120 },
      children: [new TextRun({ text: m.text || "", size: 21, font: "Georgia" })] }));
    if (m.rationale) children.push(new Paragraph({ children: [
      new TextRun({ text: "Rationale: ", bold: true, size: 17, font: "Georgia" }),
      new TextRun({ text: m.rationale, italics: true, size: 17, font: "Georgia" })] }));
    if (m.redflag) children.push(new Paragraph({ spacing: { after: 80 }, children: [
      new TextRun({ text: "Red flag: ", bold: true, size: 17, font: "Georgia", color: "b5651d" }),
      new TextRun({ text: m.redflag, size: 17, font: "Georgia", color: "b5651d" })] }));
    if (m.reviewNote) children.push(new Paragraph({ children: [
      new TextRun({ text: "Head of Legal note: ", bold: true, size: 17, font: "Georgia" }),
      new TextRun({ text: m.reviewNote, italics: true, size: 17, font: "Georgia" })] }));
    children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "d8d0c0" } },
      spacing: { before: 120 }, children: [] }));
  });

  children.push(new Paragraph({ spacing: { before: 240 }, children: [
    new TextRun({ text: "These adopted addenda are working product reviewed and adopted by the Head of Legal. "
      + "They remain subject to deal-specific verification and do not constitute legal advice. All regulatory "
      + "citations require verification against current law before reliance.",
      italics: true, size: 16, font: "Georgia", color: "7a7268" })] }));

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const slug = (COMPANY_LABEL.replace(/[^A-Za-z0-9]+/g, "") || "Company");
  const filename = `${slug}_Clause_Library_Master_${new Date().toISOString().slice(0, 10)}.docx`;
  if (download) saveAs(blob, filename);
  return { blob, filename };
}
