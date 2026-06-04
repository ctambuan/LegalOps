// app/TaskTracker.js — Task Tracker and Report module.
// Two surfaces:
//   • Legal Service Request Management dashboard — log matters for a reporting period
//     ("+ Add matter" folds in the former Microsoft Form / Additional Input), then have
//     Claude draft a uniform, house-style weekly report (per-person draft, Stage 1).
//   • Weekly Report — the store of submitted/draft reports (author + management visible),
//     editable and re-savable; reviewers can assemble the combined report (Stage 2).
//
// Phase 1 is forms + AI only. The live JIRA LSRM pull (per-user OAuth) is Phase 2 and will
// pre-fill "My matters" automatically. The drafting discipline lives in
// docs/weekly_report_style_guide.md and app/api/report/route.js.
"use client";
import { useEffect, useMemo, useState } from "react";
import {
  listenReportSettings, saveReportSettings,
  listenReportMatters, createReportMatter, updateReportMatter, deleteReportMatter,
  listenWeeklyReports, createWeeklyReport, updateWeeklyReport, deleteWeeklyReport,
} from "../lib/data";
import { callReport } from "../lib/report";
import { MATTER_GROUPS, DEFAULT_ROSTER } from "../lib/reportConfig";
import { AI_ASSIST_ENABLED } from "../lib/config";

const today = () => new Date().toISOString().slice(0, 10);
const weekAgo = () => new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
const pickMatter = (m) => ({
  matterGroup: m.matterGroup, ticket: m.ticket, matterTitle: m.matterTitle,
  workSummary: m.workSummary, escalation: m.escalation, nextSteps: m.nextSteps,
});

export default function TaskTracker({ tab, user, isReviewer, showToast }) {
  const [settings, setSettings] = useState({});
  const [matters, setMatters] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const u1 = listenReportSettings(setSettings);
    // The dashboard always shows the signed-in user's own matters; reports follow the
    // author/management visibility rule (reviewer sees the whole team).
    const u2 = listenReportMatters({ mine: true, email: user.email }, setMatters);
    const u3 = listenWeeklyReports({ mine: !isReviewer, email: user.email }, setReports);
    return () => { u1(); u2(); u3(); };
  }, [user.email, isReviewer]);

  const roster = (settings.roster && settings.roster.length) ? settings.roster : DEFAULT_ROSTER;
  const matterGroups = (settings.matterGroups && settings.matterGroups.length) ? settings.matterGroups : MATTER_GROUPS;

  if (tab === "report")
    return <WeeklyReports reports={reports} isReviewer={isReviewer} user={user} showToast={showToast} />;
  return <Dashboard matters={matters} roster={roster} matterGroups={matterGroups} settings={settings}
    isReviewer={isReviewer} user={user} showToast={showToast} />;
}

