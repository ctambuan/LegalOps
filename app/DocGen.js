// app/DocGen.js — Document Number Generator feature (Form · Database · Filing Tracker · Settings).
// One unified flow + one Firestore-backed database + one live Google Sheet "source of truth".
// The numbering rules live in lib/docgen.js (faithfully ported from the workbook).
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  listenDocNumbers, createDocNumber, updateDocNumber, listenDocgenSettings, saveDocgenSettings,
  listenDocgenMeta, setDocgenMeta, deleteDocNumber,
} from "../lib/data";
import {
  ENTITIES, DEPARTMENTS, CABINETS, DOC_TYPES, DOC_CATEGORIES, SIGNING_METHODS,
  CURRENCIES, FREQUENCIES, isoFor, annualFactor, toUsd, usdValueBucket,
  seriesForType, buildDocumentNumber, businessApprovers, folderCode,
} from "../lib/docgen";
import { DRIVE_UPLOAD_ENABLED, DRIVE_FOLDER_ID } from "../lib/config";
import { mirrorRegisterToDrive, downloadRegisterCsv, registerSignature } from "../lib/docgenDrive";

const today = () => new Date().toISOString().slice(0, 10);
const fmtInt = (n) => (n || n === 0 ? Number(n).toLocaleString("en-US") : "");
// Display string for a record's value (USD), annotated with budget status.
const fmtValue = (r) => {
  const base = r.usdEquivalent == null ? ""
    : "USD " + Math.round(r.usdEquivalent).toLocaleString("en-US") + (r.valueFrequency === "One time" ? " (one-time)" : "/yr");
  if (r.unbudgeted) return base ? `${base} · Unbudgeted` : "Unbudgeted";
  return base;
};

export default function DocGen({ tab, user, isReviewer, showToast }) {
  const { getDriveAccessToken } = useAuth();
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState({});
  const [meta, setMeta] = useState({});
  const ready = useRef(false);

  useEffect(() => {
    const u1 = listenDocNumbers((r) => { ready.current = true; setRecords(r); });
    const u2 = listenDocgenSettings(setSettings);
    const u3 = listenDocgenMeta(setMeta);
    return () => { u1(); u2(); u3(); };
  }, []);

  // ---- Live Google Sheet sync (automatic, no button) ----
  const lastSig = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    if (!DRIVE_UPLOAD_ENABLED || !ready.current || records.length === 0) return;
    const sig = registerSignature(records);
    if (sig === lastSig.current || meta.sig === sig) { lastSig.current = sig; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const token = await getDriveAccessToken({ silent: true });
        if (!token) return;
        const out = await mirrorRegisterToDrive(records, { accessToken: token, folderId: DRIVE_FOLDER_ID, fileId: meta.fileId });
        lastSig.current = sig;
        await setDocgenMeta({ fileId: out.fileId, sig });
        setMeta((m) => ({ ...m, fileId: out.fileId, sig }));
      } catch (e) { console.error("live Drive sync failed", e); }
    }, 1500);
    return () => timer.current && clearTimeout(timer.current);
  }, [records, meta.fileId, meta.sig, getDriveAccessToken]);

  if (tab === "database") return <Database records={records} isReviewer={isReviewer} user={user} showToast={showToast} />;
  if (tab === "filing") return <Filing records={records} user={user} showToast={showToast} />;
  if (tab === "settings") return <Settings settings={settings} isReviewer={isReviewer} user={user} showToast={showToast} />;
  return <Form records={records} settings={settings} user={user} showToast={showToast} />;
}

