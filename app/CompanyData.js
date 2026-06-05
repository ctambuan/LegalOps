// app/CompanyData.js — the Company Data module (the editable master-data + access layer).
// Phase 1 slice: Team & Access (User Management) is live; the other areas are scaffolded per the
// Company Data PRD and land in later phases. User management uses reviewer-gated client writes
// (no Admin SDK — org policy blocks service-account keys); invites send as the admin via Gmail.
"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { listenAllowlist, addAllowlistUser, updateAllowlistRole, removeAllowlistUser } from "../lib/data";
import { ALLOWED_USER_DOMAINS, USER_INVITE_EMAIL_ENABLED, APP_URL } from "../lib/config";
import { buildInvite, sendInviteViaGmail } from "../lib/invite";

export default function CompanyData({ tab, user, isReviewer, showToast }) {
  if (tab === "team") return <TeamAccess user={user} isReviewer={isReviewer} showToast={showToast} />;
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
