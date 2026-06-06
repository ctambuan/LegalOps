// app/CompanyData.js — the Company Data module (the editable master-data + access layer).
// Phase 1 slice: Team & Access (User Management) is live; the other areas are scaffolded per the
// Company Data PRD and land in later phases. User management uses reviewer-gated client writes
// (no Admin SDK — org policy blocks service-account keys); invites send as the admin via Gmail.
"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  listenAllowlist, addAllowlistUser, updateAllowlistRole, removeAllowlistUser,
  listenCfgEntities, seedCfgEntities, addCfgEntity, saveCfgEntity, archiveCfgEntity,
  listenEntitySub, addEntitySub, saveEntitySub, deleteEntitySub,
} from "../lib/data";
import { ENTITIES } from "../lib/docgen";
import { ALLOWED_USER_DOMAINS, USER_INVITE_EMAIL_ENABLED, APP_URL } from "../lib/config";
import { buildInvite, sendInviteViaGmail } from "../lib/invite";

export default function CompanyData({ tab, user, isReviewer, showToast }) {
  if (tab === "team") return <TeamAccess user={user} isReviewer={isReviewer} showToast={showToast} />;
  if (tab === "entities") return <Entities user={user} isReviewer={isReviewer} showToast={showToast} />;
  return <Planned tab={tab} />;
}

/* ------------------------------ Team & Access ------------------------------ */
const fmtWhen = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : "—");
const domainOf = (email) => (email.split("@")[1] || "").toLowerCase();
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

