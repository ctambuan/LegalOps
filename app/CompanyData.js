// app/CompanyData.js — the Company Data module (the editable master-data + access layer).
// Phase 1 slice: Team & Access (User Management) is live; the other areas are scaffolded per the
// Company Data PRD and land in later phases. User management uses reviewer-gated client writes
// (no Admin SDK — org policy blocks service-account keys); invites send as the admin via Gmail.
"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  listenAllowlist, addAllowlistUser, updateAllowlistAccess, removeAllowlistUser,
  listenCfgEntities, seedCfgEntities, addCfgEntity, saveCfgEntity, archiveCfgEntity,
  listenEntitySub, addEntitySub, saveEntitySub, deleteEntitySub,
  listenCfgProposals, proposeChange, decideCfgProposal,
  listenCfgThresholds, saveCfgThresholds, listenCfgApprovals, saveCfgApproval, seedCfgApprovals,
  listenCfgAgents, addCfgAgent, saveCfgAgent, archiveCfgAgent,
} from "../lib/data";
import { ENTITIES, DEPARTMENTS, DEFAULT_THRESHOLDS, bucketLabel, approverCell } from "../lib/docgen";
import {
  ROLES, roleLabel, normalizeRole,
  canApprove, canEditEntity, canProposeEntity, canCreateEntity, canProposeNewEntity,
} from "../lib/constants";
import { useCompanyData } from "../lib/companyData";
import { ALLOWED_USER_DOMAINS, USER_INVITE_EMAIL_ENABLED, APP_URL, AI_ASSIST_ENABLED } from "../lib/config";
import { buildInvite, sendInviteViaGmail } from "../lib/invite";
import { AGENT_TEMPLATES, AGENT_MODELS, DEFAULT_AGENT_MODEL } from "../lib/agentTemplates";
import { callAssist } from "../lib/assist";

export default function CompanyData({ tab, user, isReviewer, showToast }) {
  if (tab === "team") return <TeamAccess user={user} isReviewer={isReviewer} showToast={showToast} />;
  if (tab === "entities") return <Entities user={user} isReviewer={isReviewer} showToast={showToast} />;
  if (tab === "approval") return <ApprovalPolicy user={user} isReviewer={isReviewer} showToast={showToast} />;
  if (tab === "ai") return <AiKnowledge user={user} isReviewer={isReviewer} showToast={showToast} />;
  if (tab === "changes") return <ChangeRequests user={user} isReviewer={isReviewer} showToast={showToast} />;
  return <Planned tab={tab} />;
}

/* ------------------------------ Team & Access ------------------------------ */
const fmtWhen = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : "—");
const domainOf = (email) => (email.split("@")[1] || "").toLowerCase();
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

const scopeSummary = (r) => {
  const role = normalizeRole(r.role);
  if (role === "gc" || role === "regional") return "All companies (group)";
  const c = r.companies;
  if (c === "all") return "All companies";
  if (Array.isArray(c) && c.length) return c.join(", ");
  return "— none assigned —";
};

