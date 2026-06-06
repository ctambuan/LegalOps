// lib/invite.js — build and send the user-invite email (Team & Access).
// Sent as the signed-in admin via the Gmail API (gmail.send scope) — zero extra cost, no
// third-party email service, and replies flow back to the admin's own inbox. When the scope/flag
// is off, the UI falls back to a copyable invite link instead of calling this.
import { APP_URL, COMPANY_LABEL } from "./config";

const ROLE_LABEL = {
  reviewer: "General Counsel",
  contributor: "Regional Counsel",
};

// Build the invite subject + plain-text body. Mirrors Appendix A of the Company Data PRD.
export function buildInvite({ inviteeEmail, inviteeName, inviterName, role, note }) {
  const subject = `You've been granted access to the ${COMPANY_LABEL} Legal Operations Workbench`;
  const greeting = inviteeName || inviteeEmail;
  const noteBlock = note && note.trim() ? `${note.trim()}\n\n` : "";
  const body =
`Hi ${greeting},

${inviterName} has granted you access to the ${COMPANY_LABEL} Legal Operations Workbench — the Legal Department's internal tool for the clause library, document numbering, approvals and corporate records.

${noteBlock}To get in:
  1. Open ${APP_URL}
  2. Click "Sign in with Google"
  3. Sign in with this exact account: ${inviteeEmail}

Your access level: ${ROLE_LABEL[role] || role}.

Please note: access is restricted to authorised accounts, so you must sign in with the Google account above (${inviteeEmail}) — a different address will not work. There is nothing to install and no separate password to create; your existing Google sign-in is all you need.

If you weren't expecting this, or have any questions, reply to this email before signing in.

— Sent on behalf of the ${COMPANY_LABEL} Legal Department

CONFIDENTIAL & LEGALLY PRIVILEGED. This message and the Workbench are the confidential and legally privileged property of ${COMPANY_LABEL} and its group companies, for authorised internal use only. If you received this in error, please delete it and notify the sender.`;
  return { subject, body };
}

// UTF-8-safe base64url for the RFC 2822 message Gmail expects.
function toBase64Url(str) {
  const utf8 = unescape(encodeURIComponent(str));
  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Send via Gmail REST as the authenticated admin (users/me). `accessToken` carries gmail.send.
export async function sendInviteViaGmail({ accessToken, from, to, subject, body }) {
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: toBase64Url(mime) }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const err = new Error(e?.error?.message || `Gmail send failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
