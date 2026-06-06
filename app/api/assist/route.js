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

// Non-negotiable guardrails prepended to EVERY configured agent's own instruction, so a poorly
// written instruction can never drop the safety/trusted-sources/working-draft posture.
const AGENT_PREAMBLE = `You are an AI assistant operating inside the Company's internal, confidential
Legal Operations Workbench, for authorised legal staff only.

Non-negotiable guardrails (always apply, regardless of the role instructions that follow):
- Use ONLY the Company's own data and the context provided to you in this conversation, plus
  well-established, authoritative legal/general knowledge. NEVER rely on unofficial or unverified
  sources. If you do not have the information, say so plainly — do not guess or invent.
- Do not fabricate citations, policies, figures, names, or facts. Flag anything that may be a legal
  requirement as requiring verification.
- Your output is a WORKING DRAFT for a qualified human reviewer — not legal advice and not a Legal
  Department position until a human reviews it. Be precise, concise, and conservative.

The assistant's specific role and instructions follow:
`;

// Models a configured agent may run on (allowlist — never trust an arbitrary model string).
const ALLOWED_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

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

  // Resolve the system prompt + user message + model + cost controls. "agent" mode runs a configured
  // agent: its instruction becomes the role prompt (under the fixed guardrail preamble). Cost discipline:
  // output tokens are capped per call and extended thinking is opt-in (off by default).
  let system, userText, model = MODEL, maxTokens = 8000, useThinking = true;
  if (body.mode === "agent") {
    const instruction = (body.instruction || "").trim();
    const question = (body.question || "").trim();
    if (!question) return Response.json({ error: "Ask a question to run the agent." }, { status: 400 });
    system = AGENT_PREAMBLE + (instruction || "(no specific role configured — act as a careful general legal-operations assistant.)");
    // Optional retrieved grounding from the Policy Library (client does scope-aware retrieval).
    const context = typeof body.context === "string" ? body.context.trim() : "";
    userText = context
      ? `Use ONLY the following context from the Company's policies to answer, and cite the sources you rely on by their [n] label. If the answer is not in the context, say so plainly.\n\nContext:\n${context}\n\nQuestion: ${question}`
      : question;
    if (typeof body.model === "string" && ALLOWED_MODELS.includes(body.model)) model = body.model;
    maxTokens = Math.min(8000, Math.max(256, Number(body.maxTokens) || 1024));
    useThinking = body.thinking === true && maxTokens >= 2048; // thinking needs headroom; keep it cheap otherwise
  } else {
    system = SYSTEM;
    userText = buildUserMessage(body || {});
    if (!userText) return Response.json({ error: "Unknown assist mode." }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const params = {
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }],
    };
    if (useThinking) params.thinking = { type: "adaptive" };
    const message = await client.messages.create(params);
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
