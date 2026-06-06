// lib/structuredContext.js — builds a compact, scope-aware text context from the dashboard's
// structured data (entities, directors, lines of business, approval matrix, authorised signers) so
// agents can answer from live records. Client-side reads via existing rules; cost-light (a handful of
// Firestore reads, capped context size) — no AI/embedding/infra cost. Company-scoped roles see only
// their companies' entity data; the approval matrix is group-wide.
"use client";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getFb } from "./firebase";

const DB = () => getFb().db;
const CAP = 12000; // ~3k tokens ceiling on injected context

const TYPE = { holding: "Holding", controlled: "Controlled Subsidiary", non_controlled: "Non-Controlled Subsidiary" };

async function loadEntities({ role, companies }) {
  const snap = await getDocs(collection(DB(), "cfg_entities"));
  let ents = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.status !== "archived");
  const all = companies === "all" || ["gc", "regional", "reviewer"].includes(role);
  if (!all && Array.isArray(companies)) ents = ents.filter((e) => companies.includes(e.code));
  return ents;
}
async function sub(entityId, name) {
  try { return (await getDocs(collection(DB(), "cfg_entities", entityId, name))).docs.map((d) => d.data()); }
  catch { return []; }
}

// `source`: "secretarial" | "compliance" | "all". `scope`: { role, companies }.
export async function buildStructuredContext(source, scope) {
  try {
    if (source === "secretarial") {
      const ents = await loadEntities(scope);
      const out = [];
      for (const e of ents) {
        const [directors, lob] = [await sub(e.id, "directors"), await sub(e.id, "lob")];
        out.push(
          `ENTITY: ${e.name} (${e.code}) — ${TYPE[e.entityType] || "unclassified"}; jurisdiction: ${e.jurisdiction || "—"}; registration: ${(e.registrationType || "")} ${(e.registrationNo || "")}`.trim()
          + (directors.length ? `\n  Directors: ${directors.map((d) => `${d.name}${d.title ? ` (${d.title})` : ""}`).join("; ")}` : "")
          + (lob.length ? `\n  Lines of business: ${lob.map((l) => `${l.code || ""} ${l.description || l.licenseName || ""}`.trim()).join("; ")}` : "")
        );
      }
      return out.join("\n\n").slice(0, CAP);
    }

    if (source === "compliance") {
      const ents = await loadEntities(scope);
      const out = [];
      for (const e of ents) {
        const lob = await sub(e.id, "lob");
        if (lob.length) out.push(`ENTITY: ${e.name} (${e.code})\n` + lob.map((l) => `  - ${l.licenseName || l.description || l.code || "licence"}: authority ${l.issuingAuthority || "—"}, validity ${l.validityPeriod || "—"}`).join("\n"));
      }
      return (out.join("\n\n") || "No licence/compliance records are recorded for the entities in scope.").slice(0, CAP);
    }

    if (source === "all") {
      const ents = await loadEntities(scope);
      const out = [];
      out.push("ENTITIES: " + (ents.map((e) => `${e.name} (${e.code}, ${TYPE[e.entityType] || "unclassified"}, ${e.jurisdiction || "—"})`).join("; ") || "none"));
      const appr = (await getDocs(collection(DB(), "cfg_approvals"))).docs.map((d) => d.data());
      if (appr.length) {
        let lo = 25000, hi = 100000;
        try { const b = await getDoc(doc(DB(), "cfg_thresholds", "bands")); if (b.exists()) { lo = b.data().low ?? lo; hi = b.data().high ?? hi; } } catch { /* defaults */ }
        out.push(`\nAPPROVAL THRESHOLDS (USD/annum): low ≤ ${lo}; mid ${lo}–${hi}; high ≥ ${hi} (or unbudgeted).`);
        out.push("BUSINESS APPROVERS by department [admin | low | mid | high]:");
        appr.forEach((a) => out.push(`  - ${a.department}: ${a.admin || "—"} | ${a.low || "—"} | ${a.mid || "—"} | ${a.high || "—"}`));
      }
      const signerLines = [];
      for (const e of ents) {
        const signers = await sub(e.id, "signers");
        if (signers.length) signerLines.push(`  ${e.name} (${e.code}): ${signers.map((s) => `${s.signerName}${s.title ? ` (${s.title})` : ""}${s.maxThresholdUsd ? ` up to USD ${s.maxThresholdUsd}` : ""}`).join("; ")}`);
      }
      if (signerLines.length) out.push("\nAUTHORISED SIGNERS by entity:\n" + signerLines.join("\n"));
      return out.join("\n").slice(0, CAP);
    }
  } catch (e) { console.error("structured context failed", e); }
  return "";
}