/* --------------------------------- Form --------------------------------- */
function Form({ records, settings, user, showToast }) {
  const { getDriveAccessToken } = useAuth();
  const blank = {
    date: today(), pic: settings.defaultPic || "", jira: "", department: "", docType: "",
    category: "", title: "", entity: "", counterparty: "", signingMethod: "Electronic",
    valueCurrency: "USD", valueAmount: "", valueFrequency: "Annually", budgetStatus: "",
  };
  const [f, setF] = useState(blank);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target?.value ?? e }));
  useEffect(() => { setF((p) => (p.pic ? p : { ...p, pic: settings.defaultPic || "" })); }, [settings.defaultPic]);

  // Today's market FX rates (base USD), fetched once and cached server-side.
  const [rates, setRates] = useState(null);
  const [fxDate, setFxDate] = useState(null);
  const [fxError, setFxError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/fxrate");
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Exchange rates unavailable");
        if (alive) { setRates(j.rates); setFxDate(j.date); }
      } catch (e) { if (alive) setFxError(e.message || "Exchange rates unavailable"); }
    })();
    return () => { alive = false; };
  }, []);

  const isPolicy = seriesForType(f.docType) === "POL";
  const isAgreement = f.category === "Agreements or Binding Documents";

  // Value → USD-per-annum equivalent (the figure the approval matrix is tested against).
  const isUnbudgeted = f.budgetStatus === "Unbudgeted";
  const iso = isoFor(f.valueCurrency);
  const usdRaw = rates ? toUsd(f.valueAmount, iso, rates) : null;          // USD of the entered period amount
  const usdForApprover = usdRaw == null ? null : usdRaw * annualFactor(f.valueFrequency); // ×12 if monthly
  // Approver route depends on budget status: Unbudgeted → highest approver; Budgeted → value tier.
  const valueBucket = !isAgreement ? ""
    : isUnbudgeted ? "Unbudgeted or outside approved budget"
    : (usdForApprover != null ? usdValueBucket(usdForApprover) : "");

  const preview = useMemo(() => {
    if (!f.docType || !f.entity) return "";
    if (!isPolicy && (!f.department || !f.jira)) return "";
    return buildDocumentNumber(f, 0).replace(/^\d{3}/, "###");
  }, [f, isPolicy]);
  const approverPreview = businessApprovers({ department: f.department, category: f.category, value: valueBucket, docType: f.docType }, settings.approvers || {});

  // Agreements require an explicit Budgeted/Unbudgeted choice; a Budgeted one also needs a value.
  const agreementValueOk = !isAgreement || (
    f.budgetStatus &&
    (isUnbudgeted || (f.valueCurrency && Number(f.valueAmount) > 0 && f.valueFrequency && usdForApprover != null))
  );
  const valid = f.date && f.docType && f.entity && f.title.trim() &&
    (isPolicy || (f.department && f.jira.trim() && f.counterparty.trim() && f.category && agreementValueOk));

  const generate = async () => {
    setBusy(true);
    if (DRIVE_UPLOAD_ENABLED) getDriveAccessToken().catch(() => {}); // warm Drive grant in the click gesture
    try {
      const rec = {
        date: f.date, pic: f.pic, docType: f.docType, title: f.title.trim(),
        entity: f.entity, signingMethod: f.signingMethod,
        jira: isPolicy ? "" : f.jira.trim(),
        department: isPolicy ? "" : f.department,
        counterparty: isPolicy ? "" : f.counterparty.trim(),
        category: isPolicy ? "" : f.category,
        // value (agreements only)
        valueCurrency: isAgreement ? f.valueCurrency : "",
        valueAmount: isAgreement && f.valueAmount ? Number(f.valueAmount) : null,
        valueFrequency: isAgreement ? f.valueFrequency : "",
        usdEquivalent: isAgreement ? (usdForApprover ?? null) : null,
        budgetStatus: isAgreement ? f.budgetStatus : "",
        unbudgeted: !!(isAgreement && isUnbudgeted),
        fxRate: isAgreement && rates ? (rates[iso] ?? null) : null,
        fxDate: isAgreement ? (fxDate || null) : null,
        valueBucket,
        value: valueBucket, // consumed by businessApprovers in createDocNumber
      };
      const created = await createDocNumber(rec, user, settings);
      setResult(created);
      showToast(`Generated ${created.number}`);
      setF((p) => ({ ...blank, date: p.date, pic: p.pic, department: p.department, docType: p.docType, entity: p.entity }));
    } catch (e) { console.error(e); showToast(e.message || "Generation failed"); }
    setBusy(false);
  };

  const copy = (t) => { navigator.clipboard?.writeText(t); showToast("Document number copied"); };

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="lockmsg">Fill the form and click <b>Generate</b>. The document number is built with the exact
        workbook formula, the running sequence is allocated automatically (no collisions), and the record is stored to
        the live Database{DRIVE_UPLOAD_ENABLED ? " — which keeps a native Google Sheet in Drive updated live" : ""}.
        For agreements, the value is converted to a USD-per-annum equivalent at today&rsquo;s rate to route the approver.</div>

      {result && (
        <div className="resultcard">
          <div className="rlabel">Generated Document Number</div>
          <div className="rnum">
            <span>{result.number}</span>
            <button className="copyb" onClick={() => copy(result.number)}>⧉ Copy</button>
          </div>
          {result.approvers && <div className="rmeta"><b>Business Approvers</b> {result.approvers}</div>}
          <div className="rmeta" style={{ color: "var(--ink3)" }}>Stored to the register · sequence {String(result.seq).padStart(3, "0")} · {result.series} {result.year}</div>
        </div>
      )}

      <div className="two">
        <div className="field"><label>Date of Input</label><input type="date" value={f.date} onChange={set("date")} /></div>
        <div className="field"><label>PIC (initials)</label><input value={f.pic} onChange={set("pic")} placeholder="e.g. CT" /></div>
      </div>

      <div className="two">
        <div className="field"><label>Document Type</label>
          <select value={f.docType} onChange={set("docType")}><option value="">Select…</option>{DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div className="field"><label>Pluang Entity</label>
          <select value={f.entity} onChange={set("entity")}><option value="">Select…</option>{ENTITIES.map((e) => <option key={e.code} value={e.name}>{e.name} ({e.code})</option>)}</select></div>
      </div>

      {!isPolicy && (
        <>
          <div className="two">
            <div className="field"><label>JIRA Number</label><input value={f.jira} onChange={set("jira")} placeholder="e.g. CMD-4847 or 1234" /></div>
            <div className="field"><label>Business Unit</label>
              <select value={f.department} onChange={set("department")}><option value="">Select…</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.name}>{d.name} ({d.code})</option>)}</select></div>
          </div>
          <div className="field"><label>Counterparty Name</label><input value={f.counterparty} onChange={set("counterparty")} placeholder="Full legal name — e.g. PT Tunas Maju Selaras (the number uses TMS)" /></div>
        </>
      )}

      <div className="field"><label>Document Title</label><input value={f.title} onChange={set("title")} placeholder="Exactly as drafted" /></div>

      {!isPolicy && (
        <>
          <div className="field"><label>Document Category</label>
            <select value={f.category} onChange={set("category")}><option value="">Select…</option>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>

          {isAgreement && (
            <div className="valuebox">
              <div className="vbhead">Contract Value <span>— budget status and amount route the approver</span></div>
              <div className="budgetpick">
                <label className={f.budgetStatus === "Budgeted" ? "on" : ""}>
                  <input type="radio" name="budget" checked={f.budgetStatus === "Budgeted"} onChange={() => setF((p) => ({ ...p, budgetStatus: "Budgeted" }))} />
                  Budgeted
                </label>
                <label className={f.budgetStatus === "Unbudgeted" ? "on" : ""}>
                  <input type="radio" name="budget" checked={f.budgetStatus === "Unbudgeted"} onChange={() => setF((p) => ({ ...p, budgetStatus: "Unbudgeted" }))} />
                  Unbudgeted or outside approved budget
                </label>
              </div>
              {!f.budgetStatus && <div className="hint" style={{ marginTop: 0, marginBottom: 12, color: "var(--esc)" }}>Select Budgeted or Unbudgeted — required.</div>}
              <div className="vbgrid">
                <div className="field"><label>Currency</label>
                  <select value={f.valueCurrency} onChange={set("valueCurrency")}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div>
                <div className="field"><label>Amount</label>
                  <input inputMode="numeric" value={fmtInt(f.valueAmount)}
                    onChange={(e) => setF((p) => ({ ...p, valueAmount: e.target.value.replace(/[^\d]/g, "") }))} placeholder="0" /></div>
                <div className="field"><label>Frequency</label>
                  <select value={f.valueFrequency} onChange={set("valueFrequency")}>{FREQUENCIES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              {fxError ? <div className="hint" style={{ color: "var(--oxblood)" }}>⚠ {fxError} — value can’t be converted; use the Unbudgeted route or retry later.</div>
                : usdForApprover != null ? (
                  <div className="vbresult">
                    ≈ <b>USD {Math.round(usdForApprover).toLocaleString("en-US")}</b> {f.valueFrequency === "One time" ? "(one-time fee)" : "per annum"}
                    {fxDate && <span className="hint" style={{ display: "inline", marginLeft: 8 }}>· rate as of {fxDate}</span>}
                  </div>
                ) : <div className="hint">{rates ? "Enter an amount to see the USD equivalent." : "Fetching today’s exchange rates…"}</div>}
              {isUnbudgeted && <div className="hint">Unbudgeted → routes to the highest approver regardless of value.</div>}
            </div>
          )}
        </>
      )}

      <div className="two">
        <div className="field"><label>Signing Method</label>
          <select value={f.signingMethod} onChange={set("signingMethod")}>{SIGNING_METHODS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div />
      </div>

      {(preview || approverPreview) && (
        <div className="previewbox">
          {preview && <div><span className="pl">Preview</span> <code>{preview}</code> <span className="hint" style={{ display: "inline" }}>— sequence assigned on Generate</span></div>}
          {approverPreview && <div style={{ marginTop: 6 }}><span className="pl">Approvers</span> {approverPreview}</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn ghost" onClick={() => { setF(blank); setResult(null); }}>Clear</button>
        <button className="btn primary" disabled={!valid || busy} onClick={generate}>{busy ? "Generating…" : "Generate →"}</button>
      </div>
      {!valid && <div className="hint" style={{ textAlign: "right" }}>{isPolicy ? "Date, type, entity and title are required." : "Date, type, entity, JIRA, business unit, counterparty, title and category are required (agreements also need a value)."}</div>}
    </div>
  );
}

/* ------------------------------- Database ------------------------------- */
const COLS = [
  { k: "number", l: "Document Number" }, { k: "date", l: "Date" }, { k: "pic", l: "PIC" },
  { k: "docType", l: "Type" }, { k: "department", l: "Business Unit" }, { k: "entity", l: "Entity" },
  { k: "counterparty", l: "Counterparty" }, { k: "title", l: "Title" },
  { k: "usdEquivalent", l: "Value (USD)", numeric: true }, { k: "approvers", l: "Approvers" },
  { k: "signingMethod", l: "Signing" }, { k: "folderCode", l: "Folder" },
];

function Database({ records, isReviewer, user, showToast }) {
  const years = useMemo(() => {
    const ys = Array.from(new Set(records.map((r) => r.year).filter(Boolean))).sort((a, b) => b - a);
    const cy = new Date().getFullYear();
    if (!ys.includes(cy)) ys.unshift(cy);
    return ys;
  }, [records]);
  const [year, setYear] = useState(null);
  const activeYear = year ?? years[0];
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ k: "number", dir: "asc" });

  const rows = useMemo(() => {
    let r = records.filter((x) => x.year === activeYear);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) => COLS.some((c) => String(x[c.k] ?? "").toLowerCase().includes(t)) || fmtValue(x).toLowerCase().includes(t));
    }
    const col = COLS.find((c) => c.k === sort.k);
    r = [...r].sort((a, b) => {
      let cmp;
      if (sort.k === "seq" || col?.numeric) cmp = (Number(a[sort.k]) || 0) - (Number(b[sort.k]) || 0);
      else cmp = String(a[sort.k] ?? "").localeCompare(String(b[sort.k] ?? ""), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [records, activeYear, q, sort]);

  const toggleSort = (k) => setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: "asc" }));
  const copy = (t) => { navigator.clipboard?.writeText(t); showToast("Copied"); };
  const remove = async (r) => {
    if (!confirm(`Delete ${r.number}? This cannot be undone.`)) return;
    try { await deleteDocNumber(r._id, r.number, user); showToast("Record deleted"); }
    catch (e) { showToast(e.message || "Delete failed"); }
  };

  return (
    <>
      <div className="toolbar">
        <select value={activeYear} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Filter this year — number, title, counterparty, approver…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="chip">{rows.length} records</span>
        {DRIVE_UPLOAD_ENABLED && <span className="chip ok" title="A native Google Sheet in the Drive folder updates automatically whenever the register changes">↻ Google Sheet syncs live</span>}
        <button className="btn sm ghost" onClick={() => downloadRegisterCsv(records)} title="Download the whole register as CSV">Download CSV ↓</button>
      </div>

      {rows.length === 0 ? <div className="empty"><div className="big">No records for {activeYear}.</div>Generate a number on the Form tab — it appears here instantly.</div> : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr>
              {COLS.map((c) => (
                <th key={c.k} onClick={() => toggleSort(c.k)} className={sort.k === c.k ? "sorted" : ""}>
                  {c.l}{sort.k === c.k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
              <th></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td className="mono">{r.number} <button className="minicopy" title="Copy" onClick={() => copy(r.number)}>⧉</button></td>
                  <td>{r.date}</td><td>{r.pic}</td><td>{r.docType}</td><td>{r.department}</td>
                  <td>{r.entity}</td><td>{r.counterparty}</td>
                  <td className="ttl" title={r.title}>{r.title}</td>
                  <td title={r.unbudgeted ? "Unbudgeted" : (r.valueAmount != null ? `${r.valueCurrency} ${fmtInt(r.valueAmount)} ${r.valueFrequency}` : "")}>{fmtValue(r)}</td>
                  <td title={r.approvers}>{r.approvers}</td><td>{r.signingMethod}</td><td className="mono">{r.folderCode}</td>
                  <td>{isReviewer && <button className="minicopy" title="Delete" onClick={() => remove(r)}>🗑</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------------------------- Filing Tracker ---------------------------- */
// Physical filing only applies to Wet-Ink documents, so this tab shows just those, and lets any
// authorised user record where each one is filed (cabinet · row · folder → Folder Code).
function Filing({ records, user, showToast }) {
  const wet = useMemo(() => records.filter((r) => r.signingMethod === "Wet-Ink"), [records]);
  const years = useMemo(() => {
    const ys = Array.from(new Set(wet.map((r) => r.year).filter(Boolean))).sort((a, b) => b - a);
    const cy = new Date().getFullYear();
    if (!ys.includes(cy)) ys.unshift(cy);
    return ys;
  }, [wet]);
  const [year, setYear] = useState(null);
  const activeYear = year ?? years[0];
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);

  const rows = useMemo(() => {
    let r = wet.filter((x) => x.year === activeYear);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) => ["number", "title", "counterparty", "entity", "folderCode", "cabinet"].some((k) => String(x[k] ?? "").toLowerCase().includes(t)));
    }
    return [...r].sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
  }, [wet, activeYear, q]);

  return (
    <>
      <div className="lockmsg">Filing tracker covers <b>Wet-Ink</b> documents only (the physical originals that need a
        cabinet location). Click <b>Set location</b> on any row to record where it is filed — the Folder Code is built
        automatically and the change syncs to the register and the Google Sheet.</div>
      <div className="toolbar">
        <select value={activeYear} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Filter Wet-Ink docs — number, title, counterparty, cabinet…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="chip">{rows.length} Wet-Ink docs</span>
      </div>

      {rows.length === 0 ? <div className="empty"><div className="big">No Wet-Ink documents for {activeYear}.</div>Only documents generated with Signing Method “Wet-Ink” appear here.</div> : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr>
              <th>Document Number</th><th>Date</th><th>Title</th><th>Counterparty</th><th>Entity</th>
              <th>Cabinet</th><th>Folder Code</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td className="mono">{r.number}</td><td>{r.date}</td>
                  <td className="ttl" title={r.title}>{r.title}</td>
                  <td>{r.counterparty}</td><td>{r.entity}</td>
                  <td>{r.cabinet || <span style={{ color: "var(--ink3)" }}>— not filed —</span>}</td>
                  <td className="mono">{r.folderCode}</td>
                  <td><button className="btn sm ghost" onClick={() => setEdit(r)}>{r.folderCode ? "Edit" : "Set location"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <FilingModal record={edit} user={user} showToast={showToast} onClose={() => setEdit(null)} />}
    </>
  );
}

function FilingModal({ record, user, showToast, onClose }) {
  const [cabinet, setCabinet] = useState(record.cabinet || "");
  const [folderRow, setFolderRow] = useState(record.folderRow ?? "");
  const [folderNumber, setFolderNumber] = useState(record.folderNumber ?? "");
  const [busy, setBusy] = useState(false);
  const preview = folderCode({ cabinet, folderRow, folderNumber });

  const save = async () => {
    setBusy(true);
    try {
      await updateDocNumber(record._id, { cabinet, folderRow, folderNumber, folderCode: preview }, user);
      showToast(preview ? `Filed: ${preview}` : "Filing location cleared");
      onClose();
    } catch (e) { console.error(e); showToast(e.message || "Could not save filing location"); }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">{record.number}</div>
          <div className="ctitle" style={{ fontSize: 19, margin: "5px 0" }}>{record.title}</div>
          <div className="purposenote"><span className="lab">Filing</span><span className="txt">{record.counterparty || record.entity} · Wet-Ink original</span></div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          <div className="field"><label>Cabinet</label>
            <select value={cabinet} onChange={(e) => setCabinet(e.target.value)}><option value="">Select…</option>{CABINETS.map((c) => <option key={c.code} value={c.name}>{c.name} ({c.code})</option>)}</select></div>
          <div className="two">
            <div className="field"><label>Row</label><input value={folderRow} onChange={(e) => setFolderRow(e.target.value)} placeholder="row #" /></div>
            <div className="field"><label>Folder</label><input value={folderNumber} onChange={(e) => setFolderNumber(e.target.value)} placeholder="folder #" /></div>
          </div>
          <div className="previewbox"><span className="pl">Folder Code</span> {preview ? <code>{preview}</code> : <span className="hint" style={{ display: "inline" }}>fill cabinet, row and folder</span>}</div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save filing location"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Settings ------------------------------- */
const APPR_FIELDS = [
  { k: "admin", l: "Administrative" }, { k: "agree25", l: "Agreement ≤ 25k" },
  { k: "agree100", l: "Agreement 25–100k" }, { k: "agreeOver", l: "≥ 100k / Unbudgeted" },
];

function Settings({ settings, isReviewer, user, showToast }) {
  const [draft, setDraft] = useState({ defaultPic: "", approvers: {}, startSeq: {} });
  const [busy, setBusy] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setDraft({ defaultPic: settings.defaultPic || "", approvers: settings.approvers || {}, startSeq: settings.startSeq || {} });
  }, [settings]);

  const setAppr = (dept, field, v) => setDraft((d) => {
    const a = { ...(d.approvers || {}) };
    const row = { ...(a[dept] || {}) };
    if (v.trim()) row[field] = v; else delete row[field];
    if (Object.keys(row).length) a[dept] = row; else delete a[dept];
    return { ...d, approvers: a };
  });

  const save = async () => {
    setBusy(true);
    try { await saveDocgenSettings(draft, user); showToast("Settings saved"); }
    catch (e) { console.error(e); showToast(e.message || "Save failed — reviewer role required"); }
    setBusy(false);
  };

  const cy = new Date().getFullYear();
  const ro = !isReviewer;

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="lockmsg">Approver names and defaults below are used to build every new record. {ro
        ? "These are read-only for your role — ask the Head of Legal to change them."
        : "Edit any approver to override the workbook default for that cell. Leave blank to keep the default (shown as placeholder)."}</div>

      <div className="two" style={{ maxWidth: 560 }}>
        <div className="field"><label>Default PIC initials</label>
          <input value={draft.defaultPic} disabled={ro} onChange={(e) => setDraft((d) => ({ ...d, defaultPic: e.target.value }))} placeholder="e.g. CT" /></div>
        <div />
      </div>

      <div className="sectlabel"><span className="t">Sequence start ({cy})</span><span className="h">— applied only before the first number of a series this year</span></div>
      <div className="two" style={{ maxWidth: 560 }}>
        {["STD", "POL"].map((s) => (
          <div className="field" key={s}><label>{s === "STD" ? "Standard documents" : "Policy documents"}</label>
            <input type="number" disabled={ro} value={draft.startSeq?.[`${cy}__${s}`] ?? ""} placeholder="0"
              onChange={(e) => setDraft((d) => ({ ...d, startSeq: { ...(d.startSeq || {}), [`${cy}__${s}`]: e.target.value } }))} /></div>
        ))}
      </div>

      <div className="sectlabel"><span className="t">Approval matrix</span><span className="h">— Business Approvers by department & document value</span></div>
      <div className="tablewrap">
        <table className="dtable appr">
          <thead><tr><th>Department</th>{APPR_FIELDS.map((c) => <th key={c.k}>{c.l}</th>)}</tr></thead>
          <tbody>
            {DEPARTMENTS.map((d) => (
              <tr key={d.code}>
                <td className="deptname">{d.name} <span className="chip" style={{ marginLeft: 4 }}>{d.code}</span></td>
                {APPR_FIELDS.map((c) => (
                  <td key={c.k}>
                    <input className="apprinput" disabled={ro}
                      value={draft.approvers?.[d.name]?.[c.k] ?? ""} placeholder={d[c.k]}
                      onChange={(e) => setAppr(d.name, c.k, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!ro && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      )}
    </div>
  );
}
