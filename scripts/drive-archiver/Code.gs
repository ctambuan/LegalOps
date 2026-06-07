/**
 * Legal Operations Workbench — Drive auto-archiver (Google Apps Script)
 * ---------------------------------------------------------------------
 * Purpose: keep the Workbench Drive folder showing ONLY the current PRD, by automatically
 * moving every superseded PRD copy into the "Archived" subfolder. This removes the manual
 * delete/move step that recurs on every "update PRD" — and, unlike the in-app archiver, it
 * also catches the Google Doc published by the Claude/MCP connector (which can create/copy
 * but not move/delete).
 *
 * Why Apps Script (per CLAUDE.md principles):
 *  - SECURITY / org policy: runs as the authorizing user's OWN Google identity — no
 *    service-account key (org policy blocks those), same trust model as the app's reviewer OAuth.
 *  - SUSTAINABILITY: it MOVES, never deletes. Every action is reversible (restore from Archived).
 *  - COST: Apps Script + a time-driven trigger are free; no new paid infra.
 *  - RELIABILITY: idempotent. With 0–1 PRD present it does nothing; safe to run on any schedule.
 *
 * Scope guard: it only ever touches files whose name contains NAME_INCLUDES ("PRD" by default)
 * sitting DIRECTLY in the Workbench folder. Subfolders (including Archived), masters, exports and
 * anything else are left untouched.
 *
 * Setup: see README.md in this folder. TL;DR — paste this into a new script.google.com project,
 * run setup() once (authorize Drive), done.
 */

// ---- Fallback config (prefer Script Properties; these mirror lib/config.js) ----
var DEFAULTS = {
  WORKBENCH_FOLDER_ID: '1EUxfSoMhazorsUNEbSPSqruhukd3Nure', // the "Legal Operations Workbench" folder
  ARCHIVE_FOLDER_ID:   '1kRaTNcs0wMnseEo7XKfXYZmbThMcoVG-', // its "Archived" subfolder (blank => auto-find/create)
  NAME_INCLUDES:       'PRD',  // only files whose name contains this (case-insensitive) are ever moved
  TRIGGER_HOURS:       6       // how often the time-driven trigger runs sweep()
};

function props_() { return PropertiesService.getScriptProperties(); }

function cfg_(key) {
  var v = props_().getProperty(key);
  return (v === null || v === '') ? DEFAULTS[key] : v;
}

/**
 * One-time installer. Writes the folder IDs to Script Properties (so the source has no hard-coded
 * secrets to drift), installs the recurring trigger, and runs a dry-run preview. Authorizes Drive
 * on first run. Safe to re-run (it de-dupes triggers).
 */
function setup() {
  props_().setProperties({
    WORKBENCH_FOLDER_ID: DEFAULTS.WORKBENCH_FOLDER_ID,
    ARCHIVE_FOLDER_ID:   DEFAULTS.ARCHIVE_FOLDER_ID,
    NAME_INCLUDES:       DEFAULTS.NAME_INCLUDES
  }, true);
  installTrigger();
  console.log('setup complete. Trigger installed. Dry-run preview below:');
  return dryRun();
}

/** Install (or re-install) the recurring time-driven trigger for sweep(). */
function installTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('sweep')
    .timeBased()
    .everyHours(Number(cfg_('TRIGGER_HOURS')) || DEFAULTS.TRIGGER_HOURS)
    .create();
  console.log('Trigger installed: sweep() every ' + (cfg_('TRIGGER_HOURS') || DEFAULTS.TRIGGER_HOURS) + 'h.');
}

/** Remove all triggers this script owns (use before uninstalling or to stop the schedule). */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  console.log('All project triggers removed.');
}

/** Preview what a real run WOULD move — changes nothing. */
function dryRun() { return run_(true); }

/** The function the trigger calls: archive superseded PRDs for real. */
function sweep() { return run_(false); }

// ---- core ----------------------------------------------------------------

function run_(dry) {
  var workbenchId = cfg_('WORKBENCH_FOLDER_ID');
  var nameNeedle = (cfg_('NAME_INCLUDES') || 'PRD').toLowerCase();
  var workbench = DriveApp.getFolderById(workbenchId);

  // Collect candidate PRDs sitting directly in the Workbench folder. getFiles() does not descend
  // into subfolders, so the Archived copies are never re-processed.
  var candidates = [];
  var it = workbench.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().toLowerCase().indexOf(nameNeedle) === -1) continue; // scope guard
    candidates.push({
      file: f,
      name: f.getName(),
      score: versionScore_(f.getName()),
      created: f.getDateCreated().getTime()
    });
  }

  if (candidates.length <= 1) {
    var msg = 'Nothing to archive — ' + candidates.length + ' matching file(s) in Workbench.';
    console.log(msg);
    return { kept: candidates[0] ? candidates[0].name : null, archived: [], note: msg, dryRun: !!dry };
  }

  // Keeper = highest semantic version parsed from the name; tie-break by most recently created.
  var keeper = candidates.reduce(function (best, c) {
    if (c.score > best.score) return c;
    if (c.score === best.score && c.created > best.created) return c;
    return best;
  });

  var archive = resolveArchiveFolder_(workbench);
  var archived = [];
  candidates.forEach(function (c) {
    if (c.file.getId() === keeper.file.getId()) return;
    if (dry) { archived.push(c.name); return; }
    var stamped = stampName_(c.name);
    if (stamped !== c.name) { try { c.file.setName(stamped); } catch (e) { /* name stamp is best-effort */ } }
    c.file.moveTo(archive); // single-parent move: leaves Workbench, lands in Archived. Reversible.
    archived.push(stamped);
  });

  var summary = (dry ? '[DRY RUN] would keep ' : 'Kept ') + '"' + keeper.name + '"; ' +
    (dry ? 'would archive ' : 'archived ') + archived.length + ' superseded copy(ies): ' +
    (archived.join(' | ') || '(none)');
  console.log(summary);
  return { kept: keeper.name, archived: archived, note: summary, dryRun: !!dry };
}

/** Resolve the Archived subfolder: configured id, else an existing "Archived", else create one. */
function resolveArchiveFolder_(workbench) {
  var id = cfg_('ARCHIVE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var found = workbench.getFoldersByName('Archived');
  if (found.hasNext()) return found.next();
  return workbench.createFolder('Archived');
}

/** Parse a "vMAJOR.MINOR" tag into a sortable score; -1 when no version is present. */
function versionScore_(name) {
  var m = /v(\d+)\.(\d+)/i.exec(name);
  if (!m) return -1;
  return parseInt(m[1], 10) * 1000 + parseInt(m[2], 10); // e.g. v3.10 -> 3010 > v3.9 -> 3009
}

/** Append a date stamp so the archived copy is self-describing; idempotent. */
function stampName_(name) {
  if (/archived/i.test(name)) return name; // already stamped
  var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  var date = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return name + ' [archived ' + date + ']';
}
