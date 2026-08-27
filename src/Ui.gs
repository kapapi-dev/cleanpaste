/**
 * Everything CleanPaste says to the user from the server side, and the single
 * way it says it.
 *
 * Google Docs add-ons have no toast, so a modal alert is the fitting choice for
 * the menu path: it is the least machinery that reliably reaches the user. The
 * panel says the same things inline, without a dialog to dismiss.
 */

var MSG = {
  noSelection: {
    title: 'Nothing selected',
    body: 'Select the text you want to clean, or use Clean document to clean the whole tab.'
  },

  nothingToClean: {
    title: 'Already clean',
    body: 'CleanPaste found nothing to change here.'
  },

  /**
   * Shown only for failures raised while reading, before a single edit is made,
   * so the "not been changed" promise is literally true.
   */
  validationFailed: {
    title: 'Clean cancelled',
    body:
      'CleanPaste stopped before changing anything because it could not read the ' +
      'document safely.\n\nYour document has not been changed.'
  },

  /**
   * Shown when something fails midway through editing. It deliberately does NOT
   * claim the document is untouched, because at that point it might not be.
   */
  mutationFailed: {
    title: 'Clean failed',
    body:
      'CleanPaste hit an unexpected error while editing.\n\n' +
      'Press Ctrl+Z (Cmd+Z on Mac) to undo any partial change.'
  }
};

/** Shows one of the MSG entries. */
function showMessage(message) {
  var ui = DocumentApp.getUi();
  ui.alert(message.title, message.body, ui.ButtonSet.OK);
}
