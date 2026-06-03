// app/DriveArchive.js — reviewer-only panel for archiving superseded Workbench documents.
// Lists the files in the main Drive folder and moves a chosen one into the "Archived" subfolder.
// Rendered in the Master & Export tab only when DRIVE_MANAGE_ENABLED (broad `drive` scope) is on.
"use client";
import { useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { DRIVE_FOLDER_ID, DRIVE_ARCHIVE_FOLDER_ID } from "../lib/config";
import { listFolderFiles, ensureArchiveFolder, moveFileToFolder } from "../lib/driveManage";

export default function DriveArchive({ showToast }) {
  const { getDriveAccessToken } = useAuth();
  const [files, setFiles] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Helper: run a Drive call with the cached token, refreshing once on a 401 (expired token).
  const withToken = useCallback(async (fn) => {
    let token = await getDriveAccessToken();
    try { return await fn(token); }
    catch (e) {
      if (e.status === 401) { token = await getDriveAccessToken({ forceRefresh: true }); return await fn(token); }
      throw e;
    }
  }, [getDriveAccessToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await withToken((t) => listFolderFiles(DRIVE_FOLDER_ID, t));
      setFiles(list);
    } catch (e) { console.error(e); showToast(e.message || "Could not list Drive files — see console"); }
    setLoading(false);
  }, [withToken, showToast]);

  const archive = async (f) => {
    if (!window.confirm(
      `Move “${f.name}” into the Archived subfolder?\n\n` +
      `It leaves the main Workbench folder but is not deleted — you can restore it from Archived at any time.`
    )) return;
    setBusyId(f.id);
    try {
      await withToken(async (t) => {
        const archiveId = DRIVE_ARCHIVE_FOLDER_ID || (await ensureArchiveFolder(DRIVE_FOLDER_ID, t));
        return moveFileToFolder(f.id, DRIVE_FOLDER_ID, archiveId, t);
      });
      setFiles((prev) => (prev || []).filter((x) => x.id !== f.id));
      showToast(`Archived: ${f.name}`);
    } catch (e) { console.error(e); showToast(e.message || "Archive failed — see console"); }
    setBusyId(null);
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div className="lockmsg">
        <b>Workbench Drive — archive superseded records.</b> When a new document supersedes an earlier
        version (a revised PRD, an updated master, an old export), move the old one into the
        <b> Archived</b> subfolder so the live folder shows only current records. Files are moved under
        your Google identity and are never deleted — restore them from Archived whenever you like.
      </div>
      <div style={{ display: "flex", gap: 10, margin: "10px 0" }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : files ? "Refresh list ↻" : "List Workbench documents"}
        </button>
      </div>
      {files && files.length === 0 && (
        <div className="empty">
          <div className="big">No files in the Workbench folder.</div>
          Sub-folders (including Archived) are not listed here.
        </div>
      )}
      {files && files.length > 0 && files.map((f) => (
        <div key={f.id} className="masterrow">
          <div style={{ flex: 1 }}>
            <div className="mt">
              {f.webViewLink
                ? <a href={f.webViewLink} target="_blank" rel="noopener noreferrer">{f.name}</a>
                : f.name}
            </div>
            <div className="ms">Modified {new Date(f.modifiedTime).toLocaleString()}</div>
          </div>
          <button className="btn" onClick={() => archive(f)} disabled={busyId === f.id}
            title="Move this file into the Archived subfolder">
            {busyId === f.id ? "Archiving…" : "Archive →"}
          </button>
        </div>
      ))}
    </div>
  );
}
