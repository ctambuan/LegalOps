# Weekly Legal Report — House Style Guide

> **Purpose.** This is the canonical drafting discipline for the Pluang Group Weekly
> Legal Report. It exists to make every report uniform in structure, depth, and tone
> regardless of which team member drafts it, and it is the single source of truth for
> the AI report generator in the **Task Tracker and Report** module. The AI must adopt
> this style verbatim when summarising matters or composing a weekly report. Output is
> always a **working draft for human review**, never a final position.
>
> Derived from the combined Weekly Legal Reports for weeks ending 13 May, 26 May, and
> 4 June 2026.

---

## 1. Document architecture

**Production model (two stages).** Each team member first generates their **own draft**
of the matters they handled during the period, with each matter classified into the
sections below. The Head of Legal then **assembles and curates** those per-person drafts
into a **single combined report for the period** — the canonical document that goes to
management. The combined report, not the individual drafts, is what the sample templates
represent.

Within both the per-person draft and the combined report, matters are ranked by
*management attention required*, from most to least, into six fixed sections:

| # | Section | What belongs here |
|---|---------|-------------------|
| A | **Actions Required From Management This Week** | Matters that need a management decision, approval, signature, or alignment **this period**. Highest priority. |
| B | **Material Matters: For Management Awareness** | Significant matters where **no decision is required**, reported for visibility (material risk, exposure, or strategic development). |
| C | **Active Commercial and Partnership Matters** | Live commercial/partnership contracts being managed by Legal; typically pending an internal team or counterparty. No management direction required. |
| D | **Corporate Secretarial, Tax and Compliance** | Corp-sec filings, statutory deadlines, AGMs, annual returns, tax filings, regulatory audits. |
| E | **Legal Operations** | Internal Legal initiatives and frameworks (audits, guidelines, template programs, platform T&Cs, AI terms). |
| F | **Scheduled BAU, Administrative and Resolved Matters** | Routine/administrative items for record-keeping. Ends with a **"Resolved:"** list of closed matters (ticket + title only). No management visibility required. |

**Section headers.** Use the section letter (A–F) followed by the title in UPPER CASE.
(Earlier reports used numbers 1–6; the current standard is letters A–F. Either is
acceptable but be consistent within a single report.)

**Section preamble.** Sections B, C, and F carry a one-line italicised preamble that
sets expectations, e.g.:
- B: *"No management decision is required on the following matters. They are reported for management's awareness and visibility."*
- C: *"All matters below are being managed by the Legal Team. Where a matter is pending a specific internal team or counterparty, this is identified. No management direction is required."*
- F: *"Routine matters completed during the week. Noted for completeness and record-keeping. No management visibility required."*

**Document furniture.** Header block reads `CONFIDENTIAL` / `PLUANG GROUP` /
`WEEKLY LEGAL REPORT` / `Week Ending: <date>`. Every page is marked `CONFIDENTIAL`.

---

## 2. Per-matter entry format

**Heading.** `LSRM-XXXX: <Matter Title>` — the JIRA ticket number, a colon, then a
descriptive matter title. Use the counterparty/structure naming convention
`PartyA x PartyB <Subject> Framework/Agreement` where relevant
(e.g. `LSRM-3214: BNP Paribas x CIMB Niaga Custodian Transition Framework`). Other
ticket prefixes appear where applicable (`PRTNRSHP-`, `PB-`).

**Action-type tag (Section A only).** Each Section A matter is labelled with the kind of
management action sought, drawn from this controlled set:
- `DECISION REQUIRED`
- `APPROVAL AND SIGNATURE`
- `SIGNATURE`
- `APPROVAL`
- `ALIGNMENT`

**Body.** Dense, continuous narrative prose. **No bullet points in the body.** Lettered
sub-points `(a) (b) (c)` (and `(i) (ii) (iii)`) are permitted *only* to enumerate
discrete risks, options, or conditions within a matter. Each matter answers, in order:
1. **What we did / the position** — the substantive legal work and analysis.
2. **Why it matters** — the risk, exposure, commercial objective, or legal basis.
3. **Current status** — where the matter stands now.
4. **What's next / what's needed** — the pending step, owner, or counterparty.

**Continuity opener.** For a matter reported in a prior period, open with
*"Further to last week's report,"* then state only the material developments — do not
re-state the full background.

**Status close.** End most matters with a crisp status/next-step sentence:
*"Pending [party]'s confirmation…"*, *"Awaiting [counterparty] feedback."*,
*"We will circulate the revised draft to [party] by [date]."*