function TeamAccess({ user, isReviewer, showToast }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // { mode:'add'|'resend'|'edit', row? }
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!isReviewer) return;
    return listenAllowlist(setRows);
  }, [isReviewer]);

  const me = (user.email || "").toLowerCase();
  const gcCount = useMemo(() => rows.filter((r) => normalizeRole(r.role) === "gc").length, [rows]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !t || [r.email, r.displayName, roleLabel(r.role), r.status].some((v) => String(v || "").toLowerCase().includes(t)));
  }, [rows, q]);

  // isReviewer === isGC; only the General Counsel manages users (owner decision).
  if (!isReviewer) {
    return <div className="lockmsg">Team &amp; Access is restricted to the <b>General Counsel</b>. Ask them to add or change a team member&rsquo;s access.</div>;
  }

  const remove = async (r) => {
    if (r.email === me) { showToast("You cannot remove your own account."); return; }
    if (normalizeRole(r.role) === "gc" && gcCount <= 1) { showToast("Cannot remove the last General Counsel."); return; }
    if (!confirm(`Remove access for ${r.email}? They will be blocked at next sign-in.`)) return;
    setBusy(r.email);
    try { await removeAllowlistUser(r.email, user); showToast(`Access removed for ${r.email}`); }
    catch (e) { console.error(e); showToast(e.message || "Could not remove user"); }
    setBusy("");
  };

  return (
    <>
      <div className="lockmsg">Add a colleague by email and assign their role and the companies they cover. They are
        authorised immediately and sign in with their existing Google account (no account is created for them).
        {USER_INVITE_EMAIL_ENABLED ? " An invitation email is sent automatically from your address." : " Email invites are off, so you'll get a copyable invite link to send them."} Only
        <b> {ALLOWED_USER_DOMAINS.join(" and ")}</b> addresses may be added.</div>

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Search by email, name, role or status…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="chip">{list.length} users</span>
        <button className="btn primary sm" onClick={() => setModal({ mode: "add" })} style={{ marginLeft: "auto" }}>+ Add user</button>
      </div>

      {list.length === 0 ? (
        <div className="empty"><div className="big">No team members yet.</div>Click <b>Add user</b> to authorise your first colleague.</div>
      ) : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Companies</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => {
                const self = r.email === me;
                return (
                  <tr key={r._id}>
                    <td className="mono">{r.email}{self && <span className="chip" style={{ marginLeft: 6 }}>you</span>}</td>
                    <td>{r.displayName || <span style={{ color: "var(--ink3)" }}>—</span>}</td>
                    <td>{roleLabel(r.role)}</td>
                    <td style={{ fontSize: 12 }}>{scopeSummary(r)}</td>
                    <td><span className={"chip" + (r.status === "active" ? " ok" : "")}>{r.status || "invited"}</span></td>
                    <td>{fmtWhen(r.lastSignInAt)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn sm ghost" disabled={self || busy === r.email} onClick={() => setModal({ mode: "edit", row: r })}>Edit access</button>
                      <button className="btn sm ghost" disabled={busy === r.email} onClick={() => setModal({ mode: "resend", row: r })} style={{ marginLeft: 6 }}>Resend</button>
                      <button className="btn sm ghost" disabled={self || busy === r.email} onClick={() => remove(r)} style={{ marginLeft: 6 }}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && <UserModal user={user} mode={modal.mode} row={modal.row} existing={rows} showToast={showToast} onClose={() => setModal(null)} />}
    </>
  );
}

// Company multi-select (tickboxes) for company-scoped roles. Group roles cover all companies.
function CompanyPicker({ value, onChange }) {
  const { entities } = useCompanyData();
  const list = value === "all" ? [] : (Array.isArray(value) ? value : []);
  const toggle = (code) => onChange(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
  return (
    <div className="field">
      <label>Companies in scope</label>
      <div className="tablewrap" style={{ maxHeight: 180, overflowY: "auto", padding: 8 }}>
        {entities.length === 0 ? <div className="hint">No entities yet — add them under Entities first.</div>
          : entities.map((e) => (
            <label key={e._id || e.code} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={list.includes(e.code)} onChange={() => toggle(e.code)} />
              <span>{e.name} <span className="chip" style={{ marginLeft: 4 }}>{e.code}</span></span>
            </label>
          ))}
      </div>
      <div className="hint">{list.length} compan{list.length === 1 ? "y" : "ies"} selected — the user may only act within these.</div>
    </div>
  );
}

// Add a user, resend an invite, or edit an existing user's role + company scope.
function UserModal({ user, mode, row, existing, showToast, onClose }) {
  const { getGoogleAccessToken } = useAuth();
  const isAdd = mode === "add";
  const isResend = mode === "resend";
  const isEdit = mode === "edit";
  const [email, setEmail] = useState(row?.email || "");
  const [displayName, setDisplayName] = useState(row?.displayName || "");
  const [role, setRole] = useState(normalizeRole(row?.role) || "country");
  const [companies, setCompanies] = useState(row?.companies === "all" ? "all" : (Array.isArray(row?.companies) ? row.companies : []));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");

  const e = email.trim().toLowerCase();
  const domainOk = ALLOWED_USER_DOMAINS.includes(domainOf(e));
  const dup = isAdd && existing.some((r) => r.email === e);
  const companyScoped = role === "hol" || role === "country";
  const scopeOk = !companyScoped || (Array.isArray(companies) && companies.length > 0);
  const valid = (isEdit || (validEmail(e) && domainOk && !dup)) && scopeOk;

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
      if (isEdit) {
        await updateAllowlistAccess(row.email, { role, companies }, user);
        showToast(`Access updated for ${row.email}`); onClose(); setBusy(false); return;
      }
      if (isAdd) await addAllowlistUser({ email: e, role, companies, displayName }, user);
      const how = await deliver();
      if (how === "email") { showToast(isResend ? `Invite re-sent to ${e}` : `${e} added — invite emailed`); onClose(); }
      else { showToast(isResend ? `${e} ready — copy the link below` : `${e} added — copy the invite link below`); }
    } catch (err) {
      console.error(err);
      setLink(APP_URL);
      showToast(err.message ? `Saved, but email failed: ${err.message}` : "Saved — use the invite link below");
    }
    setBusy(false);
  };

  const copy = (t) => { navigator.clipboard?.writeText(t); showToast("Invite link copied"); };
  const heading = isResend ? "Resend invite" : isEdit ? "Edit access" : "Add user";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">{heading}</div>
          <div className="ctitle" style={{ fontSize: 19, margin: "5px 0" }}>{(isResend || isEdit) ? row.email : "Authorise a colleague"}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          {isAdd && (
            <div className="field"><label>Work email</label>
              <input value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder={`name@${ALLOWED_USER_DOMAINS[0]}`} />
              {email && !validEmail(e) && <div className="hint" style={{ color: "var(--oxblood)" }}>Enter a valid email address.</div>}
              {email && validEmail(e) && !domainOk && <div className="hint" style={{ color: "var(--oxblood)" }}>Only {ALLOWED_USER_DOMAINS.join(" / ")} addresses can be added.</div>}
              {dup && <div className="hint" style={{ color: "var(--oxblood)" }}>This person is already on the list.</div>}
            </div>
          )}
          {!isResend && (
            <>
              <div className="two">
                {isAdd && <div className="field"><label>Name (optional)</label>
                  <input value={displayName} onChange={(ev) => setDisplayName(ev.target.value)} placeholder="e.g. Jane Counsel" /></div>}
                <div className="field"><label>Role</label>
                  <select value={role} onChange={(ev) => setRole(ev.target.value)}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}{v.scope === "group" ? " · group" : " · per-company"}</option>)}
                  </select></div>
              </div>
              <div className="hint" style={{ marginTop: -4 }}>
                {role === "gc" && "Super-admin: approves everything, manages users, group-wide."}
                {role === "regional" && "Maker across all companies — proposes changes for General Counsel approval."}
                {role === "hol" && "Approves and edits directly, for the assigned companies only."}
                {role === "country" && "Maker for the assigned companies — proposes changes for approval."}
              </div>
              {companyScoped ? <CompanyPicker value={companies} onChange={setCompanies} />
                : <div className="hint">Group-wide role — covers all companies; no per-company selection needed.</div>}
            </>
          )}
          {isAdd && <div className="field"><label>Personal note (optional)</label>
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
          <button className="btn primary" disabled={busy || !valid} onClick={submit}>
            {busy ? "Working…" : isResend ? "Resend invite" : isEdit ? "Save access" : (USER_INVITE_EMAIL_ENABLED ? "Add & send invite" : "Add user")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Entities --------------------------------- */
// Group structure: each entity is classified relative to the group (led by the General Counsel),
// so regional counsels can see and filter the holding(s) vs controlled / non-controlled subsidiaries.
// Multiple holdings are allowed (groups commonly have more than one); classification is a legal
// determination set per entity, never auto-assigned.
const ENTITY_TYPES = [
  { v: "holding", l: "Holding Company" },
  { v: "controlled", l: "Controlled Subsidiary" },
  { v: "non_controlled", l: "Non-Controlled Subsidiary" },
];
const typeLabel = (v) => ENTITY_TYPES.find((t) => t.v === v)?.l || "Unclassified";

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
  const { role, companies } = useAuth();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sel, setSel] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const [proposals, setProposals] = useState([]);
  useEffect(() => listenCfgEntities(setRows), []);
  useEffect(() => listenCfgProposals(setProposals), []);

  const myEmail = (user.email || "").toLowerCase();
  const pendingByTarget = useMemo(() => {
    const m = {}; proposals.forEach((p) => { if (p.status === "pending" && p.targetId) m[p.targetId] = true; }); return m;
  }, [proposals]);
  const myPending = proposals.filter((p) => p.status === "pending" && p.proposerEmail === myEmail).length;
  const reviewPending = proposals.filter((p) => p.status === "pending").length;

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
      && (typeFilter === "all" || (e.entityType || "") === (typeFilter === "unclassified" ? "" : typeFilter))
      && (!t || [e.name, e.code, e.jurisdiction, e.registrationNo].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [rows, q, typeFilter, showArchived]);

  if (sel && sel !== "__new__") {
    const entity = (rows || []).find((e) => e._id === sel);
    if (!entity) { setSel(null); return null; }
    return <EntityDetail entity={entity} user={user} role={role} companies={companies} showToast={showToast} onBack={() => setSel(null)} />;
  }

  if (rows === null) return <div className="lockmsg">Loading entities…</div>;

  return (
    <>
      {rows.length === 0 && (
        <div className="lockmsg" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span>No entities yet. {isReviewer ? "Load the bundled defaults to start, then edit them — or add your own." : "Ask the General Counsel to set up the entity list."}</span>
          {isReviewer && <button className="btn primary sm" disabled={seeding} onClick={seed}>{seeding ? "Loading…" : `Load ${ENTITIES.length} default entities`}</button>}
        </div>
      )}
      {rows.length > 0 && (
        <div className="lockmsg">The group entity register, shared across regional counsel and led by the General Counsel.
          Classify each entity as a <b>Holding Company</b>, <b>Controlled Subsidiary</b> or <b>Non-Controlled Subsidiary</b>
          — open an entity to manage its directors, lines of business and authorized signers.
          Changes you are authorised to make apply directly; otherwise they are submitted as Change Requests for approval.</div>
      )}
      {isReviewer && reviewPending > 0 && <div className="lockmsg" style={{ borderColor: "var(--esc)" }}>{reviewPending} change request{reviewPending > 1 ? "s" : ""} await your review — open <b>Change Requests</b>.</div>}
      {!isReviewer && myPending > 0 && <div className="lockmsg">You have {myPending} proposal{myPending > 1 ? "s" : ""} awaiting General Counsel approval.</div>}
      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
          <input placeholder="Search entities — name, code, jurisdiction…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All classifications</option>
          {ENTITY_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          <option value="unclassified">Unclassified</option>
        </select>
        <span className="chip">{list.length} entities</span>
        <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ marginRight: 6 }} />Show archived</label>
        {(canCreateEntity(role) || canProposeNewEntity(role)) &&
          <button className="btn primary sm" onClick={() => setSel("__new__")} style={{ marginLeft: "auto" }}>{canCreateEntity(role) ? "+ Add entity" : "+ Propose entity"}</button>}
      </div>

      {sel === "__new__" && <EntityProfileModal user={user} role={role} companies={companies} showToast={showToast} existing={rows} onClose={() => setSel(null)} onCreated={(id) => setSel(id)} />}

      {list.length === 0 && rows.length > 0 ? <div className="empty"><div className="big">No matches.</div>Adjust your search.</div> : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr><th>Entity</th><th>Code</th><th>Classification</th><th>Jurisdiction</th><th>Registration</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e._id} onClick={() => setSel(e._id)} style={{ cursor: "pointer" }}>
                  <td><b>{e.name}</b></td>
                  <td className="mono">{e.code}</td>
                  <td>{e.entityType ? <span className={"chip" + (e.entityType === "holding" ? " ok" : "")}>{typeLabel(e.entityType)}</span> : <span style={{ color: "var(--ink3)" }}>Unclassified</span>}{pendingByTarget[e._id] && <span className="chip" style={{ marginLeft: 6 }} title="A change request is pending for this entity">pending</span>}</td>
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

function EntityDetail({ entity, user, role, companies, showToast, onBack }) {
  const [t, setT] = useState("profile");
  const [editProfile, setEditProfile] = useState(false);
  const archived = entity.status === "archived";
  const canEdit = canEditEntity(role, companies, entity.code);   // direct (GC or this company's HoL)
  const canPropose = canProposeEntity(role, companies, entity.code);
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
        {canEdit && <button className="btn sm ghost" onClick={toggleArchive} style={{ marginLeft: "auto" }}>{archived ? "Restore" : "Archive"}</button>}
      </div>

      <div className="tabs2" style={{ marginBottom: 14 }}>
        {TABS.map(([k, l]) => <button key={k} className={"tab2 " + (t === k ? "active" : "")} onClick={() => setT(k)}>{l}</button>)}
      </div>

      {t === "profile" && (
        <div style={{ maxWidth: 640 }}>
          <dl className="kv">
            <div className="kvrow"><dt>Group classification</dt><dd>{entity.entityType ? <span className={"chip" + (entity.entityType === "holding" ? " ok" : "")}>{typeLabel(entity.entityType)}</span> : <span style={{ color: "var(--ink3)" }}>Unclassified</span>}</dd></div>
            {PROFILE_FIELDS.map((f) => (
              <div key={f.k} className="kvrow"><dt>{f.l}</dt><dd>{entity[f.k] || <span style={{ color: "var(--ink3)" }}>—</span>}</dd></div>
            ))}
          </dl>
          {(canEdit || canPropose) && <button className="btn primary sm" onClick={() => setEditProfile(true)}>{canEdit ? "Edit profile" : "Propose edit"}</button>}
          {editProfile && <EntityProfileModal user={user} role={role} companies={companies} showToast={showToast} editing={entity} onClose={() => setEditProfile(false)} />}
        </div>
      )}
      {t === "directors" && <SubTable entityId={entity._id} sub="directors" columns={DIRECTOR_COLS} label="director" canEdit={canEdit} user={user} showToast={showToast} />}
      {t === "lob" && <SubTable entityId={entity._id} sub="lob" columns={LOB_COLS} label="line of business" canEdit={canEdit} user={user} showToast={showToast} />}
      {t === "signers" && <SubTable entityId={entity._id} sub="signers" columns={SIGNER_COLS} label="signer" canEdit={canEdit} user={user} showToast={showToast} />}
    </>
  );
}

