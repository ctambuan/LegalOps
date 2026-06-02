// app/page.js — main client application.
"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  listenClauses, listenProposals, listenAdopted,
  createProposal, transitionProposal, logExport, seedClausesViaApi,
  calibrateClauseField, commitCalibrationToRepo,
} from "../lib/data";
import { TIERS, CTYPES, CLASSES, JURISDICTIONS, PLAYBOOK_VERSION } from "../lib/constants";
import { COMPANY_LABEL, AI_ASSIST_ENABLED, DRIVE_UPLOAD_ENABLED, DRIVE_FOLDER_ID, PLAYBOOK_VERSION_TAG } from "../lib/config";
import { exportMaster } from "../lib/exportDocx";
import { callAssist } from "../lib/assist";
import { uploadDocxToDrive, uploadToDrive } from "../lib/driveUpload";
import { generatePlaybookPdf } from "../lib/pdfPlaybook";

export default function Page() {
  const { user, role, loading, ready, isReviewer, isAllowed, login, logout } = useAuth();
  const [tab, setTab] = useState("library");
  const [clauses, setClauses] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [adopted, setAdopted] = useState([]);
  const [toast, setToast] = useState("");
  const [prefill, setPrefill] = useState(null);
  const [feature, setFeature] = useState("contracting");
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  useEffect(() => {
    if (!isAllowed) return;
    const u1 = listenClauses(setClauses);
    const u2 = listenProposals(setProposals);
    const u3 = listenAdopted(setAdopted);
    return () => { u1(); u2(); u3(); };
  }, [isAllowed]);

  if (loading) return <div className="center"><div className="kicker">Loading…</div></div>;

  if (!ready) return (
    <div className="center">
      <div className="gate">
        <div className="kicker">Configuration required</div>
        <h2>Not configured</h2>
        <p>Firebase environment variables are not set for this deployment. Set the <code>NEXT_PUBLIC_FIREBASE_*</code>
        values in your hosting environment and redeploy. See <code>DEPLOY.md</code>.</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="center">
      <div className="gate">
        <div className="kicker">Built for Legal Department</div>
        <h2>Legal Operations Workbench</h2>
        <p>Confidential &amp; Legally Privileged. Access is restricted to authorized accounts.</p>
        <button className="btn primary" onClick={login}>Sign in with Google</button>
      </div>
    </div>
  );

  if (!isAllowed) return (
    <div className="center">
      <div className="gate">
        <div className="kicker">Access denied</div>
        <h2>Not authorised</h2>
        <p>The account <b>{user.email}</b> is not on the access list for this workbench. Contact the
        Head of Legal to be added.</p>
        <button className="btn" onClick={logout}>Sign out</button>
      </div>
    </div>
  );

  const pending = proposals.filter((p) => p.status === "pending").length;

  const PAGE = {
    library: { eyebrow: `Playbook ${PLAYBOOK_VERSION} · ${clauses.length} clauses`, title: "Clause Library",
      sub: "The controlled source of contracting positions. Retrieve any clause with its baseline, buy-side, sell-side and fallback variants — each labelled by tier and classification." },
    contribute: { eyebrow: "Working draft until adopted", title: "Propose / Draft",
      sub: "Submit an improvement, additional fallback, conditional expansion, or new clause. It routes to the Head of Legal for review and does not change the library until adopted." },
    review: { eyebrow: "Head of Legal only", title: "Review Queue",
      sub: "Each submission is a working draft until you adopt it. Compare the proposed text against the current Playbook position, then approve and adopt, request changes, or reject." },
    master: { eyebrow: `${adopted.length} adopted`, title: "Master & Export",
      sub: "The live record of positions adopted as addenda to the Playbook. Export the full master as a formatted Word document; each export is logged." },
  };
  const pg = PAGE[tab] || PAGE.library;

  const FEATURES = [
    { key: "docgen", label: "Document Number Generator" },
    { key: "compliance", label: "Compliance Tracker" },
    { key: "contracting", label: "Contracting Engine" },
    { key: "budget", label: "Budget Tracker" },
  ];
  const activeFeature = FEATURES.find((f) => f.key === feature) || FEATURES[2];

  const SubItem = (key, label, badge) => (
    <button className={"subitem " + (tab === key ? "active" : "")} onClick={() => setTab(key)}>
      <span className="dot"></span>{label}{badge ? <span className="badge">{badge}</span> : null}
    </button>
  );

  return (
    <div className="wrap">
      <aside className="side">
        <div className="brand">
          <div className="wm">Legal Operations Workbench</div>
          <div className="eyebrow">Built for Legal Department</div>
        </div>
        <nav className="nav">
          {FEATURES.map((f) => (
            <div key={f.key} className="navgroup">
              <button className={"navitem " + (feature === f.key ? "active" : "")} onClick={() => setFeature(f.key)}>
                <span className="dot"></span>{f.label}
                {f.key === "contracting" && pending ? <span className="badge">{pending}</span> : null}
              </button>
              {f.key === "contracting" && feature === "contracting" && (
                <div className="subnav">
                  {SubItem("library", "Clause Library")}
                  {SubItem("contribute", "Propose / Draft")}
                  {isReviewer && SubItem("review", "Review", pending)}
                  {SubItem("master", "Master & Export", adopted.length || 0)}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="who">
          <div>
            <div className="nm">{user.email}</div>
            <div className="rl">{role}</div>
          </div>
          <button className="btn sm ghost" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        {feature === "contracting" ? (
          <>
            <div className="topbar">
              <div className="kicker">Contracting Engine · {pg.eyebrow}</div>
              <h1>{pg.title}</h1>
              <div className="sub">{pg.sub}</div>
            </div>
            <div className="content">
              {tab === "library" && <Library clauses={clauses} onPropose={(c) => { setPrefill(c); setTab("contribute"); }} showToast={showToast} isReviewer={isReviewer} />}
              {tab === "contribute" && <Contribute prefill={prefill} clearPrefill={() => setPrefill(null)} user={user}
                onSubmit={async (item) => { await createProposal(item, user); showToast("Submitted for review"); setTab(isReviewer ? "review" : "library"); }} />}
              {tab === "review" && isReviewer && <Review proposals={proposals} user={user} showToast={showToast} />}
              {tab === "master" && <Master adopted={adopted} clauses={clauses} isReviewer={isReviewer} user={user} showToast={showToast} />}
            </div>
          </>
        ) : (
          <>
            <div className="topbar">
              <div className="kicker">Legal Operations · Module</div>
              <h1>{activeFeature.label}</h1>
              <div className="sub">Part of the Legal Operations Workbench roadmap.</div>
            </div>
            <div className="content">
              <div className="tbd">
                <div className="tbdtag">To Be Developed</div>
                <div className="big">{activeFeature.label}</div>
                <p>This module is planned and not yet built. The <b>Contracting Engine</b> is the capability live today — select it from the left to use the clause library, proposals, review and the adopted master.</p>
              </div>
            </div>
          </>
        )}

        <div className="priv">This workbench and its contents are the confidential and legally privileged property of {COMPANY_LABEL} and its group companies, for internal Legal Department use only. AI-assisted outputs remain working drafts subject to human review by qualified {COMPANY_LABEL} counsel and do not constitute legal advice or a Legal Department position until reviewed and adopted by the Head of Legal. Positions are classified per the Playbook four-tier scheme; only positions expressly marked Mandatory Law with a cited source note represent verified legal requirements — all citations require verification before reliance.</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// Standard drafting positions used when a clause does not define its own variants.
const VARIANT_DEFAULTS = [
  { key: "baseline", tier: "baseline", label: "Baseline", note: "Balanced position" },
  { key: "buyside",  tier: "baseline", label: "Buy-Side", note: "Maximum protection" },
  { key: "sellside", tier: "baseline", label: "Sell-Side", note: "Liability-controlled" },
  { key: "fallback", tier: "fallback", label: "Acceptable Fallback", note: "Negotiated minimum" },
];

// A clause's drafting templates: its own labelled variants (e.g. Term's Model 1–4)
// when defined, otherwise the standard positions that actually have recorded text.
// Single source of truth so the library-card tags and the clause-detail tabs always match.
function clauseTemplates(c) {
  return (Array.isArray(c.variants) && c.variants.length)
    ? c.variants.map((v) => ({ label: v.label, tier: v.tier || "baseline", note: v.note || "", text: v.text || "", whenToUse: v.whenToUse }))
    : VARIANT_DEFAULTS.filter((t) => (c[t.key] || "").trim()).map((t) => ({ label: t.label, tier: t.tier, note: t.note, text: c[t.key] }));
}

/* ---------------- Library ---------------- */
function Library({ clauses, onPropose, showToast, isReviewer }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sel, setSel] = useState(null);
  // First-time setup: an empty library is auto-populated for the reviewer (no manual step).
  const [seedState, setSeedState] = useState("idle"); // idle | loading | error
  const [seedErr, setSeedErr] = useState("");
  const triedRef = useRef(false);
  const loadClauses = async () => {
    setSeedState("loading"); setSeedErr("");
    try { const n = await seedClausesViaApi(); showToast(`Loaded ${n} Playbook clauses`); setSeedState("idle"); }
    catch (e) { console.error(e); setSeedErr(e.message || String(e)); setSeedState("error"); }
  };
  useEffect(() => {
    if (!isReviewer || clauses.length > 0 || triedRef.current) return;
    triedRef.current = true;
    loadClauses();
  }, [isReviewer, clauses.length]); // eslint-disable-line
  const cats = useMemo(() => ["All", ...Array.from(new Set(clauses.map((c) => c.cat)))], [clauses]);
  const list = useMemo(() => clauses.filter((c) => {
    const m = (c.title + " " + c.purpose + " " + c.baseline).toLowerCase().includes(q.toLowerCase());
    return m && (cat === "All" || c.cat === cat);
  }), [clauses, q, cat]);

  return (
    <>
      {clauses.length === 0 && isReviewer && seedState === "loading" && (
        <div className="lockmsg">Setting up the library — loading the {PLAYBOOK_VERSION} Playbook clauses…</div>
      )}
      {clauses.length === 0 && isReviewer && seedState === "error" && (
        <div className="lockmsg" style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between", flexWrap: "wrap" }}>
          <span>Couldn’t load the Playbook clauses. <b>Reason:</b> {seedErr || "unknown error"}</span>
          <button className="btn primary" onClick={loadClauses}>Retry</button>
        </div>
      )}
      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Search clauses, purpose, operative text…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <span className="chip">{list.length} results</span>
        {isReviewer && clauses.length > 0 && (
          <button className="btn sm ghost" onClick={loadClauses} disabled={seedState === "loading"}
            title="Reload all clauses from the current master Playbook">
            {seedState === "loading" ? "Syncing…" : "Re-sync from master"}
          </button>
        )}
      </div>
      <div className="grid">
        {list.map((c) => (
          <div key={c.id} className="clausecard" onClick={() => setSel(c)}>
            <span className="cnum">CL-{String(c.id).padStart(2, "0")}</span>
            <span className="ccat">{c.cat}</span>
            <div className="ctitle">{c.title}</div>
            <div className="cpurpose">{c.purpose || "—"}</div>
            <div className="cvariants">
              {clauseTemplates(c).map((t, i) => (
                <span key={i} className="vtag on" title={t.label}>
                  {/* Card shows the short label (e.g. "Model 1"); the modal tab keeps the full label. */}
                  <span className={"dotr " + (TIERS[t.tier] ? TIERS[t.tier].c : "neutral")}></span>{t.label.split("—")[0].trim()}
                </span>
              ))}
              {(c.redflags || "").trim() && (
                <span className="vtag on"><span className="dotr proh"></span>Red Flags</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && <div className="empty"><div className="big">No clauses match.</div>Adjust your search or category filter.</div>}
      {sel && <ClauseModal key={sel.id} c={sel} onClose={() => setSel(null)} onPropose={onPropose} showToast={showToast} />}
    </>
  );
}

function ClauseModal({ c, onClose, onPropose, showToast }) {
  const copy = (t, label) => { navigator.clipboard?.writeText(t); showToast(`${label} copied`); };
  // Same source as the library-card tags, so tabs and tags always match.
  const templates = clauseTemplates(c);
  const [active, setActive] = useState(0);
  const cur = templates[active] || templates[0];
  // AI assist (Claude): explain this clause, or review a counterparty's version.
  const [aiBusy, setAiBusy] = useState("");        // "" | "explain" | "review"
  const [aiOut, setAiOut] = useState("");
  const [aiErr, setAiErr] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [cpText, setCpText] = useState("");
  const runAssist = async (mode) => {
    setAiBusy(mode); setAiErr(""); setAiOut("");
    try {
      setAiOut(await callAssist(mode, {
        clauseTitle: c.title, category: c.cat,
        clauseText: cur?.text || c.baseline || "",
        counterpartyText: mode === "review" ? cpText : undefined,
      }));
    } catch (e) { setAiErr(e.message || String(e)); }
    setAiBusy("");
  };
  const redflags = (c.redflags || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const usage = (c.usageNotes || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const counsel = (c.counselNotes || "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">CL-{String(c.id).padStart(2, "0")} · {c.cat}</div>
          <div className="ctitle" style={{ fontSize: "23px", margin: "5px 0" }}>{c.title}</div>
          {c.purpose && <div className="purposenote"><span className="lab">Purpose</span><span className="txt">{c.purpose}</span></div>}
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          <div className="sectlabel"><span className="t">Clause Templates</span><span className="h">— ready to drop into a contract</span></div>
          {cur ? (
            <>
              <div className="tabs2">
                {templates.map((t, i) => (
                  <button key={i} className={"tab2 " + (active === i ? "active" : "")} onClick={() => setActive(i)}>
                    <span className={"dotr " + (TIERS[t.tier] ? TIERS[t.tier].c : "neutral")}></span>{t.label}
                  </button>
                ))}
              </div>
              <div className="tpanel">
                <div className="tpanelhead">
                  {TIERS[cur.tier] && <span className={"tier " + TIERS[cur.tier].c}>{TIERS[cur.tier].l}</span>}
                  {cur.note && <span className="tname">{cur.note}</span>}
                  <button className="copyb" onClick={() => copy(cur.text, cur.label)}>⧉ Copy</button>
                </div>
                {cur.whenToUse && <div className="whenuse"><b>When to use</b> {cur.whenToUse}</div>}
                <div className="vtext">{cur.text}</div>
              </div>
            </>
          ) : <div className="hint">No drafting template recorded for this clause.</div>}

          {(counsel.length > 0 || redflags.length > 0 || usage.length > 0) && (
            <div className="sectlabel"><span className="t">Notes for Counsel</span><span className="h">— guidance, not contract text</span></div>
          )}
          {counsel.length > 0 && (
            <div className="note usage">
              <div className="nlab">When to use / negotiation notes</div>
              <ul>{counsel.map((u, i) => <li key={i}>{u}</li>)}</ul>
            </div>
          )}
          {redflags.length > 0 && (
            <div className="note red">
              <div className="nlab">⚠ Red flags — do not accept without documented approval</div>
              <ul>{redflags.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          {usage.length > 0 && (
            <div className="note usage">
              <div className="nlab">Usage notes</div>
              <ul>{usage.map((u, i) => <li key={i}>{u}</li>)}</ul>
            </div>
          )}

          {AI_ASSIST_ENABLED && (
            <>
              <div className="sectlabel"><span className="t">Ask Claude</span><span className="h">— AI working drafts, not a Legal Department position</span></div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                <button className="btn sm ghost" disabled={!!aiBusy} onClick={() => runAssist("explain")}>
                  {aiBusy === "explain" ? "Thinking…" : "Explain this clause"}</button>
                <button className="btn sm ghost" disabled={!!aiBusy} onClick={() => setShowReview((v) => !v)}>
                  Review a counterparty version</button>
              </div>
              {showReview && (
                <div className="field" style={{ marginBottom: "10px" }}>
                  <textarea value={cpText} onChange={(e) => setCpText(e.target.value)}
                    placeholder="Paste the counterparty's proposed clause here, then Run review…" style={{ minHeight: "90px" }} />
                  <div style={{ textAlign: "right", marginTop: "6px" }}>
                    <button className="btn sm primary" disabled={!!aiBusy || !cpText.trim()} onClick={() => runAssist("review")}>
                      {aiBusy === "review" ? "Reviewing…" : "Run review"}</button>
                  </div>
                </div>
              )}
              {aiErr && <div className="hint" style={{ color: "var(--oxblood)" }}>{aiErr}</div>}
              {aiOut && (
                <div className="note usage">
                  <div className="nlab">Claude — working draft, verify before relying</div>
                  <div className="vtext" style={{ whiteSpace: "pre-wrap" }}>{aiOut}</div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Close</button>
          {cur && <button className="btn" onClick={() => copy(cur.text, cur.label)}>Copy {cur.label}</button>}
          <button className="btn primary" onClick={() => { onPropose(c); }}>Propose Change →</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Contribute ---------------- */
function Contribute({ prefill, clearPrefill, user, onSubmit }) {
  const [type, setType] = useState("improve");
  const [title, setTitle] = useState(prefill?.title || "");
  const [baseRef, setBaseRef] = useState(prefill ? `CL-${String(prefill.id).padStart(2, "0")} ${prefill.title}` : "");
  const [tier, setTier] = useState("baseline");
  const [classification, setClassification] = useState("Preferred Posture");
  const [text, setText] = useState(prefill?.baseline || "");
  const [rationale, setRationale] = useState("");
  const [redflag, setRedflag] = useState("");
  const [jurisdiction, setJurisdiction] = useState("Group-wide");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  useEffect(() => () => clearPrefill?.(), []); // eslint-disable-line

  // Draft/improve the operative text with Claude, then split off any "Notes for Counsel"
  // guidance into the rationale field (operative text and guidance stay separate).
  const aiDraft = async () => {
    setAiBusy(true); setAiErr("");
    try {
      const mode = type === "new" ? "draft" : "improve";
      const out = await callAssist(mode, {
        instruction: rationale || (type === "new"
          ? `Draft a clause titled "${title || "(untitled)"}".`
          : "Improve clarity, balance and enforceability while preserving intent."),
        clauseTitle: title || baseRef,
        clauseText: text,
        tier: TIERS[tier]?.l,
        category: prefill?.cat,
      });
      const m = out.match(/notes for counsel/i);
      if (m) {
        setText(out.slice(0, m.index).replace(/[#*\s]+$/, "").trim());
        const notes = out.slice(m.index).replace(/^[#*\s]*notes for counsel[:\s-]*/i, "").trim();
        setRationale((r) => r ? r : notes);
      } else {
        setText(out.trim());
      }
    } catch (e) { setAiErr(e.message || String(e)); }
    setAiBusy(false);
  };

  const mandatory = classification === "Mandatory Law";
  const valid = title.trim() && text.trim() && rationale.trim();
  const submit = () => onSubmit({
    type, jurisdiction, title, baseRef, tier, classification, text, rationale, redflag,
    originalText: prefill ? (tier === "fallback" ? prefill.fallback : prefill.baseline) : "",
  });

  return (
    <>
      <div className="lockmsg">Every submission is captured as <b>drafted — pending Head of Legal adoption</b> and
        routed to the review queue. It does not alter the master library until the Head of Legal approves it. State the
        proposed tier and classification; flag any deviation, novel issue, or cross-jurisdictional element in your rationale.</div>
      <div style={{ maxWidth: "760px" }}>
        <div className="two">
          <div className="field"><label>Contribution type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(CTYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>Jurisdiction</label>
            <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>{JURISDICTIONS.map((j) => <option key={j} value={j}>{j}</option>)}</select></div>
        </div>
        <div className="field"><label>Clause title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Limitation of Liability" /></div>
        {type !== "new" && <div className="field"><label>Existing clause reference</label>
          <input value={baseRef} onChange={(e) => setBaseRef(e.target.value)} placeholder="CL-47 Limitation of Liability" /></div>}
        <div className="two">
          <div className="field"><label>Proposed tier</label>
            <select value={tier} onChange={(e) => setTier(e.target.value)}>{Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select></div>
          <div className="field"><label>Classification</label>
            <select value={classification} onChange={(e) => setClassification(e.target.value)}>{CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        {mandatory && <div className="flagbox"><b>Mandatory Law — cited source note required</b>You must reproduce the exact statutory/regulatory citation verbatim in the rationale. Do not paraphrase or approximate. If you cannot cite a verified source, do not classify as Mandatory Law — use Internal Policy or Preferred Posture and flag for verification.</div>}
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <label style={{ margin: 0 }}>{type === "improve" ? "Proposed revised clause text" : type === "fallback" ? "Proposed fallback clause text" : type === "expand" ? "Proposed conditional expansion" : "Proposed new clause text"}</label>
            {AI_ASSIST_ENABLED && <button type="button" className="btn sm ghost" disabled={aiBusy} onClick={aiDraft}
              title="Draft or improve the operative text with Claude — a working draft for your review">
              {aiBusy ? "Drafting…" : "✨ Draft with Claude"}</button>}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Operative text in house style — narrative prose, logical numbering, no bullet points…" />
          <div className="hint">House style: formal, no contractions, active voice, hierarchical numbering, no bullets in operative text.</div>
          {aiErr && <div className="hint" style={{ color: "var(--oxblood)" }}>{aiErr}</div>}
          {AI_ASSIST_ENABLED && <div className="hint">AI output is a working draft for your review — not a Legal Department position. Verify before submitting.</div>}
        </div>
        <div className="field"><label>Rationale / risk note{mandatory ? " (include verbatim citation)" : ""}</label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} style={{ minHeight: "80px" }} placeholder="Why this position; commercial objective; any deviation from Playbook; novel issue; cross-jurisdictional flag…" /></div>
        <div className="field"><label>Associated red flag (optional)</label>
          <input value={redflag} onChange={(e) => setRedflag(e.target.value)} placeholder="What must not be accepted without documented approval" /></div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button className="btn primary" disabled={!valid} onClick={submit}>Submit for Review →</button>
        </div>
        {!valid && <div className="hint" style={{ textAlign: "right" }}>Title, proposed text, and rationale are required.</div>}
      </div>
    </>
  );
}

/* ---------------- Review (reviewer only) ---------------- */
function Review({ proposals, user, showToast }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("pending");
  const counts = useMemo(() => ({
    pending: proposals.filter((p) => p.status === "pending").length,
    approved: proposals.filter((p) => p.status === "approved").length,
    changes: proposals.filter((p) => p.status === "changes").length,
    rejected: proposals.filter((p) => p.status === "rejected").length,
  }), [proposals]);
  const fl = proposals.filter((p) => filter === "all" || p.status === filter);

  const act = async (p, toStatus, note) => {
    await transitionProposal(p._id, p.status, toStatus, note, user);
    showToast(toStatus === "approved" ? "Approved & adopted" : "Marked " + toStatus);
  };

  return (
    <>
      <div className="statbar">
        <div className="stat"><div className="n">{counts.pending}</div><div className="l">Pending</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--forest)" }}>{counts.approved}</div><div className="l">Approved</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--t-esc)" }}>{counts.changes}</div><div className="l">Changes Req.</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--oxblood)" }}>{counts.rejected}</div><div className="l">Rejected</div></div>
        <div style={{ marginLeft: "auto" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["pending", "approved", "changes", "rejected", "all"].map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
          </select>
        </div>
      </div>
      {fl.length === 0 && <div className="empty"><div className="big">Queue is clear.</div>No {filter} submissions.</div>}
      {fl.map((p) => <ReviewCard key={p._id} p={p} open={open === p._id} toggle={() => setOpen(open === p._id ? null : p._id)} act={act} />)}
    </>
  );
}

function ReviewCard({ p, open, toggle, act }) {
  const [note, setNote] = useState("");
  const created = p.createdAt?.toDate ? p.createdAt.toDate() : null;
  return (
    <div className="qcard">
      <div className="qhead" onClick={toggle}>
        <span className={"qtype " + p.type}>{CTYPES[p.type]}</span>
        <span className="qtitle">{p.title}</span>
        <span className={"tier " + TIERS[p.tier].c}>{TIERS[p.tier].l}</span>
        <span className={"qstatus " + p.status}>{p.status}</span>
        <span className="qmeta">{p.authorName || p.authorEmail} · {p.jurisdiction} · {created ? created.toLocaleDateString() : "—"}</span>
      </div>
      <div className={"qbody" + (open ? " open" : "")}>
        <div style={{ marginBottom: "10px" }}>
          <span className="chip">{p.classification}</span>
          {p.baseRef && <span className="chip">Ref: {p.baseRef}</span>}
        </div>
        {p.classification === "Mandatory Law" && <div className="flagbox"><b>Mandatory Law claimed — verify citation</b>Confirm the cited source note in the rationale is accurate and reproduced verbatim before adoption. Do not adopt as Mandatory Law on an unverified citation.</div>}
        <div className="compare">
          <div className="col"><h4>{p.type === "new" ? "No prior text (new clause)" : "Current Playbook text"}</h4><div className="txt">{p.originalText || "—"}</div></div>
          <div className="col"><h4>Proposed</h4><div className="txt add">{p.text}</div></div>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <h4 style={{ fontFamily: "IBM Plex Mono,monospace", fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: "5px" }}>Rationale / risk note</h4>
          <div className="cpurpose" style={{ WebkitLineClamp: 99, color: "var(--ink)" }}>{p.rationale}</div>
        </div>
        {p.redflag && <div className="flagbox"><b>Associated red flag</b>{p.redflag}</div>}
        {p.reviewNote && <div className="cpurpose" style={{ WebkitLineClamp: 99, fontStyle: "italic", marginBottom: "10px" }}>Prior review note: {p.reviewNote}</div>}
        <div className="reviewact">
          <textarea placeholder="Review note (optional)…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary sm" onClick={() => act(p, "approved", note)}>Approve &amp; Adopt</button>
          <button className="btn sm" onClick={() => act(p, "changes", note)}>Request Changes</button>
          <button className="btn sm" onClick={() => act(p, "rejected", note)}>Reject</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Master & Export ---------------- */
function Master({ adopted, clauses = [], isReviewer, user, showToast }) {
  const { getDriveAccessToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Save the full current clause bank as a PDF into the Drive folder (drive.file).
  const savePdfToDrive = async () => {
    setPdfBusy(true);
    try {
      const { blob, filename } = generatePlaybookPdf(clauses, { companyLabel: COMPANY_LABEL, version: PLAYBOOK_VERSION });
      let token = await getDriveAccessToken();
      let file;
      try {
        file = await uploadToDrive(blob, filename, "application/pdf", token, DRIVE_FOLDER_ID);
      } catch (e) {
        if (e.status === 401) { token = await getDriveAccessToken({ forceRefresh: true }); file = await uploadToDrive(blob, filename, "application/pdf", token, DRIVE_FOLDER_ID); }
        else { throw e; }
      }
      await logExport(user, clauses.length);
      showToast(`Playbook PDF saved to Drive: ${file.name}`);
    } catch (e) { console.error(e); showToast(e.message || "PDF save failed — see console"); }
    setPdfBusy(false);
  };
  const run = async () => {
    setBusy(true);
    try { await exportMaster(adopted); await logExport(user, adopted.length); showToast("Master .docx generated — place in Drive folder"); }
    catch (e) { console.error(e); showToast("Export failed — see console"); }
    setBusy(false);
  };
  // Save the master straight into the Drive folder under the reviewer's identity (drive.file).
  const saveToDrive = async () => {
    setDriveBusy(true);
    try {
      const { blob, filename } = await exportMaster(adopted, { download: false });
      let token = await getDriveAccessToken();
      let file;
      try {
        file = await uploadDocxToDrive(blob, filename, token, DRIVE_FOLDER_ID);
      } catch (e) {
        if (e.status === 401) { // token expired — refresh once and retry
          token = await getDriveAccessToken({ forceRefresh: true });
          file = await uploadDocxToDrive(blob, filename, token, DRIVE_FOLDER_ID);
        } else { throw e; }
      }
      await logExport(user, adopted.length);
      showToast(`Saved to Drive: ${file.name}`);
    } catch (e) { console.error(e); showToast(e.message || "Drive save failed — see console"); }
    setDriveBusy(false);
  };
  return (
    <>
      <div className="lockmsg">This is the <b>adopted master</b> — the live record of positions the Head of Legal has
        approved as addenda to Playbook {PLAYBOOK_VERSION}. Export the full master as a formatted .docx{DRIVE_UPLOAD_ENABLED ? " — or save it straight into the Drive folder" : " and place it into the Drive folder"}.
        Each export is logged in the audit trail.</div>
      <div className="statbar">
        <div className="stat"><div className="n">{adopted.length}</div><div className="l">Adopted positions</div></div>
        <div className="stat"><div className="n">{new Set(adopted.map((m) => m.title)).size}</div><div className="l">Distinct clauses</div></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          {DRIVE_UPLOAD_ENABLED && (
            <button className="btn" onClick={savePdfToDrive} disabled={!clauses.length || pdfBusy}
              title="Render the current clause bank as a PDF and save it into the Drive folder">
              {pdfBusy ? "Saving PDF…" : "Save Playbook PDF to Drive ↑"}</button>
          )}
          {DRIVE_UPLOAD_ENABLED && (
            <button className="btn" onClick={saveToDrive} disabled={!adopted.length || driveBusy || busy}
              title="Upload the adopted-addenda master .docx into the Drive folder">
              {driveBusy ? "Saving…" : "Save addenda .docx ↑"}</button>
          )}
          <button className="btn primary" onClick={run} disabled={!adopted.length || busy}>{busy ? "Generating…" : "Export addenda .docx ↓"}</button>
        </div>
      </div>
      {adopted.length === 0 ? <div className="empty"><div className="big">No adopted positions yet.</div>Approved submissions from the Review tab appear here, ready to export.</div> :
        <>
          {adopted.some((m) => m.playbookVersion && m.playbookVersion !== PLAYBOOK_VERSION_TAG) && (
            <div className="lockmsg" style={{ marginBottom: "10px" }}>
              Some addenda below were adopted under an earlier Playbook version than the current
              <b> {PLAYBOOK_VERSION_TAG}</b> (flagged <span className="staletag">older</span>). When the master is
              re-calibrated, re-confirm these against the current clause text before relying on them (PRD OI5).
            </div>
          )}
          {adopted.map((m, i) => {
            const stale = m.playbookVersion && m.playbookVersion !== PLAYBOOK_VERSION_TAG;
            return (
              <div key={m._id} className="masterrow">
                <span className="cnum">{String(i + 1).padStart(2, "0")}</span>
                <div style={{ flex: 1 }}>
                  <div className="mt">{m.title}</div>
                  <div className="ms">{TIERS[m.tier].l} · {m.classification} · {m.jurisdiction} · by {m.authorName || m.authorEmail}
                    {" · "}adopted under {m.playbookVersion || "—"}
                    {stale && <span className="staletag" title={`Adopted under ${m.playbookVersion}; current master is ${PLAYBOOK_VERSION_TAG}`}>older</span>}
                  </div>
                  {isReviewer && <CalibrateControl m={m} clauses={clauses} user={user} showToast={showToast} />}
                </div>
                <span className={"tier " + TIERS[m.tier].c}>{CTYPES[m.type]}</span>
              </div>
            );
          })}
        </>}
    </>
  );
}

// One-click calibration of an adopted addendum into the live clause bank (and, if configured,
// the repo seed). The reviewer picks which variant slot the approved text fills.
function CalibrateControl({ m, clauses, user, showToast }) {
  const FIELDS = [
    { v: "baseline", l: "Baseline" }, { v: "buyside", l: "Buy-Side" },
    { v: "sellside", l: "Sell-Side" }, { v: "fallback", l: "Acceptable Fallback" },
  ];
  const [field, setField] = useState(m.type === "fallback" ? "fallback" : "baseline");
  const [busy, setBusy] = useState(false);
  // Resolve the target clause id from the addendum's reference, else by title.
  const ref = (m.baseRef || "").match(/CL[-\s]?0*(\d+)/i);
  let clauseId = ref ? Number(ref[1]) : null;
  if (!clauseId) clauseId = clauses.find((c) => (c.title || "").toLowerCase() === (m.title || "").toLowerCase())?.id ?? null;

  const apply = async () => {
    if (!clauseId) { showToast("No matching clause in the bank to calibrate into."); return; }
    if (!m.text?.trim()) { showToast("This addendum has no operative text."); return; }
    setBusy(true);
    try {
      await calibrateClauseField(clauseId, field, m.text, user);     // live bank (instant)
      let tail = "";
      try {
        const r = await commitCalibrationToRepo({ clauseId, field, text: m.text, title: m.title });
        tail = r.configured ? (r.committed ? " · committed to repo" : "") : " · repo sync off";
      } catch (e) { tail = " · repo commit failed"; console.error(e); }
      showToast(`CL-${clauseId} ${field} updated in clause bank${tail}`);
    } catch (e) { console.error(e); showToast(e.message || "Calibration failed — reviewer role required"); }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
      <span className="chip" style={{ opacity: .8 }}>{clauseId ? `→ CL-${clauseId}` : "no clause match"}</span>
      <select value={field} onChange={(e) => setField(e.target.value)} disabled={busy} style={{ padding: "4px 8px", fontSize: "12px" }}>
        {FIELDS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
      </select>
      <button className="btn sm primary" disabled={busy || !clauseId} onClick={apply}
        title="Write this approved text into the live clause bank (and the repo if configured)">
        {busy ? "Calibrating…" : "Calibrate into bank"}</button>
    </div>
  );
}
