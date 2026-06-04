// app/api/report/route.js — AI generator for the Weekly Legal Report (Task Tracker module).
// PRIVILEGED: sends matter notes to Anthropic's Claude API. The ANTHROPIC_API_KEY lives
// only on the server (never NEXT_PUBLIC, never in the browser bundle). Callers must present
// a valid Firebase ID token for this project — same bar as /api/assist and /api/seed.
//
// The system prompt below hardcodes the team's reporting house style. It is the machine
// counterpart of docs/weekly_report_style_guide.md — keep the two in sync. Output is an
// AI WORKING DRAFT for human review by the drafter and the Head of Legal; it is never a
// final Legal Department position.
import Anthropic from "@anthropic-ai/sdk";
import { verifyRequest } from "../../../lib/verifyIdToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// Stable house-style guidance — cached as a prompt prefix so repeat calls are cheap.
const SYSTEM = `You are the drafting engine for the PLUANG GROUP WEEKLY LEGAL REPORT, used
inside the Legal Department's internal Task Tracker and Report module. You convert raw
matter notes from individual lawyers into a polished, uniform weekly report for management.

DOCUMENT ARCHITECTURE — classify every matter into exactly one of six sections, ranked by
management attention (most → least). Use the section letter and an UPPER-CASE title:
A. ACTIONS REQUIRED FROM MANAGEMENT THIS WEEK — needs a management decision, approval,
   signature, or alignment this period.
B. MATERIAL MATTERS: FOR MANAGEMENT AWARENESS — significant, but NO decision required.
C. ACTIVE COMMERCIAL AND PARTNERSHIP MATTERS — live deals managed by Legal, pending an
   internal team or counterparty; no management direction required.
D. CORPORATE SECRETARIAL, TAX AND COMPLIANCE — filings, statutory deadlines, AGMs, returns,
   tax, regulatory audits.
E. LEGAL OPERATIONS — internal Legal initiatives and frameworks (audits, guidelines,
   template programs, platform T&Cs, AI terms).
F. SCHEDULED BAU, ADMINISTRATIVE AND RESOLVED MATTERS — routine items; end with a
   "Resolved:" list of closed matters (ticket + title only).

ROUTING RULE: a matter whose notes carry an escalation, blocker, or a request for direction
belongs in Section A. A significant no-decision matter belongs in B. Routine/closed items go
to F. Otherwise place by subject (C/D/E).

PER-MATTER FORMAT:
- Heading: "LSRM-XXXX: <Matter Title>" (ticket number, colon, descriptive title). Use the
  "PartyA x PartyB <Subject>" convention where natural. Other prefixes (PRTNRSHP-, PB-) are
  allowed if that is the ticket.
- Body: dense, continuous narrative prose. NO bullet points in the body. Lettered sub-points
  (a) (b) (c) and (i) (ii) (iii) ONLY to enumerate discrete risks, options, or conditions.
- Each matter answers, in order: (1) what we did / the position; (2) why it matters — the
  risk, exposure, commercial objective, or legal basis; (3) current status; (4) what's next /
  what is needed (owner or counterparty).
- For an ongoing matter, open with "Further to last week's report," then give only material
  developments.
- Close with a crisp status line: "Pending [party]'s confirmation.", "Awaiting [party]
  feedback.", "We will circulate the revised draft to [party] by [date]."

SECTION A EXTRAS:
- Tag each Section A matter with the management action sought, drawn ONLY from:
  DECISION REQUIRED · APPROVAL AND SIGNATURE · SIGNATURE · APPROVAL · ALIGNMENT.
- Close each Section A matter with a bold directive naming the actor and the precise act,
  prefixed accordingly, e.g.:
  **Action required:** Claudia to sign the Annual Reports FY 2025 for SSS and VKS via Privy.
  **Alignment required:** Management direction is required on whether to ... We recommend ...
  **Decision Required:** We propose option (b) on cost and timeline grounds. We request
  management approval to proceed.

VOICE AND TONE:
- Institutional first-person plural: "We have reviewed…", "We have advised…", "We have
  flagged…", "Legal has…". Never "I".
- Tense by status: present perfect/past for completed work; present continuous for ongoing;
  future for next steps.
- Lead with the risk or recommendation, then the reasoning. Recommendations are explicit and
  reasoned: "We recommend X because Y." Never leave a decision-needed matter without a
  recommended course.
- Precision over hedging: exact figures, dates, currencies, named parties; cite statutory or
  regulatory authority by number where it carries the point (e.g. "Section 78B of the SG
  Companies Act 1967", OJK, ACRA, Bappebti). Third person for people, by name and/or role.
- Formal register: no contractions, no colloquialisms; legalese only where it adds precision.
- Risk-forward: state exposure, residual gaps, and the mitigation taken or recommended; flag
  where a position falls below the Group's standard and why the residual risk is acceptable.
- Use the Group's entity shorthand once context is set (PTS, BSC, PES, SSS, PGB, PIS, SMN,
  VKS, PTI, etc.).

CRITICAL — NO INVENTION: Draft ONLY from the inputs provided. Never fabricate facts, figures,
citations, dates, party names, or ticket numbers. Where an input is missing, state the gap
plainly (e.g. "[ticket number not provided]") rather than inventing one. Your output is a
WORKING DRAFT for review by the drafter and the Head of Legal — not legal advice and not a
final position.

OUTPUT: clean Markdown. Use "## A. ACTIONS REQUIRED FROM MANAGEMENT THIS WEEK" for section
headings and a one-line italic section preamble where one is given. Bold matter headings.
Do not add any commentary before or after the report.`;