/* ----------------------------- Dashboard ----------------------------- */
function Dashboard({ matters, roster, matterGroups, settings, isReviewer, user, showToast }) {
  const guessName = roster.find((n) => n.toLowerCase() === (user.displayName || "").toLowerCase()) || roster[0] || "";
  const [drafter, setDrafter] = useState(guessName);
  const [periodStart, setPeriodStart] = useState(weekAgo());
  const [periodEnd, setPeriodEnd] = useState(today());
  const blank = { matterGroup: "", ticket: "", matterTitle: "", workSummary: "", escalation: "", nextSteps: "" };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [gen, setGen] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => { if (!drafter && guessName) setDrafter(guessName); }, [guessName]); // eslint-disable-line

  const periodMatters = useMemo(
    () => matters.filter((m) => m.periodStart === periodStart && m.periodEnd === periodEnd),
    [matters, periodStart, periodEnd]);
  const visible = showAll ? matters : periodMatters;

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const valid = form.matterGroup && form.matterTitle.trim() && form.workSummary.trim();

  const submitMatter = async () => {
    try {
      const payload = { ...form, drafterName: drafter, periodStart, periodEnd };
      if (editId) { await updateReportMatter(editId, payload, user); showToast("Matter updated"); }
      else { await createReportMatter(payload, user); showToast("Matter added"); }
      setForm(blank); setEditId(null);
    } catch (e) { console.error(e); showToast(e.message || "Save failed"); }
  };
  const edit = (m) => {
    setEditId(m._id);
    setForm({ matterGroup: m.matterGroup || "", ticket: m.ticket || "", matterTitle: m.matterTitle || "",
      workSummary: m.workSummary || "", escalation: m.escalation || "", nextSteps: m.nextSteps || "" });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const del = async (m) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this matter?")) return;
    try { await deleteReportMatter(m._id, user); showToast("Matter deleted"); }
    catch (e) { console.error(e); showToast(e.message || "Delete failed"); }
  };

  const generate = async () => {
    setGenBusy(true);
    try {
      const out = await callReport("report", {
        drafterName: drafter, periodStart, periodEnd, matters: periodMatters.map(pickMatter),
      });
      setGen(out);
    } catch (e) { console.error(e); showToast(e.message || "Generation failed"); }
    setGenBusy(false);
  };
  const saveReport = async (status) => {
    setSaveBusy(true);
    try {
      await createWeeklyReport({
        kind: "personal", drafterName: drafter, periodStart, periodEnd,
        title: `${drafter || user.email} — Weekly Report (${periodStart} to ${periodEnd})`,
        narrative: gen, status,
      }, user);
      showToast(status === "submitted" ? "Submitted — see the Weekly Report tab" : "Saved as draft");
      setGen("");
    } catch (e) { console.error(e); showToast(e.message || "Save failed"); }
    setSaveBusy(false);
  };

  return (
    <>
      <div className="lockmsg">Log every matter you handled this period below, then let Claude draft a
        uniform, house-style weekly report for you to review and submit. The report follows the team&apos;s
        fixed structure and tone automatically. <b>Phase 1</b>: matters are entered manually here — the
        live JIRA LSRM pull (your assigned, handled and commented tickets) will populate this list
        automatically in a later release.</div>

      {/* Reporting period + drafter */}
      <div className="two" style={{ maxWidth: 760 }}>
        <div className="field"><label>Reporting period — start</label>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
        <div className="field"><label>Reporting period — end</label>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
      </div>
      <div className="field" style={{ maxWidth: 372 }}><label>Name (drafter)</label>
        <select value={drafter} onChange={(e) => setDrafter(e.target.value)}>
          {!roster.includes(drafter) && drafter && <option value={drafter}>{drafter}</option>}
          {roster.map((n) => <option key={n} value={n}>{n}</option>)}
        </select></div>

      {/* Add / edit a matter — mirrors the Microsoft Form */}
      <div className="sectlabel"><span className="t">{editId ? "Edit matter" : "Add a matter"}</span>
        <span className="h">— one entry per JIRA ticket / matter</span></div>
      <div style={{ maxWidth: 760 }}>
        <div className="two">
          <div className="field"><label>Matter Group</label>
            <select value={form.matterGroup} onChange={set("matterGroup")}>
              <option value="">Select…</option>
              {matterGroups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>JIRA Ticket Number</label>
            <input value={form.ticket} onChange={set("ticket")} placeholder="e.g. LSRM-0214" /></div>
        </div>
        <div className="field"><label>Matter Title</label>
          <input value={form.matterTitle} onChange={set("matterTitle")} placeholder="e.g. PES x UBS Bullion Purchase Agreement" /></div>
        <div className="field"><label>Work Summary &amp; Key Changes</label>
          <textarea value={form.workSummary} onChange={set("workSummary")} style={{ minHeight: 96 }}
            placeholder="For the first entry on a matter, give the background and context. For updates, focus on key developments or material changes this period." /></div>
        <div className="field"><label>Escalation / blocker / request for direction <span className="hint" style={{ display: "inline" }}>(optional — promotes the matter to Section A)</span></label>
          <textarea value={form.escalation} onChange={set("escalation")} style={{ minHeight: 70 }}
            placeholder="Issues needing alignment or support, e.g. approval on a clause deviation, interco pricing decision." /></div>
        <div className="field"><label>Next Steps</label>
          <textarea value={form.nextSteps} onChange={set("nextSteps")} style={{ minHeight: 70 }}
            placeholder="Action plans for the coming period." /></div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {editId && <button className="btn ghost" onClick={() => { setForm(blank); setEditId(null); }}>Cancel edit</button>}
          <button className="btn primary" disabled={!valid} onClick={submitMatter}>{editId ? "Update matter" : "+ Add matter"}</button>
        </div>
        {!valid && <div className="hint" style={{ textAlign: "right" }}>Matter Group, Matter Title and Work Summary are required.</div>}
      </div>

      {/* My matters this period */}
      <div className="sectlabel"><span className="t">My matters</span>
        <span className="h">— {showAll ? "all periods" : `${periodStart} to ${periodEnd}`}</span></div>
      <div className="toolbar">
        <span className="chip">{periodMatters.length} in this period</span>
        <button className="btn sm ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show this period only" : "Show all my matters"}</button>
      </div>
      {visible.length === 0 ? (
        <div className="empty"><div className="big">No matters yet.</div>Add the matters you handled this period above.</div>
      ) : visible.map((m) => (
        <div key={m._id} className="qcard">
          <div className="qhead" style={{ cursor: "default" }}>
            <span className="qtype improve">{m.matterGroup || "—"}</span>
            <span className="qtitle">{m.ticket ? `${m.ticket}: ` : ""}{m.matterTitle || "(untitled)"}</span>
            {m.escalation?.trim() && <span className="qstatus pending" title="Has an escalation — routes to Section A">escalation</span>}
            <span className="qmeta">{m.periodStart} → {m.periodEnd}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn sm ghost" onClick={() => edit(m)}>Edit</button>
              <button className="btn sm ghost" onClick={() => del(m)}>Delete</button>
            </span>
          </div>
          <div className="qbody open">
            <div className="cpurpose" style={{ WebkitLineClamp: 99, color: "var(--ink)" }}><b>Work summary.</b> {m.workSummary || "—"}</div>
            {m.escalation?.trim() && <div className="cpurpose" style={{ WebkitLineClamp: 99, color: "var(--ink)" }}><b>Escalation.</b> {m.escalation}</div>}
            {m.nextSteps?.trim() && <div className="cpurpose" style={{ WebkitLineClamp: 99, color: "var(--ink)" }}><b>Next steps.</b> {m.nextSteps}</div>}
          </div>
        </div>
      ))}

      {/* Generate the weekly report */}
      <div className="sectlabel"><span className="t">Generate weekly report</span>
        <span className="h">— Claude drafts your matters in the house style, then you review &amp; submit</span></div>
      {!AI_ASSIST_ENABLED ? (
        <div className="hint">AI generation is turned off for this deployment.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary" disabled={genBusy || periodMatters.length === 0} onClick={generate}>
              {genBusy ? "Drafting…" : `✨ Generate report from ${periodMatters.length} matter${periodMatters.length === 1 ? "" : "s"}`}</button>
            <span className="hint">Working draft — verify before submitting. Not a Legal Department position until reviewed.</span>
          </div>
          {gen && (
            <div style={{ marginTop: 12 }}>
              <div className="field"><label>Proposed report (editable)</label>
                <textarea value={gen} onChange={(e) => setGen(e.target.value)} style={{ minHeight: 360, fontFamily: "var(--mono, monospace)", fontSize: 13 }} /></div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn ghost" disabled={saveBusy} onClick={() => setGen("")}>Discard</button>
                <button className="btn" disabled={saveBusy} onClick={() => saveReport("draft")}>{saveBusy ? "Saving…" : "Save as draft"}</button>
                <button className="btn primary" disabled={saveBusy} onClick={() => saveReport("submitted")}>{saveBusy ? "Saving…" : "Submit →"}</button>
              </div>
            </div>
          )}
        </>
      )}

      {isReviewer && <SettingsPanel settings={settings} user={user} showToast={showToast} />}
    </>
  );
}

