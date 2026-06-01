// app/api/assist/route.js — AI drafting/review assistant for the Contracting Engine.
// PRIVILEGED: this route sends clause text to Anthropic's Claude API (recorded as PRD OI6).
// The ANTHROPIC_API_KEY lives only on the server (never NEXT_PUBLIC, never in the browser
// bundle). Callers must present a valid Firebase ID token for this project — the same bar
// as /api/seed. Output is an AI working draft, not a Legal Department position until a
// human reviews and adopts it (the app's standing disclaimer).
import Anthropic from "@anthropic-ai/sdk";
import { verifyRequest } from "../../../lib/verifyIdToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// Stable house-style guidance — cached as a prompt prefix so repeat calls are cheap.
const SYSTEM = `You are a senior contracts counsel assisting the Legal Department of "the Company"
inside an internal Clause Library Workbench. You help draft, improve, review, and explain
contract clauses that sit on top of the Company's Contracting Playbook (v3.1).

House style (follow exactly when producing operative clause text):
- Defined terms: "the Company", "the Counterparty", "this Agreement", "the Services".
- UK / Commonwealth spelling (organisation, prioritise, licence as noun).
- Number sub-clauses (a), (b), (c) and sub-paragraphs (i), (ii), (iii).
- Cross-reference other clauses as: Clause [●] (Title).
- Produce clean, operative, paste-ready text. Do NOT include commentary, headings, or
  markdown inside operative clause text — return the clause body only.
- Keep guidance (rationale, risks, negotiation levers) strictly separate from operative text,
  under a clearly labelled "Notes for Counsel" section when guidance is requested.
- Reflect the Playbook's four-tier posture (Baseline / Acceptable Fallback / Escalation
  Required / Prohibited) where relevant. Never assert that something is a legal requirement
  unless it plainly is, and flag any citation as requiring verification.

Critical: your output is a WORKING DRAFT for a qualified human reviewer (the Head of Legal),
not legal advice and not a final position. Be precise, conservative, and flag uncertainty.`;

function buildUserMessage(body) {
  const { mode, instruction, clauseTitle, clauseText, counterpartyText, tier, category } = body;
  const ctx = [
    clauseTitle && `Clause: ${clauseTitle}`,
    category && `Category: ${category}`,
    tier && `Target tier: ${tier}`,
  ].filter(Boolean).join("\n");

  switch (mode) {
    case "draft":
      return `Task: DRAFT a new clause.\n${ctx}\n\nInstruction from counsel:\n${instruction}\n\n` +
        `Return only the operative clause text in house style. After the clause, add a short ` +
        `"Notes for Counsel" section (2–4 bullet points) covering rationale and key risks.`;
    case "improve":
      return `Task: IMPROVE / strengthen the existing clause below (or draft an additional fallback if asked).\n${ctx}\n\n` +
        `Existing clause text:\n"""\n${clauseText || "(none provided)"}\n"""\n\n` +
        `Instruction from counsel:\n${instruction || "Improve clarity, balance and enforceability while preserving intent."}\n\n` +
        `Return only the revised operative clause text in house style, then a short ` +
        `"Notes for Counsel" section explaining what changed and why.`;
    case "review":
      return `Task: REVIEW a counterparty's proposed clause against the Company's position. Do NOT redraft unless asked.\n${ctx}\n\n` +
        (clauseText ? `Company's current position:\n"""\n${clauseText}\n"""\n\n` : "") +
        `Counterparty's proposed clause:\n"""\n${counterpartyText || "(none provided)"}\n"""\n\n` +
        `Identify the risks and deviations from a Company-favourable position as a bulleted list, ` +
        `each tagged with a severity (High / Medium / Low) and a suggested negotiation ask. Be specific.`;
    case "explain":
      return `Task: EXPLAIN this clause in plain language for the team.\n${ctx}\n\n` +
        `Clause text:\n"""\n${clauseText || "(none provided)"}\n"""\n\n` +
        `Cover, briefly: (1) what it does, (2) why it matters to the Company, (3) the main risks, ` +
        `and (4) the key negotiation levers. Use short paragraphs or bullets. No operative redraft.`;
    default:
      return null;
  }
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI assist is not configured. Set ANTHROPIC_API_KEY in the deployment environment." },
      { status: 503 }
    );
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { error, status } = await verifyRequest(req, projectId);
  if (error) return Response.json({ error }, { status });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const userText = buildUserMessage(body || {});
  if (!userText) return Response.json({ error: "Unknown assist mode." }, { status: 400 });

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }],
    });
    const output = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return Response.json({ output, mode: body.mode });
  } catch (e) {
    // Typed SDK errors carry a numeric .status (429 rate limit, 401 auth, etc.)
    console.error("assist failed", e?.status, e?.message);
    const rateLimited = e?.status === 429;
    return Response.json(
      { error: rateLimited ? "AI assist is rate-limited — try again shortly." : "AI assist failed — see server logs." },
      { status: rateLimited ? 429 : 502 }
    );
  }
}
