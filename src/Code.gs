/**
 * CleanPaste - menu wiring and the top-level flow.
 *
 * onOpen deliberately does nothing but build the menu. It runs in AuthMode.NONE,
 * where document access is not permitted, and any attempt at it there stops the
 * menu from being built at all.
 */

function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Clean selection', 'cleanSelection')
    .addItem('Clean document', 'cleanDocument')
    .addSeparator()
    .addItem('Cleanup options…', 'showSidebar')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
  showSidebar();
}

/** Opens the panel that lets the user choose which cleanups run. */
function showSidebar() {
  var page = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('CleanPaste');
  DocumentApp.getUi().showSidebar(page);
}

/* ------------------------------------------------------------------ *
 * Menu entry points
 * ------------------------------------------------------------------ */

/**
 * The menu runs the four default cleanups and nothing else.
 *
 * Link removal is never part of a menu click. It is the one cleanup that throws
 * information away rather than tidying it, so it has to be asked for explicitly
 * in the panel, where the user can see what they are turning on.
 */
function cleanSelection() {
  cpRunFromMenu('selection');
}

function cleanDocument() {
  cpRunFromMenu('document');
}

function cpRunFromMenu(scope) {
  var result = cpClean(scope, CP_DEFAULTS);

  // Success is silent. The document visibly changed, and a dialog the user has to
  // dismiss after every clean is friction, not feedback.
  if (!result.ok) showMessage(result.message);
  else if (!result.changed) showMessage(MSG.nothingToClean);
}

/* ------------------------------------------------------------------ *
 * Sidebar entry point
 * ------------------------------------------------------------------ */

/**
 * Called from the panel by google.script.run.
 *
 * Returns a plain object, because everything crossing that boundary is serialised.
 */
function runCleanup(scope, options) {
  return cpClean(scope, options);
}

/* ------------------------------------------------------------------ *
 * The flow
 * ------------------------------------------------------------------ */

/**
 * Reads, validates, and only then edits.
 *
 * Every refusal happens before the first mutation, so a selection CleanPaste
 * cannot handle leaves the document untouched and says so.
 */
function cpClean(scope, options) {
  var opts = cpOptions(options);
  var doc = DocumentApp.getActiveDocument();
  var groups;

  try {
    groups = scope === 'selection'
      ? cpSelectionGroups(doc)
      : cpDocumentGroups(cpActiveBody(doc));
  } catch (err) {
    console.error('CleanPaste failed while reading the document: ' + err);
    return { ok: false, changed: false, message: MSG.validationFailed };
  }

  if (scope === 'selection' && groups === null) {
    return { ok: false, changed: false, message: MSG.noSelection };
  }
  if (!groups || !groups.length) {
    return { ok: true, changed: false, stats: cpNewStats() };
  }

  var stats;
  try {
    stats = cpCleanGroups(groups, opts);
  } catch (err) {
    console.error('CleanPaste failed while editing: ' + err);
    return { ok: false, changed: true, message: MSG.mutationFailed };
  }

  return { ok: true, changed: cpStatsTotal(stats) > 0, stats: stats };
}