// Create or edit an entity profile (code is the doc id — editable only on create).
// Regional Counsel submit a proposal for the General Counsel to approve; the GC saves directly.
function EntityProfileModal({ user, role, companies, showToast, editing, existing = [], onClose, onCreated }) {
  const [code, setCode] = useState(editing?.code || "");
  const [f, setF] = useState(() => {
    const init = { entityType: editing?.entityType || "" };
    PROFILE_FIELDS.forEach((x) => (init[x.k] = editing?.[x.k] || "")); return init;
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const dup = !editing && existing.some((e) => e._id === code.trim());
  const valid = (editing || (code.trim() && !dup)) && f.name.trim();
  // Direct write if the user is an approver for this company (edit) or GC (create); else propose.
  const direct = editing ? canEditEntity(role, companies, editing.code) : canCreateEntity(role);

  const save = async () => {
    setBusy(true);
    try {
      if (direct) {
        if (editing) { await saveCfgEntity(editing._id, f, user); showToast("Entity updated"); onClose(); }
        else { const id = await addCfgEntity({ ...f, code: code.trim() }, user); showToast("Entity added"); onClose(); onCreated?.(id); }
      } else if (editing) {
        const before = { entityType: editing.entityType || "" };
        PROFILE_FIELDS.forEach((x) => (before[x.k] = editing[x.k] || ""));
        await proposeChange({ domain: "entity", action: "update", targetId: editing._id, company: editing.code, label: editing.name, before, after: f }, user);
        showToast("Submitted for approval"); onClose();
      } else {
        await proposeChange({ domain: "entity", action: "create", company: code.trim(), label: f.name, after: { ...f, code: code.trim() } }, user);
        showToast("Submitted for approval"); onClose();
      }
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
          <div className="field"><label>Group classification</label>
            <select value={f.entityType} onChange={set("entityType")}>
              <option value="">Unclassified</option>
              {ENTITY_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            <div className="hint">Holding, controlled or non-controlled subsidiary — the group-structure view for regional counsel.</div>
          </div>
          {PROFILE_FIELDS.map((x) => (
            <div className="field" key={x.k}><label>{x.l}{x.req ? "" : " (optional)"}</label>
              <input value={f[x.k]} onChange={set(x.k)} /></div>
          ))}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !valid} onClick={save}>
            {busy ? "Working…" : direct ? (editing ? "Save" : "Add entity") : "Submit for approval"}</button>
        </div>
      </div>
    </div>
  );
}

// Generic add/edit/delete table for a per-entity subcollection.
function SubTable({ entityId, sub, columns, label, canEdit, user, showToast }) {
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
        {canEdit && <button className="btn primary sm" onClick={() => setEdit({})} style={{ marginLeft: "auto" }}>+ Add {label}</button>}
      </div>
      {rows.length === 0 ? <div className="empty"><div className="big">None yet.</div>{canEdit ? `Click “Add ${label}”.` : "Nothing recorded."}</div> : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr>{columns.map((c) => <th key={c.k}>{c.l}</th>)}{canEdit && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  {columns.map((c) => <td key={c.k} className={c.type === "number" ? "mono" : ""}>{r[c.k] || <span style={{ color: "var(--ink3)" }}>—</span>}</td>)}
                  {canEdit && <td style={{ whiteSpace: "nowrap" }}>
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

/* ------------------------------ Change Requests ------------------------------ */
const ACTION_LABEL = { create: "New entity", update: "Edit entity", archive: "Archive entity" };
const FIELD_LABEL = { code: "Code", entityType: "Classification", ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f.k, f.l])) };
const fieldVal = (k, v) => (k === "entityType" ? typeLabel(v) : (v || "—"));

function changedFields(p) {
  const a = p.after || {}, b = p.before || {};
  if (p.action === "create") return Object.keys(a).filter((k) => a[k] !== "" && a[k] != null).map((k) => ({ k, before: null, after: a[k] }));
  if (p.action === "update") {
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
    return keys.filter((k) => (b[k] || "") !== (a[k] || "")).map((k) => ({ k, before: b[k], after: a[k] }));
  }
  return [];
}

function ChangeRequests({ user, isReviewer, showToast }) {
  const { role, companies } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("pending");
  useEffect(() => listenCfgProposals(setRows), []);

  const r = normalizeRole(role);
  const isApprover = r === "gc" || r === "hol";
  if (!isApprover) return <div className="lockmsg">Change Requests are approved by the <b>General Counsel</b> or a company&rsquo;s <b>Head of Legal</b>. Your own proposals appear on the relevant data tab while they await approval.</div>;

  // An approver only sees the requests they may act on (GC: all; Head of Legal: their companies).
  const mine = rows.filter((p) => canApprove(role, companies, p.company));
  const counts = {
    pending: mine.filter((p) => p.status === "pending").length,
    approved: mine.filter((p) => p.status === "approved").length,
    rejected: mine.filter((p) => p.status === "rejected").length,
  };
  const list = mine.filter((p) => filter === "all" || p.status === filter);
  const meEmail = (user.email || "").toLowerCase();

  return (
    <>
      <div className="lockmsg">Proposed changes to company data, scoped to the companies you cover. Review the before/after, then approve (applies it live) or reject with a note. You cannot approve your own proposal. Every decision is audited.</div>
      <div className="statbar">
        <div className="stat"><div className="n">{counts.pending}</div><div className="l">Pending</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--base)" }}>{counts.approved}</div><div className="l">Approved</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--proh)" }}>{counts.rejected}</div><div className="l">Rejected</div></div>
        <div style={{ marginLeft: "auto" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["pending", "approved", "rejected", "all"].map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
          </select>
        </div>
      </div>
      {list.length === 0 ? <div className="empty"><div className="big">Nothing {filter === "all" ? "here" : filter}.</div>Proposals you can act on land here for review.</div>
        : list.map((p) => <ProposalCard key={p._id} p={p} user={user} isGC={r === "gc"} meEmail={meEmail} showToast={showToast} />)}
    </>
  );
}

function ProposalCard({ p, user, isGC, meEmail, showToast }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const created = p.createdAt?.toDate ? p.createdAt.toDate() : null;
  const fields = changedFields(p);
  const selfProposed = p.proposerEmail === meEmail && !isGC; // separation of duties (GC is the backstop)

  const decide = async (status) => {
    setBusy(true);
    try { await decideCfgProposal(p, status, note, user); showToast(status === "approved" ? "Approved & applied" : "Rejected"); }
    catch (e) { console.error(e); showToast(e.message || "Could not record decision"); }
    setBusy(false);
  };

  return (
    <div className="qcard">
      <div className="qhead">
        <span className={"qtype " + (p.action === "archive" ? "rejected" : "improve")}>{ACTION_LABEL[p.action] || p.action}</span>
        <span className="qtitle">{p.label || p.targetId || "—"}</span>
        {p.company && <span className="chip mono">{p.company}</span>}
        <span className={"qstatus " + p.status}>{p.status}</span>
        <span className="qmeta">{p.proposerName || p.proposerEmail} · {created ? created.toLocaleDateString() : "—"}</span>
      </div>
      <div className="qbody open">
        {p.action === "archive" ? (
          <div className="cpurpose" style={{ WebkitLineClamp: 99, color: "var(--ink)" }}>Proposes to archive this entity (hidden from pickers, retained for references).</div>
        ) : fields.length === 0 ? (
          <div className="hint">No field changes detected.</div>
        ) : (
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
              <tbody>
                {fields.map(({ k, before, after }) => (
                  <tr key={k}>
                    <td>{FIELD_LABEL[k] || k}</td>
                    <td style={{ color: "var(--ink3)" }}>{p.action === "create" ? "—" : fieldVal(k, before)}</td>
                    <td className="add">{fieldVal(k, after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {p.status === "pending" ? (
          selfProposed ? (
            <div className="hint" style={{ marginTop: 10 }}>You proposed this change, so you cannot approve it — another approver or the General Counsel must review it.</div>
          ) : (
            <div className="reviewact" style={{ marginTop: 10 }}>
              <textarea placeholder="Decision note (optional)…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary sm" disabled={busy} onClick={() => decide("approved")}>Approve &amp; apply</button>
              <button className="btn sm" disabled={busy} onClick={() => decide("rejected")}>Reject</button>
            </div>
          )
        ) : p.reviewNote ? (
          <div className="cpurpose" style={{ WebkitLineClamp: 99, fontStyle: "italic", marginTop: 8 }}>Note: {p.reviewNote}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------ Approval Policy ------------------------------ */
// Group-level governance: the USD threshold bands + the per-department approver routing the
// Document Number Generator reads live. GC edits (rules: cfg_thresholds/cfg_approvals are GC-only).
const fmtUsd = (n) => "USD " + Number(n || 0).toLocaleString("en-US");

function ApprovalPolicy({ user, isReviewer, showToast }) {
  const [thr, setThr] = useState(null);     // cfg doc or null (→ defaults)
  const [rows, setRows] = useState([]);     // cfg_approvals overrides (by code)
  const [editDept, setEditDept] = useState(null);
  useEffect(() => listenCfgThresholds(setThr), []);
  useEffect(() => listenCfgApprovals(setRows), []);

  const thresholds = thr && thr.low != null ? { low: Number(thr.low), high: Number(thr.high) } : DEFAULT_THRESHOLDS;
  const overridesByName = useMemo(() => {
    const m = {}; rows.forEach((r) => { m[r.department] = { admin: r.admin, low: r.low, mid: r.mid, high: r.high }; }); return m;
  }, [rows]);
  const seeded = rows.length > 0;

  const seed = async () => {
    try { await seedCfgApprovals(DEPARTMENTS, user); showToast(`Loaded ${DEPARTMENTS.length} department routes`); }
    catch (e) { console.error(e); showToast(e.message || "Could not load defaults"); }
  };

  const bandCols = [
    { k: "admin", l: "Administrative" },
    { k: "low", l: `≤ ${fmtUsd(thresholds.low)}` },
    { k: "mid", l: `${fmtUsd(thresholds.low)} – ${fmtUsd(thresholds.high)}` },
    { k: "high", l: `≥ ${fmtUsd(thresholds.high)} / Unbudgeted` },
  ];

  return (
    <>
      <div className="lockmsg">The approval matrix the Document Number Generator reads live: the USD thresholds and the
        Business Approver for each department by document value. {isReviewer ? "Editable by the General Counsel." : "Read-only for your role — the General Counsel maintains it."}</div>

      <ThresholdEditor thresholds={thresholds} isReviewer={isReviewer} user={user} showToast={showToast} />

      <div className="sectlabel"><span className="t">Approver routing</span><span className="h">— Business Approver by department &amp; document value</span></div>
      {!seeded && (
        <div className="lockmsg" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span>Using the bundled workbook defaults. {isReviewer ? "Load them in to edit." : "The General Counsel can make these editable."}</span>
          {isReviewer && <button className="btn primary sm" onClick={seed}>Load {DEPARTMENTS.length} default routes</button>}
        </div>
      )}
      <div className="tablewrap">
        <table className="dtable">
          <thead><tr><th>Department</th>{bandCols.map((c) => <th key={c.k}>{c.l}</th>)}{isReviewer && <th></th>}</tr></thead>
          <tbody>
            {DEPARTMENTS.map((d) => {
              const cell = approverCell(d.name, overridesByName) || {};
              return (
                <tr key={d.code}>
                  <td><b>{d.name}</b> <span className="chip" style={{ marginLeft: 4 }}>{d.code}</span></td>
                  {bandCols.map((c) => <td key={c.k}>{cell[c.k] || <span style={{ color: "var(--ink3)" }}>—</span>}</td>)}
                  {isReviewer && <td><button className="btn sm ghost" onClick={() => setEditDept({ d, cell })}>Edit</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editDept && <ApproverEditModal dept={editDept.d} cell={editDept.cell} bandCols={bandCols} user={user} showToast={showToast} onClose={() => setEditDept(null)} />}
    </>
  );
}

function ThresholdEditor({ thresholds, isReviewer, user, showToast }) {
  const [low, setLow] = useState(thresholds.low);
  const [high, setHigh] = useState(thresholds.high);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLow(thresholds.low); setHigh(thresholds.high); }, [thresholds.low, thresholds.high]);

  const dirty = Number(low) !== Number(thresholds.low) || Number(high) !== Number(thresholds.high);
  const valid = Number(low) > 0 && Number(high) > Number(low);

  const save = async () => {
    if (!confirm(`Change approval thresholds to ${fmtUsd(low)} and ${fmtUsd(high)}?\n\nThis changes which approver is routed for ALL future agreements. Existing document records keep the approver recorded when they were generated.`)) return;
    setBusy(true);
    try { await saveCfgThresholds({ low, high }, user); showToast("Thresholds updated"); }
    catch (e) { console.error(e); showToast(e.message || "Save failed — General Counsel only"); }
    setBusy(false);
  };

  return (
    <>
      <div className="sectlabel"><span className="t">Value thresholds (USD / annum)</span><span className="h">— the bands that route agreement approvers</span></div>
      <div className="two" style={{ maxWidth: 560 }}>
        <div className="field"><label>Lower band ceiling</label>
          <input type="number" disabled={!isReviewer} value={low} onChange={(e) => setLow(e.target.value)} /></div>
        <div className="field"><label>Upper band ceiling</label>
          <input type="number" disabled={!isReviewer} value={high} onChange={(e) => setHigh(e.target.value)} /></div>
      </div>
      <div className="hint">≤ {fmtUsd(low)} → lower · {fmtUsd(low)}–{fmtUsd(high)} → middle · ≥ {fmtUsd(high)} (or unbudgeted) → highest.</div>
      {isReviewer && !valid && <div className="hint" style={{ color: "var(--oxblood)" }}>Upper ceiling must be greater than the lower, and both above zero.</div>}
      {isReviewer && dirty && valid && (
        <div style={{ marginTop: 8 }}><button className="btn primary sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save thresholds"}</button></div>
      )}
    </>
  );
}

function ApproverEditModal({ dept, cell, bandCols, user, showToast, onClose }) {
  const [f, setF] = useState({ admin: cell.admin || "", low: cell.low || "", mid: cell.mid || "", high: cell.high || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await saveCfgApproval(dept.code, { department: dept.name, departmentCode: dept.code, ...f }, user);
      showToast(`${dept.name} routing saved`); onClose();
    } catch (e) { console.error(e); showToast(e.message || "Save failed — General Counsel only"); }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">Approver routing · {dept.code}</div>
          <div className="ctitle" style={{ fontSize: 19, margin: "5px 0" }}>{dept.name}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          {bandCols.map((c) => (
            <div className="field" key={c.k}><label>{c.l}</label>
              <input value={f[c.k]} onChange={set(c.k)} placeholder="Approver name(s)" /></div>
          ))}
          <div className="hint">Leave a cell blank to fall back to the workbook default for that band.</div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save routing"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ AI & Knowledge ------------------------------ */
// Agents = saved Claude instructions the team can run. GC builds/edits (rules: cfg_agents GC-only);
// any allowlisted user may run one. Server prepends fixed guardrails. Policy Library is Phase 3.
function AiKnowledge({ user, isReviewer, showToast }) {
  const [agents, setAgents] = useState(null);
  const [modal, setModal] = useState(null); // { mode:'add'|'edit'|'try', agent? }
  useEffect(() => listenCfgAgents(setAgents), []);
  const list = (agents || []).filter((a) => a.status !== "archived");

  const archive = async (a) => {
    if (!confirm(`Archive agent "${a.name}"? It will be hidden from the team.`)) return;
    try { await archiveCfgAgent(a._id, true, user); showToast("Agent archived"); }
    catch (e) { console.error(e); showToast(e.message || "Failed"); }
  };

  return (
    <>
      <div className="lockmsg">AI agents are saved instructions the workbench runs on Claude.
        {isReviewer ? " Build and edit them here — test each one before saving." : " Run one with the Try button."}
        {" "}In Phase 3 agents will also retrieve from, and cite, the Policy Library.</div>
      {!AI_ASSIST_ENABLED && <div className="lockmsg" style={{ borderColor: "var(--esc)" }}>AI is disabled by configuration (the deployment&rsquo;s AI key / flag is off). You can manage agents, but Run/Test is unavailable until it is enabled.</div>}

      <div className="toolbar">
        <span className="chip">{list.length} agents</span>
        {isReviewer && <button className="btn primary sm" onClick={() => setModal({ mode: "add" })} style={{ marginLeft: "auto" }}>+ Add agent</button>}
      </div>

      {agents === null ? <div className="lockmsg">Loading…</div>
        : list.length === 0 ? <div className="empty"><div className="big">No agents yet.</div>{isReviewer ? "Click “Add agent” to create your first." : "None configured."}</div> : (
          <div className="grid">
            {list.map((a) => (
              <div key={a._id} className="clausecard" style={{ cursor: "default" }}>
                <div className="ctitle">{a.name}</div>
                <div className="cpurpose">{a.guardrails || (a.instruction || "").slice(0, 120) || "—"}</div>
                <div className="cvariants" style={{ marginTop: 8 }}>
                  <span className="vtag on">{(AGENT_MODELS.find((m) => m.id === a.model)?.label || "Claude Opus 4.8").split(" (")[0]}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {AI_ASSIST_ENABLED && <button className="btn sm primary" onClick={() => setModal({ mode: "try", agent: a })}>Try</button>}
                  {isReviewer && <button className="btn sm ghost" onClick={() => setModal({ mode: "edit", agent: a })}>Edit</button>}
                  {isReviewer && <button className="btn sm ghost" onClick={() => archive(a)}>Archive</button>}
                </div>
              </div>
            ))}
          </div>
        )}

      <div className="sectlabel" style={{ marginTop: 22 }}><span className="t">Policy Library</span><span className="h">— Phase 3</span></div>
      <div className="tbd"><div className="tbdtag">Planned · Phase 3</div><div className="big">Policy Library (RAG)</div>
        <p>Upload policies (group-wide or per company); agents will retrieve and cite them in their answers. See <code>PRD_Company_Data_Settings.md</code> §9 &amp; §11.</p></div>

      {modal?.mode === "try" && <TryAgentModal agent={modal.agent} showToast={showToast} onClose={() => setModal(null)} />}
      {(modal?.mode === "add" || modal?.mode === "edit") && <AgentModal user={user} agent={modal.mode === "edit" ? modal.agent : null} showToast={showToast} onClose={() => setModal(null)} />}
    </>
  );
}

function AgentModal({ user, agent, showToast, onClose }) {
  const editing = !!agent;
  const [name, setName] = useState(agent?.name || "");
  const [templateId, setTemplateId] = useState(agent?.instructionTemplateId || "policy_qa");
  const [instruction, setInstruction] = useState(agent?.instruction
    || AGENT_TEMPLATES.find((t) => t.id === "policy_qa")?.instruction || "");
  const [guardrails, setGuardrails] = useState(agent?.guardrails || AGENT_TEMPLATES.find((t) => t.id === "policy_qa")?.guardrails || "");
  const [model, setModel] = useState(agent?.model || DEFAULT_AGENT_MODEL);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [testing, setTesting] = useState(false);
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");

  const applyTemplate = (id) => {
    setTemplateId(id);
    const t = AGENT_TEMPLATES.find((x) => x.id === id);
    if (t && t.id !== "custom") { setInstruction(t.instruction); setGuardrails(t.guardrails); }
  };
  const runTest = async () => {
    setTesting(true); setErr(""); setOut("");
    try { setOut(await callAssist("agent", { instruction, question: q, model })); }
    catch (e) { setErr(e.message || "Test failed"); }
    setTesting(false);
  };

  const valid = name.trim() && instruction.trim();
  const save = async () => {
    setBusy(true);
    try {
      const data = { name: name.trim(), instructionTemplateId: templateId, instruction: instruction.trim(), guardrails: guardrails.trim(), model, policyScope: "all" };
      if (editing) await saveCfgAgent(agent._id, data, user); else await addCfgAgent(data, user);
      showToast(editing ? "Agent saved" : "Agent created"); onClose();
    } catch (e) { console.error(e); showToast(e.message || "Save failed — General Counsel only"); }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">{editing ? "Edit agent" : "New agent"}</div>
          <div className="ctitle" style={{ fontSize: 19, margin: "5px 0" }}>{name || "Configure an AI agent"}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          <div className="two">
            <div className="field"><label>Agent name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Policy Q&A" /></div>
            <div className="field"><label>Start from template</label>
              <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                {AGENT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
          </div>
          <div className="field"><label>Instruction (the agent&rsquo;s role)</label>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} style={{ minHeight: 130 }}
              placeholder="What should this agent do? How should it behave?" />
            <div className="hint">Fixed safety guardrails (trusted sources only, working-draft, no fabrication) are always applied on top of this.</div>
          </div>
          <div className="two">
            <div className="field"><label>Summary / guardrails (shown on the card)</label>
              <input value={guardrails} onChange={(e) => setGuardrails(e.target.value)} placeholder="One-line description" /></div>
            <div className="field"><label>Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {AGENT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select></div>
          </div>

          {AI_ASSIST_ENABLED && (
            <>
              <div className="sectlabel"><span className="t">Test before saving</span><span className="h">— run it on a sample question</span></div>
              <div className="field">
                <textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the agent a sample question…" style={{ minHeight: 64 }} />
                <div style={{ textAlign: "right", marginTop: 6 }}>
                  <button className="btn sm primary" disabled={testing || !instruction.trim() || !q.trim()} onClick={runTest}>{testing ? "Running…" : "Run test"}</button>
                </div>
              </div>
              {err && <div className="hint" style={{ color: "var(--oxblood)" }}>{err}</div>}
              {out && <div className="note usage"><div className="nlab">Claude — working draft, verify before relying</div>
                <div className="vtext" style={{ whiteSpace: "pre-wrap" }}>{out}</div></div>}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !valid} onClick={save}>{busy ? "Saving…" : editing ? "Save agent" : "Create agent"}</button>
        </div>
      </div>
    </div>
  );
}

function TryAgentModal({ agent, showToast, onClose }) {
  const [q, setQ] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true); setErr(""); setOut("");
    try { setOut(await callAssist("agent", { instruction: agent.instruction, question: q, model: agent.model })); }
    catch (e) { setErr(e.message || "Failed"); }
    setBusy(false);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <div className="cnum">Run agent</div>
          <div className="ctitle" style={{ fontSize: 19, margin: "5px 0" }}>{agent.name}</div>
          {agent.guardrails && <div className="purposenote"><span className="lab">Role</span><span className="txt">{agent.guardrails}</span></div>}
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ paddingTop: 16 }}>
          <div className="field">
            <textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your question…" style={{ minHeight: 90 }} />
            <div style={{ textAlign: "right", marginTop: 6 }}>
              <button className="btn sm primary" disabled={busy || !q.trim()} onClick={run}>{busy ? "Thinking…" : "Ask"}</button>
            </div>
          </div>
          {err && <div className="hint" style={{ color: "var(--oxblood)" }}>{err}</div>}
          {out && <div className="note usage"><div className="nlab">Claude — working draft, verify before relying</div>
            <div className="vtext" style={{ whiteSpace: "pre-wrap" }}>{out}</div></div>}
        </div>
        <div className="mfoot"><button className="btn ghost" onClick={onClose}>Close</button></div>
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
