// lib/policy.js — Policy Library helpers: chunking (ingest) + retrieval (client-side, scope-aware).
// Cost discipline (CLAUDE.md #4): retrieval is lightweight LEXICAL ranking over stored chunks — no
// embedding API, no vector index, no extra key. Structured so semantic embeddings can drop in later.
"use client";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getFb } from "./firebase";

const DB = () => getFb().db;

// Split text into ~maxLen-char chunks on paragraph boundaries (hard-splitting overlong paragraphs).
export function chunkText(text, maxLen = 900) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  for (const para of paras) {
    if (buf && (buf.length + 2 + para.length) > maxLen) { chunks.push(buf); buf = ""; }
    buf = buf ? `${buf}\n\n${para}` : para;
    while (buf.length > maxLen * 1.5) { chunks.push(buf.slice(0, maxLen)); buf = buf.slice(maxLen); }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

const STOP = new Set("the a an of to in on for and or is are be as by with at from this that it its our we you your will shall may any such".split(" "));
const toks = (s) => (String(s || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));

// Load the policies this user may see (group + their companies), gather chunks, rank by lexical
// overlap with the question, and return a citeable context block + the source list. Returns empty
// when nothing relevant — the agent is instructed to say so rather than guess.
export async function retrievePolicyContext({ role, companies }, queryText, k = 6) {
  const db = DB();
  const col = collection(db, "cfg_policies");
  const seesAll = companies === "all" || ["gc", "regional", "reviewer"].includes(role);
  let policies = [];
  try {
    if (seesAll) {
      const snap = await getDocs(col);
      policies = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      const grp = await getDocs(query(col, where("scope", "==", "group")));
      policies = grp.docs.map((d) => ({ id: d.id, ...d.data() }));
      const comps = Array.isArray(companies) ? companies.slice(0, 30) : [];
      if (comps.length) {
        const own = await getDocs(query(col, where("company", "in", comps)));
        policies = policies.concat(own.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    }
  } catch (e) { console.error("policy query failed", e); return { context: "", sources: [] }; }

  policies = policies.filter((p) => p.status !== "archived");
  let chunks = [];
  for (const p of policies) {
    try {
      const cs = await getDocs(collection(db, "cfg_policies", p.id, "chunks"));
      cs.forEach((c) => chunks.push({ policyId: p.id, title: p.title, ...c.data() }));
    } catch { /* skip unreadable */ }
  }
  if (!chunks.length) return { context: "", sources: [] };

  const qt = toks(queryText);
  const scored = chunks
    .map((c) => {
      const set = new Set(toks(c.text));
      let score = 0;
      for (const w of qt) if (set.has(w)) score++;
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  if (!scored.length) return { context: "", sources: [] };
  const context = scored.map((c, i) => `[${i + 1}] ${c.title}: ${c.text}`).join("\n\n");
  const sources = scored.map((c, i) => ({ n: i + 1, title: c.title }));
  return { context, sources };
}
