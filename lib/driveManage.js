// lib/driveManage.js — reviewer-only Drive housekeeping. Lists the Workbench folder's documents and
// moves a superseded file into the "Archived" subfolder, using the reviewer's own OAuth access token
// (broad `drive` scope; gated by DRIVE_MANAGE_ENABLED). No service-account key (org policy blocks
// those); every action happens under the signed-in reviewer's identity and is reversible (a move,
// not a delete).
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function driveFetch(url, opts, accessToken) {
  if (!accessToken) throw new Error("No Google Drive authorisation. Sign in again to grant Drive access.");
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(out?.error?.message || `Drive request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return out;
}

// List non-trashed files directly inside `folderId`, excluding sub-folders, newest first.
export async function listFolderFiles(folderId, accessToken) {
  const q = encodeURIComponent(
    `'${folderId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`
  );
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink)");
  const url =
    `${FILES_URL}?q=${q}&orderBy=modifiedTime desc&pageSize=200&fields=${fields}` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const out = await driveFetch(url, { method: "GET" }, accessToken);
  return out.files || [];
}

// Find (or create) a sub-folder named `name` under `parentId`. Returns its id. Used as a fallback
// when no archive folder id is configured.
export async function ensureArchiveFolder(parentId, accessToken, name = "Archived") {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${name}' and mimeType = '${FOLDER_MIME}' and trashed = false`
  );
  const url =
    `${FILES_URL}?q=${q}&fields=${encodeURIComponent("files(id,name)")}` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const out = await driveFetch(url, { method: "GET" }, accessToken);
  if (out.files && out.files.length) return out.files[0].id;
  const created = await driveFetch(
    `${FILES_URL}?fields=id&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    },
    accessToken
  );
  return created.id;
}

// Move `fileId` out of `fromFolderId` and into `toFolderId` (a Drive parent re-link, not a copy).
export async function moveFileToFolder(fileId, fromFolderId, toFolderId, accessToken) {
  const url =
    `${FILES_URL}/${fileId}?addParents=${toFolderId}&removeParents=${fromFolderId}` +
    `&fields=${encodeURIComponent("id,name,parents")}&supportsAllDrives=true`;
  return driveFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }, accessToken);
}
