// lib/driveUpload.js — upload generated files into the Drive folder using the reviewer's own
// Google OAuth access token (drive.file scope). No service-account key (org policy blocks those);
// files are created under the signed-in user's identity.
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Generic uploader: any blob + explicit mime type. Used for both the .docx master and the
// full-playbook PDF.
export async function uploadToDrive(blob, filename, mimeType, accessToken, folderId) {
  if (!accessToken) throw new Error("No Google Drive authorisation. Sign in again to grant Drive access.");
  const metadata = { name: filename, mimeType, parents: folderId ? [folderId] : undefined };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob, filename);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = out?.error?.message || `Drive upload failed (${res.status}).`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return out; // { id, name, webViewLink }
}

// Backward-compatible helper for the .docx master export.
export function uploadDocxToDrive(blob, filename, accessToken, folderId) {
  return uploadToDrive(blob, filename, DOCX_MIME, accessToken, folderId);
}
