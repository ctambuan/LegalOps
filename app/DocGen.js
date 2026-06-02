// app/DocGen.js — Document Number Generator feature (Form · Database · Settings).
// One unified flow + one Firestore-backed database + one Drive "source of truth" mirror.
// The numbering rules live in lib/docgen.js (faithfully ported from the workbook).
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  listenDocNumbers, createDocNumber, listenDocgenSettings, saveDocgenSettings,
  listenDocgenMeta, setDriveFileId, deleteDocNumber,
} from "../lib/data";
import {
  ENTITIES, DEPARTMENTS, CABINETS, DOC_TYPES, DOC_CATEGORIES, DOC_VALUES,
  SIGNING_METHODS, seriesForType, buildDocumentNumber, businessApprovers, folderCode,
} from "../lib/docgen";
import { DRIVE_UPLOAD_ENABLED, DRIVE_FOLDER_ID } from "../lib/config";
import { mirrorRegisterToDrive, downloadRegisterCsv } from "../lib/docgenDrive";

const today = () => new Date().toISOString().slice(0, 10);

export default function DocGen({ tab, user, isReviewer, showToast }) {
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState({});
  const [meta, setMeta] = useState({});

  useEffect(() => {
    const u1 = listenDocNumbers(setRecords);
    const u2 = listenDocgenSettings(setSettings);
    const u3 = listenDocgenMeta(setMeta);
    return () => { u1(); u2(); u3(); };
  }, []);

  if (tab === "database") return <Database records={records} isReviewer={isReviewer} user={user} showToast={showToast} settings={settings} meta={meta} setMeta={setMeta} />;
  if (tab === "settings") return <Settings settings={settings} records={records} isReviewer={isReviewer} user={user} showToast={showToast} />;
  return <Form records={records} settings={settings} meta={meta} setMeta={setMeta} user={user} showToast={showToast} />;
}

/* ----------------------------- Drive mirror ----------------------------- */
// Best-effort overwrite of the single register file. Never blocks the generate; surfaces a hint.
function useDriveMirror({ meta, setMeta, showToast }) {
  const { getDriveAccessToken } = useAuth();
  return async (allRecords, { silent = true } = {}) => {
    if (!DRIVE_UPLOAD_ENABLED) return;
    try {
      let token = await getDriveAccessToken();
      let out;
      try {
        out = await mirrorRegisterToDrive(allRecords, { accessToken: token, folderId: DRIVE_FOLDER_ID, fileId: meta.fileId });
      } catch (e) {
        if (e.status === 401) { token = await getDriveAccessToken({ forceRefresh: true }); out = await mirrorRegisterToDrive(allRecords, { accessToken: token, folderId: DRIVE_FOLDER_ID, fileId: meta.fileId }); }
        else throw e;
      }
      if (out.fileId && out.fileId !== meta.fileId) { await setDriveFileId(out.fileId); setMeta((m) => ({ ...m, fileId: out.fileId })); }
      if (!silent) showToast(`Google Sheet updated: ${out.file?.name || "saved"}`);
    } catch (e) {
      console.error("Drive mirror failed", e);
      showToast(silent ? "Saved — Drive mirror sync failed (see console)" : (e.message || "Drive sync failed"));
    }
  };
}