/* ---------- Reviewer-only: roster & matter-group management ---------- */
function SettingsPanel({ settings, user, showToast }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState("");
  const [groups, setGroups] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRoster((settings.roster && settings.roster.length ? settings.roster : DEFAULT_ROSTER).join("\n"));
    setGroups((settings.matterGroups && settings.matterGroups.length ? settings.matterGroups : MATTER_GROUPS).join("\n"));
  }, [settings]);
  const save = async () => {
    setBusy(true);
    try {
      await saveReportSettings({
        roster: roster.split("\n").map((s) => s.trim()).filter(Boolean),
        matterGroups: groups.split("\n").map((s) => s.trim()).filter(Boolean),
      }, user);
      showToast("Lists saved");
    } catch (e) { console.error(e); showToast(e.message || "Save failed — reviewer role required"); }
    setBusy(false);
  };
  return (
    <>
      <div className="sectlabel"><span className="t">Manage lists</span>
        <span className="h">— roster &amp; matter groups (Head of Legal)</span></div>
      <button className="btn sm ghost" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Edit roster & matter groups"}</button>
      {open && (
        <div className="two" style={{ maxWidth: 760, marginTop: 12 }}>
          <div className="field"><label>Roster (one name per line)</label>
            <textarea value={roster} onChange={(e) => setRoster(e.target.value)} style={{ minHeight: 140 }} /></div>
          <div className="field"><label>Matter groups (one per line)</label>
            <textarea value={groups} onChange={(e) => setGroups(e.target.value)} style={{ minHeight: 140 }} /></div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save lists"}</button>
          </div>
        </div>
      )}
    </>
  );
}