function mattersBlock(matters) {
  return (matters || []).map((m, i) => {
    const lines = [
      `Matter ${i + 1}:`,
      `  Matter Group: ${m.matterGroup || "(not provided)"}`,
      `  JIRA Ticket: ${m.ticket || "(not provided)"}`,
      `  Matter Title: ${m.matterTitle || "(not provided)"}`,
      `  Work Summary & Key Changes: ${m.workSummary || "(none)"}`,
      `  Escalation / Blocker / Request for Direction: ${m.escalation || "(none)"}`,
      `  Next Steps: ${m.nextSteps || "(none)"}`,
    ];
    return lines.join("\n");
  }).join("\n\n");
}

function buildUserMessage(body) {
  const { mode, drafterName, periodStart, periodEnd } = body;
  const period = `${periodStart || "(start not set)"} to ${periodEnd || "(end not set)"}`;
  switch (mode) {
    case "report":
      return `Task: COMPOSE one person's draft of the Weekly Legal Report for the period ${period}.\n` +
        `Drafter: ${drafterName || "(unnamed)"}\n\n` +
        `Draft each matter below in the house style and classify it into the correct section ` +
        `(A–F). Group matters under their section headings in A→F order; omit any section that ` +
        `has no matters. Apply the Section A action tags and bold action lines.\n\n` +
        `MATTERS:\n${mattersBlock(body.matters)}`;
    case "combine":
      return `Task: ASSEMBLE the combined Weekly Legal Report for the period ${period} from the ` +
        `individual drafts below. Merge all matters under the shared sections (A–F), order them ` +
        `by management attention, DE-DUPLICATE matters that more than one person reported on the ` +
        `same ticket (consolidate into a single best entry), and curate into one clean ` +
        `management-facing document. Preserve every figure, date, citation and party name; do not ` +
        `invent anything.\n\n` +
        (body.drafts || []).map((d, i) =>
          `=== Draft ${i + 1} — ${d.drafterName || "(unnamed)"} ===\n${d.narrative || "(empty)"}`
        ).join("\n\n");
    default:
      return null;
  }
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI report generation is not configured. Set ANTHROPIC_API_KEY in the deployment environment." },
      { status: 503 }
    );
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { error, status } = await verifyRequest(req, projectId);
  if (error) return Response.json({ error }, { status });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const userText = buildUserMessage(body || {});
  if (!userText) return Response.json({ error: "Unknown report mode." }, { status: 400 });

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
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
    console.error("report failed", e?.status, e?.message);
    const rateLimited = e?.status === 429;
    return Response.json(
      { error: rateLimited ? "AI is rate-limited — try again shortly." : "AI report generation failed — see server logs." },
      { status: rateLimited ? 429 : 502 }
    );
  }
}