function TeamAccess({ user, isReviewer, showToast }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!isReviewer) return;
    return listenAllowlist(setRows);
  }, [isReviewer]);

  const me = (user.email || "").toLowerCase();
  const reviewerCount = useMemo(() => rows.filter((r) => r.role === "reviewer").length, [rows]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !t || [r.email, r.displayName, r.role, r.status].some((v) => String(v || "").toLowerCase().includes(t)));
  }, [rows, q]);

  if (!isReviewer) {
    return <div className="lockmsg">Team &amp; Access is restricted to the <b>Head of Legal</b>. Ask them to add or change a team member&rsquo;s access.</div>;
  }

  const changeRole = async (r, role) => {
    if (r.email === me) { showToast("You cannot change your own role."); return; }
    if (r.role === "reviewer" && role !== "reviewer" && reviewerCount <= 1) { showToast("Cannot demote the last Head of Legal."); return; }
    setBusy(r.email);
    try { await updateAllowlistRole(r.email, role, user); showToast(`${r.email} is now ${role === "reviewer" ? "Head of Legal" : "Team Member"}`); }
    catch (e) { console.error(e); showToast(e.message || "Could not change role"); }
    setBusy("");
  };

  const remove = async (r) => {
    if (r.email === me) { showToast("You cannot remove your own account."); return; }
    if (r.role === "reviewer" && reviewerCount <= 1) { showToast("Cannot remove the last Head of Legal."); return; }
    if (!confirm(`Remove access for ${r.email}? They will be blocked at next sign-in.`)) return;
    setBusy(r.email);
    try { await removeAllowlistUser(r.email, user); showToast(`Access removed for ${r.email}`); }
    catch (e) { console.error(e); showToast(e.message || "Could not remove user"); }
    setBusy("");
  };

  return (
    <>
      <div className="lockmsg">Add a colleague by email and they are authorised immediately — they sign in with their
        existing Google account (no account is created for them). {USER_INVITE_EMAIL_ENABLED
          ? "An invitation email is sent automatically from your address."
          : "Email invites are off, so you'll get a copyable invite link to send them."} Only
        <b> {ALLOWED_USER_DOMAINS.join(" and ")}</b> addresses may be added.</div>

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Search by email, name, role or status…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="chip">{list.length} users</span>
        <button className="btn primary sm" onClick={() => setAdding(true)} style={{ marginLeft: "auto" }}>+ Add user</button>
      </div>

      {list.length === 0 ? (
        <div className="empty"><div className="big">No team members yet.</div>Click <b>Add user</b> to authorise your first colleague.</div>
      ) : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => {
                const self = r.email === me;
                return (
                  <tr key={r._id}>
                    <td className="mono">{r.email}{self && <span className="chip" style={{ marginLeft: 6 }}>you</span>}</td>
                    <td>{r.displayName || <span style={{ color: "var(--ink3)" }}>—</span>}</td>
                    <td>
                      <select value={r.role || "contributor"} disabled={self || busy === r.email}
                        onChange={(e) => changeRole(r, e.target.value)} style={{ padding: "3px 6px", fontSize: 12 }}>
                        <option value="contributor">Team Member</option>
                        <option value="reviewer">Head of Legal</option>
                      </select>
                    </td>
                    <td><span className={"chip" + (r.status === "active" ? " ok" : "")}>{r.status || "invited"}</span></td>
                    <td>{fmtWhen(r.lastSignInAt)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn sm ghost" disabled={busy === r.email} onClick={() => setAdding({ resend: r })}>Resend invite</button>
                      <button className="btn sm ghost" disabled={self || busy === r.email} onClick={() => remove(r)} style={{ marginLeft: 6 }}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddUserModal user={user} resend={adding.resend} existing={rows} showToast={showToast} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddUserModal({ user, resend, existing, showToast, onClose }) {
  const { getGoogleAccessToken } = useAuth();
  const [email, setEmail] = useState(resend?.email || "");
  const [displayName, setDisplayName] = useState(resend?.displayName || "");
  const [role, setRole] = useState(resend?.role || "contributor");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");

  const e = email.trim().toLowerCase();
  const domainOk = ALLOWED_USER_DOMAINS.includes(domainOf(e));
  const dup = !resend && existing.some((r) => r.email === e);
  const valid = validEmail(e) && domainOk && !dup;

  // Send the invite via the admin's Gmail (if enabled), else surface a copyable link.
  const deliver = async () => {
    const { subject, body } = buildInvite({ inviteeEmail: e, inviteeName: displayName, inviterName: user.displayName || user.email, role, note });
    if (!USER_INVITE_EMAIL_ENABLED) { setLink(APP_URL); return "link"; }
    const token = await getGoogleAccessToken();
    if (!token) { setLink(APP_URL); return "link"; }
    await sendInviteViaGmail({ accessToken: token, from: user.email, to: e, subject, body });
    return "email";
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (!resend) await addAllowlistUser({ email: e, role, displayName }, user);
      const how = await deliver();
      if (how === "email") { showToast(resend ? `Invite re-sent to ${e}` : `${e} added — invite emailed`); onClose(); }
      else { showToast(resend ? `${e} ready — copy the link below` : `${e} added — copy the invite link below`); }
    } catch (err) {
      console.error(err);
      // The user is authorised even if the email failed — make that recoverable, not a dead end.
      setLink(APP_URL);
      showToast(err.message ? `Authorised, but email failed: ${err.message}` : "Authorised — use the invite link below");
    }
    setBusy(false);
  };

  const copy = (t) => { navigator.clipboard?.writeText(t); showToast("Invite link copied"); };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">{resend ? "Resend invite" : "Add user"}</div>
          <div className="ctitle" style={{ fontSize: 19, margin: "5px 0" }}>{resend ? resend.email : "Authorise a colleague"}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          <div className="field"><label>Work email</label>
            <input value={email} disabled={!!resend} onChange={(ev) => setEmail(ev.target.value)} placeholder={`name@${ALLOWED_USER_DOMAINS[0]}`} />
            {email && !validEmail(e) && <div className="hint" style={{ color: "var(--oxblood)" }}>Enter a valid email address.</div>}
            {email && validEmail(e) && !domainOk && <div className="hint" style={{ color: "var(--oxblood)" }}>Only {ALLOWED_USER_DOMAINS.join(" / ")} addresses can be added.</div>}
            {dup && <div className="hint" style={{ color: "var(--oxblood)" }}>This person is already on the list.</div>}
          </div>
          <div className="two">
            <div className="field"><label>Name (optional)</label>
              <input value={displayName} onChange={(ev) => setDisplayName(ev.target.value)} placeholder="e.g. Jane Counsel" /></div>
            <div className="field"><label>Role</label>
              <select value={role} onChange={(ev) => setRole(ev.target.value)}>
                <option value="contributor">Team Member (Contributor)</option>
                <option value="reviewer">Head of Legal (Reviewer)</option>
              </select></div>
          </div>
          {!resend && <div className="field"><label>Personal note (optional)</label>
            <textarea value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Added to the top of the invite email." style={{ minHeight: 64 }} /></div>}

          {link && (
            <div className="previewbox" style={{ marginTop: 4 }}>
              <span className="pl">Invite link</span> <code>{link}</code>
              <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => copy(link)}>⧉ Copy</button>
              <div className="hint">Send this to {e} — they sign in with that Google account.</div>
            </div>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>{link ? "Done" : "Cancel"}</button>
          <button className="btn primary" disabled={busy || (!resend && !valid)} onClick={submit}>
            {busy ? "Working…" : resend ? "Resend invite" : (USER_INVITE_EMAIL_ENABLED ? "Add & send invite" : "Add user")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Entities --------------------------------- */
// Column configs for the three per-entity subtables (drives the generic SubTable + editor).
const DIRECTOR_COLS = [
  { k: "name", l: "Name", req: true }, { k: "title", l: "Title" },
  { k: "appointmentDate", l: "Appointed", type: "date" }, { k: "validity", l: "Validity" },
  { k: "privyId", l: "PrivyID" },
];
const LOB_COLS = [
  { k: "code", l: "Code (KBLI/SSIC)", req: true }, { k: "description", l: "Description" },
  { k: "licenseName", l: "License" }, { k: "issuingAuthority", l: "Issuing authority" },
  { k: "validityPeriod", l: "Validity" },
];
const SIGNER_COLS = [
  { k: "signerName", l: "Signer", req: true }, { k: "title", l: "Title" },
  { k: "maxThresholdUsd", l: "Limit (USD)", type: "number" },
  { k: "validFrom", l: "Valid from", type: "date" }, { k: "validTo", l: "Valid to", type: "date" },
];
const PROFILE_FIELDS = [
  { k: "name", l: "Legal name", req: true }, { k: "jurisdiction", l: "Jurisdiction" },
  { k: "address", l: "Registered address", wide: true },
  { k: "registrationType", l: "Registration type" }, { k: "registrationNo", l: "Registration no." },
  { k: "baseCurrency", l: "Base currency" },
];

function Entities({ user, isReviewer, showToast }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sel, setSel] = useState(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => listenCfgEntities(setRows), []);

  const seed = async () => {
    setSeeding(true);
    try { await seedCfgEntities(ENTITIES, user); showToast(`Loaded ${ENTITIES.length} default entities`); }
    catch (e) { console.error(e); showToast(e.message || "Could not load defaults"); }
    setSeeding(false);
  };

  const list = useMemo(() => {
    const all = rows || [];
    const t = q.trim().toLowerCase();
    return all.filter((e) => (showArchived || e.status !== "archived")
      && (!t || [e.name, e.code, e.jurisdiction, e.registrationNo].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [rows, q, showArchived]);

  if (sel) {
    const entity = (rows || []).find((e) => e._id === sel);
    if (!entity) { setSel(null); return null; }
    return <EntityDetail entity={entity} user={user} isReviewer={isReviewer} showToast={showToast} onBack={() => setSel(null)} />;
  }

  if (rows === null) return <div className="lockmsg">Loading entities…</div>;

  return (
    <>
      {rows.length === 0 && (
        <div className="lockmsg" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span>No entities yet. {isReviewer ? "Load the bundled defaults to start, then edit them — or add your own." : "Ask the Head of Legal to set up the entity list."}</span>
          {isReviewer && <button className="btn primary sm" disabled={seeding} onClick={seed}>{seeding ? "Loading…" : `Load ${ENTITIES.length} default entities`}</button>}
        </div>
      )}
      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Search entities — name, code, jurisdiction…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="chip">{list.length} entities</span>
        <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ marginRight: 6 }} />Show archived</label>
        {isReviewer && <button className="btn primary sm" onClick={() => setSel("__new__")} style={{ marginLeft: "auto" }}>+ Add entity</button>}
      </div>

      {sel === "__new__" && <EntityProfileModal user={user} showToast={showToast} existing={rows} onClose={() => setSel(null)} onCreated={(id) => setSel(id)} />}

      {list.length === 0 && rows.length > 0 ? <div className="empty"><div className="big">No matches.</div>Adjust your search.</div> : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr><th>Entity</th><th>Code</th><th>Jurisdiction</th><th>Registration</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e._id} onClick={() => setSel(e._id)} style={{ cursor: "pointer" }}>
                  <td><b>{e.name}</b></td>
                  <td className="mono">{e.code}</td>
                  <td>{e.jurisdiction || <span style={{ color: "var(--ink3)" }}>—</span>}</td>
                  <td>{e.registrationNo ? `${e.registrationType || ""} ${e.registrationNo}`.trim() : <span style={{ color: "var(--ink3)" }}>—</span>}</td>
                  <td><span className={"chip" + (e.status === "archived" ? "" : " ok")}>{e.status || "active"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function EntityDetail({ entity, user, isReviewer, showToast, onBack }) {
  const [t, setT] = useState("profile");
  const [editProfile, setEditProfile] = useState(false);
  const archived = entity.status === "archived";
  const TABS = [["profile", "Profile"], ["directors", "Directors"], ["lob", "Lines of Business"], ["signers", "Authorized Signers"]];

  const toggleArchive = async () => {
    if (!confirm(archived ? `Restore ${entity.name}?` : `Archive ${entity.name}? It will be hidden from pickers but kept for historical references.`)) return;
    try { await archiveCfgEntity(entity._id, !archived, user); showToast(archived ? "Restored" : "Archived"); }
    catch (e) { showToast(e.message || "Failed"); }
  };

  return (
    <>
      <div className="toolbar">
        <button className="btn sm ghost" onClick={onBack}>← All entities</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{entity.name}</span>
        <span className="chip mono">{entity.code}</span>
        {archived && <span className="chip">archived</span>}
        {isReviewer && <button className="btn sm ghost" onClick={toggleArchive} style={{ marginLeft: "auto" }}>{archived ? "Restore" : "Archive"}</button>}
      </div>

      <div className="tabs2" style={{ marginBottom: 14 }}>
        {TABS.map(([k, l]) => <button key={k} className={"tab2 " + (t === k ? "active" : "")} onClick={() => setT(k)}>{l}</button>)}
      </div>

      {t === "profile" && (
        <div style={{ maxWidth: 640 }}>
          <dl className="kv">
            {PROFILE_FIELDS.map((f) => (
              <div key={f.k} className="kvrow"><dt>{f.l}</dt><dd>{entity[f.k] || <span style={{ color: "var(--ink3)" }}>—</span>}</dd></div>
            ))}
          </dl>
          {isReviewer && <button className="btn primary sm" onClick={() => setEditProfile(true)}>Edit profile</button>}
          {editProfile && <EntityProfileModal user={user} showToast={showToast} editing={entity} onClose={() => setEditProfile(false)} />}
        </div>
      )}
      {t === "directors" && <SubTable entityId={entity._id} sub="directors" columns={DIRECTOR_COLS} label="director" isReviewer={isReviewer} user={user} showToast={showToast} />}
      {t === "lob" && <SubTable entityId={entity._id} sub="lob" columns={LOB_COLS} label="line of business" isReviewer={isReviewer} user={user} showToast={showToast} />}
      {t === "signers" && <SubTable entityId={entity._id} sub="signers" columns={SIGNER_COLS} label="signer" isReviewer={isReviewer} user={user} showToast={showToast} />}
    </>
  );
}

// Create or edit an entity profile (code is the doc id — editable only on create).
function EntityProfileModal({ user, showToast, editing, existing = [], onClose, onCreated }) {
  const [code, setCode] = useState(editing?.code || "");
  const [f, setF] = useState(() => {
    const init = {}; PROFILE_FIELDS.forEach((x) => (init[x.k] = editing?.[x.k] || "")); return init;
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const dup = !editing && existing.some((e) => e._id === code.trim());
  const valid = (editing || (code.trim() && !dup)) && f.name.trim();

  const save = async () => {
    setBusy(true);
    try {
      if (editing) { await saveCfgEntity(editing._id, f, user); showToast("Entity updated"); onClose(); }
      else { const id = await addCfgEntity({ ...f, code: code.trim() }, user); showToast("Entity added"); onClose(); onCreated?.(id); }
    } catch (e) { console.error(e); showToast(e.message || "Save failed"); }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">{editing ? "Edit entity" : "Add entity"}</div>
          <div className="ctitle" style={{ fontSize: 19, margin: "5px 0" }}>{editing ? editing.name : "New entity"}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          <div className="field"><label>Entity code{editing ? " (fixed)" : ""}</label>
            <input value={code} disabled={!!editing} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BSC" />
            {dup && <div className="hint" style={{ color: "var(--oxblood)" }}>That code already exists.</div>}
          </div>
          {PROFILE_FIELDS.map((x) => (
            <div className="field" key={x.k}><label>{x.l}{x.req ? "" : " (optional)"}</label>
              <input value={f[x.k]} onChange={set(x.k)} /></div>
          ))}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !valid} onClick={save}>{busy ? "Saving…" : editing ? "Save" : "Add entity"}</button>
        </div>
      </div>
    </div>
  );
}

// Generic add/edit/delete table for a per-entity subcollection.
function SubTable({ entityId, sub, columns, label, isReviewer, user, showToast }) {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null); // row object, or {} for new
  useEffect(() => listenEntitySub(entityId, sub, setRows), [entityId, sub]);

  const remove = async (r) => {
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
    try { await deleteEntitySub(entityId, sub, r._id, user); showToast("Deleted"); }
    catch (e) { showToast(e.message || "Delete failed"); }
  };

  return (
    <>
      <div className="toolbar">
        <span className="chip">{rows.length} {rows.length === 1 ? label : `${label}s`}</span>
        {isReviewer && <button className="btn primary sm" onClick={() => setEdit({})} style={{ marginLeft: "auto" }}>+ Add {label}</button>}
      </div>
      {rows.length === 0 ? <div className="empty"><div className="big">None yet.</div>{isReviewer ? `Click “Add ${label}”.` : "Nothing recorded."}</div> : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr>{columns.map((c) => <th key={c.k}>{c.l}</th>)}{isReviewer && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  {columns.map((c) => <td key={c.k} className={c.type === "number" ? "mono" : ""}>{r[c.k] || <span style={{ color: "var(--ink3)" }}>—</span>}</td>)}
                  {isReviewer && <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sm ghost" onClick={() => setEdit(r)}>Edit</button>
                    <button className="btn sm ghost" onClick={() => remove(r)} style={{ marginLeft: 6 }}>Delete</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <SubEditModal entityId={entityId} sub={sub} columns={columns} label={label} row={edit._id ? edit : null} user={user} showToast={showToast} onClose={() => setEdit(null)} />}
    </>
  );
}

function SubEditModal({ entityId, sub, columns, label, row, user, showToast, onClose }) {
  const [f, setF] = useState(() => { const init = {}; columns.forEach((c) => (init[c.k] = row?.[c.k] ?? "")); return init; });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const valid = columns.filter((c) => c.req).every((c) => String(f[c.k] || "").trim());

  const save = async () => {
    setBusy(true);
    try {
      if (row) { await saveEntitySub(entityId, sub, row._id, f, user); showToast("Saved"); }
      else { await addEntitySub(entityId, sub, f, user); showToast(`Added ${label}`); }
      onClose();
    } catch (e) { console.error(e); showToast(e.message || "Save failed"); }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">{row ? `Edit ${label}` : `Add ${label}`}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          {columns.map((c) => (
            <div className="field" key={c.k}><label>{c.l}{c.req ? "" : " (optional)"}</label>
              <input type={c.type === "date" ? "date" : c.type === "number" ? "number" : "text"} value={f[c.k]} onChange={set(c.k)} /></div>
          ))}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !valid} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Planned areas (later phases) ------------------------- */
const PLANNED = {
  entities: { name: "Entities · Directors · Lines of Business", phase: "Phase 1", note: "The corporate records spine — every entity with its directors, lines of business and authorized signers. Migrated from lib/docgen.js and made editable." },
  approval: { name: "Approval Policy", phase: "Phase 1", note: "Editable approval thresholds (with impact preview) and per-department routing — replacing the hardcoded matrix." },
  ai: { name: "AI & Knowledge", phase: "Phase 2–3", note: "Agents (templated instructions + test sandbox) and the Policy Library (upload → indexed for retrieval / RAG)." },
  changes: { name: "Change Requests", phase: "Phase 1", note: "The maker-checker queue: counsel propose edits, the Head of Legal approves with a side-by-side diff." },
};
function Planned({ tab }) {
  const p = PLANNED[tab] || PLANNED.entities;
  return (
    <div className="tbd">
      <div className="tbdtag">Planned · {p.phase}</div>
      <div className="big">{p.name}</div>
      <p>{p.note} See <code>PRD_Company_Data_Settings.md</code>. <b>Team &amp; Access</b> is the live slice today — select it from the left.</p>
    </div>
  );
}