/* --------------------------- Weekly Report --------------------------- */
function WeeklyReports({ reports, isReviewer, user, showToast }) {
  return (
    <>
      <div className="lockmsg">Submitted and draft weekly reports. {isReviewer
        ? "As Head of Legal you see the whole team's reports and can assemble the combined report from submitted personal drafts."
        : "You see your own reports here."} Every report stays editable and re-savable; each change is recorded in the audit trail.</div>

      {isReviewer && <CombinePanel reports={reports} user={user} showToast={showToast} />}

      {reports.length === 0 ? (
        <div className="empty"><div className="big">No reports yet.</div>Generate one from the Legal Service Request Management dashboard.</div>
      ) : reports.map((r) => (
        <ReportCard key={r._id} r={r} isReviewer={isReviewer} user={user} showToast={showToast} />
      ))}
    </>
  );
}

function CombinePanel({ reports, user, showToast }) {
  const [periodStart, setPeriodStart] = useState(weekAgo());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [busy, setBusy] = useState(false);
  const submitted = reports.filter((r) => r.kind === "personal" && r.status === "submitted"
    && r.periodStart === periodStart && r.periodEnd === periodEnd);
  const assemble = async () => {
    setBusy(true);
    try {
      const out = await callReport("combine", {
        periodStart, periodEnd,
        drafts: submitted.map((r) => ({ drafterName: r.drafterName || r.authorName, narrative: r.narrative })),
      });
      await createWeeklyReport({
        kind: "combined", drafterName: "Legal Team", periodStart, periodEnd,
        title: `Combined Weekly Legal Report (${periodStart} to ${periodEnd})`,
        narrative: out, status: "draft",
      }, user);
      showToast("Combined draft assembled — review below");
    } catch (e) { console.error(e); showToast(e.message || "Assembly failed"); }
    setBusy(false);
  };
  return (
    <>
      <div className="sectlabel"><span className="t">Assemble combined report</span>
        <span className="h">— merge submitted personal drafts for a period</span></div>
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        <span className="chip">{submitted.length} submitted draft{submitted.length === 1 ? "" : "s"}</span>
        <button className="btn primary" disabled={busy || submitted.length === 0} onClick={assemble}>
          {busy ? "Assembling…" : "Assemble combined draft"}</button>
      </div>
    </>
  );
}

function ReportCard({ r, isReviewer, user, showToast }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.narrative || "");
  const [title, setTitle] = useState(r.title || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(r.narrative || ""); setTitle(r.title || ""); }, [r._id]); // eslint-disable-line
  const dirty = text !== (r.narrative || "") || title !== (r.title || "");

  const save = async (status) => {
    setBusy(true);
    try {
      const patch = { narrative: text, title };
      if (status) patch.status = status;
      await updateWeeklyReport(r._id, patch, user);
      showToast(status === "submitted" ? "Submitted" : status === "draft" ? "Moved to draft" : "Saved");
    } catch (e) { console.error(e); showToast(e.message || "Save failed"); }
    setBusy(false);
  };
  const del = async () => {
    if (typeof window !== "undefined" && !window.confirm("Delete this report?")) return;
    try { await deleteWeeklyReport(r._id, user); showToast("Report deleted"); }
    catch (e) { console.error(e); showToast(e.message || "Delete failed"); }
  };

  return (
    <div className="qcard">
      <div className="qhead" onClick={() => setOpen((v) => !v)}>
        <span className={"qtype " + (r.kind === "combined" ? "new" : "improve")}>{r.kind === "combined" ? "Combined" : "Personal"}</span>
        <span className="qtitle">{r.title || "(untitled report)"}</span>
        <span className={"qstatus " + (r.status === "submitted" ? "approved" : "pending")}>{r.status}</span>
        <span className="qmeta">{r.drafterName || r.authorName} · {r.periodStart} → {r.periodEnd}</span>
      </div>
      <div className={"qbody" + (open ? " open" : "")}>
        {open && (
          <>
            <div className="field"><label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="field"><label>Report (editable)</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)}
                style={{ minHeight: 420, fontFamily: "var(--mono, monospace)", fontSize: 13 }} /></div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn sm ghost" disabled={busy} onClick={del}>Delete</button>
              {r.status === "submitted"
                ? <button className="btn sm" disabled={busy} onClick={() => save("draft")}>Move to draft</button>
                : <button className="btn sm primary" disabled={busy} onClick={() => save("submitted")}>Submit</button>}
              <button className="btn" disabled={busy || !dirty} onClick={() => save()}>{busy ? "Saving…" : "Save changes"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
