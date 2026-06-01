// app/page.js — main client application.
"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  listenClauses, listenProposals, listenAdopted,
  createProposal, transitionProposal, logExport,
} from "../lib/data";
import { TIERS, CTYPES, CLASSES, JURISDICTIONS, PLAYBOOK_VERSION } from "../lib/constants";
import { COMPANY_LABEL } from "../lib/config";
import { exportMaster } from "../lib/exportDocx";

export default function Page() {
  const { user, role, loading, ready, isReviewer, isAllowed, login, logout } = useAuth();
  const [tab, setTab] = useState("library");
  const [clauses, setClauses] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [adopted, setAdopted] = useState([]);
  const [toast, setToast] = useState("");
  const [prefill, setPrefill] = useState(null);
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
        <div className="kicker">{COMPANY_LABEL} · Legal Department</div>
        <h2>Clause Library Workbench</h2>
        <p>Confidential &amp; legally privileged. Access is restricted to authorised {COMPANY_LABEL} accounts.</p>
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

  return (
    <div className="wrap">
      <header>
        <div className="kicker">{COMPANY_LABEL} · Legal Department · Confidential &amp; Privileged</div>
        <h1>Clause Library Workbench</h1>
        <div className="sub">Live collaborative drafting against the Contract Review Playbook {PLAYBOOK_VERSION} — retrieve, propose, review, adopt.</div>
        <div className="metarow">
          <span className="chip ok">{PLAYBOOK_VERSION}</span>
          <span className="chip">{clauses.length} clauses</span>
          <span className="chip">Four-tier classification enforced</span>
          <span className="chip warn">Working drafts — not Legal Dept position until adopted</span>
          <span className="chip">{user.email} · {role}</span>
          <button className="btn sm ghost" onClick={logout}>Sign out</button>
        </div>
        <nav className="tabs">
          <button className={"tab " + (tab === "library" ? "active" : "")} onClick={() => setTab("library")}>Clause Library</button>
          <button className={"tab " + (tab === "contribute" ? "active" : "")} onClick={() => setTab("contribute")}>Propose / Draft</button>
          {isReviewer && (
            <button className={"tab locked " + (tab === "review" ? "active" : "")} onClick={() => setTab("review")}>
              ⚖ Review{pending ? <span className="badge">{pending}</span> : null}
            </button>
          )}
          <button className={"tab " + (tab === "master" ? "active" : "")} onClick={() => setTab("master")}>
            Master &amp; Export{adopted.length ? <span className="badge">{adopted.length}</span> : null}
          </button>
        </nav>
      </header>

      <main>
        {tab === "library" && <Library clauses={clauses} onPropose={(c) => { setPrefill(c); setTab("contribute"); }} showToast={showToast} />}
        {tab === "contribute" && <Contribute prefill={prefill} clearPrefill={() => setPrefill(null)} user={user}
          onSubmit={async (item) => { await createProposal(item, user); showToast("Submitted for review"); setTab(isReviewer ? "review" : "library"); }} />}
        {tab === "review" && isReviewer && <Review proposals={proposals} user={user} showToast={showToast} />}
        {tab === "master" && <Master adopted={adopted} isReviewer={isReviewer} user={user} showToast={showToast} />}
      </main>

      <div className="priv">This workbench and its contents are the confidential and legally privileged property of
        {COMPANY_LABEL} and its group companies, for internal Legal Department use only. AI-assisted
        outputs remain working drafts subject to human review by qualified {COMPANY_LABEL} counsel and do not constitute legal
        advice or a Legal Department position until reviewed and adopted by the Head of Legal. Positions are classified
        per the Playbook four-tier scheme; only positions expressly marked Mandatory Law with a cited source note
        represent verified legal requirements — all citations require verification before reliance.</div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------------- Library ---------------- */
function Library({ clauses, onPropose, showToast }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sel, setSel] = useState(null);
  const cats = useMemo(() => ["All", ...Array.from(new Set(clauses.map((c) => c.cat)))], [clauses]);
  const list = useMemo(() => clauses.filter((c) => {
    const m = (c.title + " " + c.purpose + " " + c.baseline).toLowerCase().includes(q.toLowerCase());
    return m && (cat === "All" || c.cat === cat);
  }), [clauses, q, cat]);

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Search clauses, purpose, operative text…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <span className="chip">{list.length} results</span>
      </div>
      <div className="grid">
        {list.map((c) => (
          <div key={c.id} className="clausecard" onClick={() => setSel(c)}>
            <span className="cnum">CL-{String(c.id).padStart(2, "0")}</span>
            <span className="ccat">{c.cat}</span>
            <div className="ctitle">{c.title}</div>
            <div className="cpurpose">{c.purpose || "—"}</div>
            <div className="cvariants">
              <span className={"vtag " + (c.baseline ? "on" : "")}>Baseline</span>
              <span className={"vtag " + (c.buyside ? "on" : "")}>Buy-Side</span>
              <span className={"vtag " + (c.sellside ? "on" : "")}>Sell-Side</span>
              <span className={"vtag " + (c.fallback ? "on" : "")}>Fallback</span>
              <span className={"vtag " + (c.redflags ? "on" : "")}>Red Flags</span>
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && <div className="empty"><div className="big">No clauses match.</div>Adjust your search or category filter.</div>}
      {sel && <ClauseModal c={sel} onClose={() => setSel(null)} onPropose={onPropose} showToast={showToast} />}
    </>
  );
}

function ClauseModal({ c, onClose, onPropose, showToast }) {
  const copy = (t) => { navigator.clipboard?.writeText(t); showToast("Clause text copied"); };
  const V = (label, tier, text, red) => text ? (
    <div className="variant">
      <div className="vlabel">
        <span className={"tier " + TIERS[tier].c}>{TIERS[tier].l}</span>
        <span>{label}</span>
        <button className="copyb" onClick={() => copy(text)}>Copy</button>
      </div>
      <div className={"vtext" + (red ? " red" : "")}>{text}</div>
    </div>
  ) : null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">CL-{String(c.id).padStart(2, "0")} · {c.cat}</div>
          <div className="ctitle" style={{ fontSize: "23px", margin: "5px 0" }}>{c.title}</div>
          <div className="cpurpose" style={{ WebkitLineClamp: 99, fontStyle: "italic" }}>{c.purpose}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          <div className="flagbox"><b>Classification discipline</b>Tiers shown are the Playbook structural tiers; variant text reproduces Playbook v3.0 verbatim. Unless a position is expressly marked Mandatory Law with a cited source note, treat it as internal policy / preferred posture. Verify all regulatory citations before reliance; flag deviations to Head of Legal.</div>
          {V("Baseline Clause — Balanced", "baseline", c.baseline)}
          {V(`Buy-Side Variant — Max ${COMPANY_LABEL} Protection`, "baseline", c.buyside)}
          {V("Sell-Side Variant — Liability-Controlled", "baseline", c.sellside)}
          {V("Acceptable Fallback", "fallback", c.fallback)}
          {V("⚠ Red Flags — Do Not Accept Without Documented Approval", "prohibited", c.redflags, true)}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={() => copy([c.title, "", c.baseline].join("\n"))}>Copy Baseline</button>
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
  useEffect(() => () => clearPrefill?.(), []); // eslint-disable-line

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
        <div className="field"><label>{type === "improve" ? "Proposed revised clause text" : type === "fallback" ? "Proposed fallback clause text" : type === "expand" ? "Proposed conditional expansion" : "Proposed new clause text"}</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Operative text in house style — narrative prose, logical numbering, no bullet points…" />
          <div className="hint">House style: formal, no contractions, active voice, hierarchical numbering, no bullets in operative text.</div></div>
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
function Master({ adopted, isReviewer, user, showToast }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await exportMaster(adopted); await logExport(user, adopted.length); showToast("Master .docx generated — place in Drive folder"); }
    catch (e) { console.error(e); showToast("Export failed — see console"); }
    setBusy(false);
  };
  return (
    <>
      <div className="lockmsg">This is the <b>adopted master</b> — the live record of positions the Head of Legal has
        approved as addenda to Playbook v3.0. Export the full master as a formatted .docx and place it into the Drive
        folder. Each export is logged in the audit trail.</div>
      <div className="statbar">
        <div className="stat"><div className="n">{adopted.length}</div><div className="l">Adopted positions</div></div>
        <div className="stat"><div className="n">{new Set(adopted.map((m) => m.title)).size}</div><div className="l">Distinct clauses</div></div>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn primary" onClick={run} disabled={!adopted.length || busy}>{busy ? "Generating…" : "Export Master .docx ↓"}</button>
        </div>
      </div>
      {adopted.length === 0 ? <div className="empty"><div className="big">No adopted positions yet.</div>Approved submissions from the Review tab appear here, ready to export.</div> :
        adopted.map((m, i) => (
          <div key={m._id} className="masterrow">
            <span className="cnum">{String(i + 1).padStart(2, "0")}</span>
            <div style={{ flex: 1 }}>
              <div className="mt">{m.title}</div>
              <div className="ms">{TIERS[m.tier].l} · {m.classification} · {m.jurisdiction} · by {m.authorName || m.authorEmail}</div>
            </div>
            <span className={"tier " + TIERS[m.tier].c}>{CTYPES[m.type]}</span>
          </div>
        ))}
    </>
  );
}