**Action line (Section A).** Close each Section A matter with a **bold** directive that
names the actor and the precise act, prefixed by the matching label:
- **Action required:** *Claudia to sign the Annual Reports FY 2025 for SSS and VKS via Privy.*
- **Alignment required:** *Management direction is required on whether to continue with the Gorriceta shelf acquisition or pivot to a fresh incorporation. We recommend the fresh incorporation route if expedited progress is a priority.*
- **Decision Required:** *We propose executing option (b) on cost and timeline grounds. We request management approval to proceed with route (b).*

**Resolved list (Section F).** A numbered list of closed matters, `LSRM-XXXX: <Title>`
only, with no narrative.

---

## 3. Voice and tone

- **Institutional first-person plural.** "We have reviewed…", "We have advised…",
  "We have flagged…", "Legal has…". Never "I". The team speaks as one.
- **Tense by status.** Present perfect / past for completed work ("We have finalised…");
  present continuous for ongoing ("We are reviewing…"); future for next steps
  ("We will circulate…").
- **Lead with the risk or recommendation**, then the supporting reasoning. Management
  reads top-down and time-poor.
- **Recommendations are explicit and reasoned:** "We recommend X **because** Y." Never
  leave a decision-needed matter without a recommended course.
- **Precision over hedging.** Use exact figures, dates, currencies, and named parties.
  Cite statutory/regulatory authority by number where it carries the point
  (e.g. "Section 78B of the SG Companies Act 1967", "OJK", "ACRA", "Bappebti").
- **Third person for people**, referred to by name and/or role (Claudia, Stella, counsel,
  the Partnership team).
- **Formal register**, no contractions in the final report, no colloquialisms; legalese
  only where it adds precision, otherwise plain and direct.
- **Risk-forward and defensive.** State exposure, residual gaps, and the mitigation
  taken or recommended. Flag where a position falls below the Group's standard and why
  the residual risk is acceptable.

---

## 4. Standing conventions

- **Every matter ties to a JIRA ticket** (`LSRM-`, `PRTNRSHP-`, `PB-`). A matter with no
  ticket is the exception and should be justified.
- **Entity shorthand** is used throughout once context is set: PTS, BSC, PES, SSS, PGB,
  PIS, SMN, VKS, PTI, TGB, CCI, etc. Spell out on first material use if ambiguous.
- **Deadlines and statutory cut-offs are always surfaced** with the date and the
  consequence of missing them.
- **Confidentiality and privilege** are assumed; the report is marked CONFIDENTIAL and
  is for internal management consumption only.
- **No invention.** The AI must draft only from the inputs provided (the per-matter
  Work Summary, Escalation, Next Steps, and any JIRA-sourced activity). It must never
  fabricate facts, figures, citations, dates, or party names. Where an input is missing,
  it states the gap rather than filling it.

---

## 5. How the AI uses this guide (Task Tracker and Report module)

The per-matter raw material captured in the dashboard maps onto the report as follows:

| Input field (per matter) | Role in the generated report |
|---------------------------|------------------------------|
| Name | Drafter attribution / roster (not printed in the combined report body) |
| Matter Group | Helps route the matter to the correct section (A–F) |
| JIRA Ticket Number | The `LSRM-XXXX` in the matter heading |
| Matter Title | The descriptive title in the matter heading |
| Work Summary & Key Changes | Source for "what we did / position / why it matters / status" |
| Escalation / blocker / request for direction | Promotes the matter to **Section A**; drives the action-type tag and the bold action line |
| Next Steps | Source for the status-close sentence |

The AI's task when generating a report is to, for each matter:
1. **Classify** it into the correct section (A–F) — a matter with an escalation/decision
   ask goes to A; a significant no-decision matter to B; routine items to F; etc.
2. **Assign the action-type tag** (Section A only) from the controlled set.
3. **Redraft** the inputs into a single house-style narrative paragraph that follows the
   four-part order in §2, in the voice of §3.
4. **Compose the bold action line** (Section A) naming the actor and the precise act.
5. Preserve every figure, date, citation, and party name from the input exactly; flag,
   never invent, anything missing.

This runs in **two stages**:
- **Stage 1 — per person.** Each team member's matters (JIRA-sourced + manual) are
  drafted and classified into Sections A–F, producing that person's draft for the period.
  The drafter reviews and edits before contributing.
- **Stage 2 — combined.** The Head of Legal assembles the per-person drafts into one
  combined report: matters are merged under the shared A–F sections, ordered by
  management attention, de-duplicated where two people touched the same ticket, and
  curated into the final management-facing document.

The output of both stages is a **working draft** for the drafter and the Head of Legal to
review, edit, and submit. It is not a final Legal Department position until reviewed by
qualified counsel.