/* --------------------------------- Form --------------------------------- */
function Form({ records, settings, meta, setMeta, user, showToast }) {
  const mirror = useDriveMirror({ meta, setMeta, showToast });
  const blank = {
    date: today(), pic: settings.defaultPic || "", jira: "", department: "", docType: "",
    category: "", value: "", title: "", entity: "", counterparty: "", signingMethod: "Electronic",
    cabinet: "", folderRow: "", folderNumber: "",
  };
  const [f, setF] = useState(blank);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target?.value ?? e }));
  // Keep PIC default in sync until the user types their own.
  useEffect(() => { setF((p) => (p.pic ? p : { ...p, pic: settings.defaultPic || "" })); }, [settings.defaultPic]);

  const isPolicy = seriesForType(f.docType) === "POL";
  const isAgreement = f.category === "Agreements or Binding Documents";

  // Live structural preview — the real sequence is allocated atomically on Generate.
  const preview = useMemo(() => {
    if (!f.docType || !f.entity) return "";
    if (!isPolicy && (!f.department || !f.jira)) return "";
    return buildDocumentNumber(f, 0).replace(/^\d{3}/, "###");
  }, [f, isPolicy]);
  const approverPreview = businessApprovers(f, settings.approvers || {});
  const folderPreview = folderCode(f);

  const valid = f.date && f.docType && f.entity && f.title.trim() &&
    (isPolicy || (f.department && f.jira.trim() && f.counterparty.trim()));

  const generate = async () => {
    setBusy(true);
    try {
      const rec = { ...f, jira: f.jira.trim(), title: f.title.trim(), counterparty: f.counterparty.trim() };
      const created = await createDocNumber(rec, user, settings);
      setResult(created);
      showToast(`Generated ${created.number}`);
      // Mirror including the just-created record (the snapshot may lag a beat).
      mirror([...records, { ...rec, ...created }]);
      setF((p) => ({ ...blank, date: p.date, pic: p.pic, department: p.department, docType: p.docType, entity: p.entity }));
    } catch (e) { console.error(e); showToast(e.message || "Generation failed"); }
    setBusy(false);
  };

  const copy = (t) => { navigator.clipboard?.writeText(t); showToast("Document number copied"); };

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="lockmsg">Fill the form and click <b>Generate</b>. The document number is built with the exact
        workbook formula, the running sequence is allocated automatically (no collisions), and the record is stored to
        the live Database{DRIVE_UPLOAD_ENABLED ? " and mirrored to a native Google Sheet in Drive" : ""}. Approvers are
        resolved from the approval matrix in Settings.</div>

      {result && (
        <div className="resultcard">
          <div className="rlabel">Generated Document Number</div>
          <div className="rnum">
            <span>{result.number}</span>
            <button className="copyb" onClick={() => copy(result.number)}>⧉ Copy</button>
          </div>
          {result.approvers && <div className="rmeta"><b>Business Approvers</b> {result.approvers}</div>}
          {result.folderCode && <div className="rmeta"><b>Folder Code</b> {result.folderCode}</div>}
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
          <div className="field"><label>Counterparty Name</label><input value={f.counterparty} onChange={set("counterparty")} placeholder="Full legal name — initials become a segment of the number" /></div>
        </>
      )}

      <div className="field"><label>Document Title</label><input value={f.title} onChange={set("title")} placeholder="Exactly as drafted" /></div>

      {!isPolicy && (
        <div className="two">
          <div className="field"><label>Document Category</label>
            <select value={f.category} onChange={set("category")}><option value="">Select…</option>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label>Document Value {isAgreement ? "" : "(agreements only)"}</label>
            <select value={f.value} onChange={set("value")} disabled={!isAgreement}><option value="">{isAgreement ? "Select…" : "N/A"}</option>{DOC_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
        </div>
      )}

      <div className="two">
        <div className="field"><label>Signing Method</label>
          <select value={f.signingMethod} onChange={set("signingMethod")}>{SIGNING_METHODS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div />
      </div>

      <details className="filing">
        <summary>Filing tracker (optional) — generates a Folder Code</summary>
        <div className="two" style={{ marginTop: 12 }}>
          <div className="field"><label>Cabinet</label>
            <select value={f.cabinet} onChange={set("cabinet")}><option value="">Select…</option>{CABINETS.map((c) => <option key={c.code} value={c.name}>{c.name} ({c.code})</option>)}</select></div>
          <div className="two" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field"><label>Row</label><input value={f.folderRow} onChange={set("folderRow")} placeholder="row #" /></div>
            <div className="field"><label>Folder</label><input value={f.folderNumber} onChange={set("folderNumber")} placeholder="folder #" /></div>
          </div>
        </div>
      </details>

      {(preview || approverPreview) && (
        <div className="previewbox">
          {preview && <div><span className="pl">Preview</span> <code>{preview}</code> <span className="hint" style={{ display: "inline" }}>— sequence assigned on Generate</span></div>}
          {approverPreview && <div style={{ marginTop: 6 }}><span className="pl">Approvers</span> {approverPreview}</div>}
          {folderPreview && <div style={{ marginTop: 6 }}><span className="pl">Folder</span> <code>{folderPreview}</code></div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn ghost" onClick={() => { setF(blank); setResult(null); }}>Clear</button>
        <button className="btn primary" disabled={!valid || busy} onClick={generate}>{busy ? "Generating…" : "Generate →"}</button>
      </div>
      {!valid && <div className="hint" style={{ textAlign: "right" }}>{isPolicy ? "Date, type, entity and title are required." : "Date, type, entity, JIRA, business unit, counterparty and title are required."}</div>}
    </div>
  );
}

/* ------------------------------- Database ------------------------------- */
const COLS = [
  { k: "number", l: "Document Number" }, { k: "date", l: "Date" }, { k: "pic", l: "PIC" },
  { k: "docType", l: "Type" }, { k: "department", l: "Business Unit" }, { k: "entity", l: "Entity" },
  { k: "counterparty", l: "Counterparty" }, { k: "title", l: "Title" }, { k: "approvers", l: "Approvers" },
  { k: "signingMethod", l: "Signing" }, { k: "folderCode", l: "Folder" },
];

function Database({ records, isReviewer, user, showToast, meta, setMeta }) {
  const mirror = useDriveMirror({ meta, setMeta, showToast });
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
  const [syncing, setSyncing] = useState(false);

  const rows = useMemo(() => {
    let r = records.filter((x) => x.year === activeYear);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) => COLS.some((c) => String(x[c.k] ?? "").toLowerCase().includes(t)));
    }
    r = [...r].sort((a, b) => {
      const av = a[sort.k] ?? "", bv = b[sort.k] ?? "";
      const cmp = sort.k === "seq" ? (a.seq - b.seq) : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [records, activeYear, q, sort]);

  const toggleSort = (k) => setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: "asc" }));
  const copy = (t) => { navigator.clipboard?.writeText(t); showToast("Copied"); };
  const syncDrive = async () => { setSyncing(true); await mirror(records, { silent: false }); setSyncing(false); };
  const remove = async (r) => {
    if (!confirm(`Delete ${r.number}? This cannot be undone.`)) return;
    try { await deleteDocNumber(r._id, r.number, user); showToast("Record deleted"); mirror(records.filter((x) => x._id !== r._id)); }
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
        <button className="btn sm ghost" onClick={() => downloadRegisterCsv(records)} title="Download the whole register as CSV">Download CSV ↓</button>
        {DRIVE_UPLOAD_ENABLED && <button className="btn sm" onClick={syncDrive} disabled={syncing} title="Rebuild the native Google Sheet source-of-truth in Drive now">{syncing ? "Syncing…" : "Sync Google Sheet ↑"}</button>}
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

/* ------------------------------- Settings ------------------------------- */
const APPR_FIELDS = [
  { k: "admin", l: "Administrative" }, { k: "agree25", l: "Agreement ≤ 25k" },
  { k: "agree100", l: "Agreement 25–100k" }, { k: "agreeOver", l: "≥ 100k / Unbudgeted" },
];

function Settings({ settings, records, isReviewer, user, showToast }) {
  const [draft, setDraft] = useState({ defaultPic: "", approvers: {}, startSeq: {} });
  const [busy, setBusy] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    // Initialise the editable draft once from the live settings (then let the user edit freely).
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
