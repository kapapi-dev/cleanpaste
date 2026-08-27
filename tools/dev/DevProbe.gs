/**
 * Development probe. NEVER pushed to the released project.
 *
 * `node tools/push.mjs --dev` appends this file after Code.gs, so its
 * showSidebar() wins and the add-on menu opens the probe panel instead of the
 * real one. That means the shipped source needs no dev hook at all, and the
 * released project is byte for byte what the tests ran against.
 *
 * What it is for: Apps Script's document behaviour has to be measured, not
 * assumed. Whether a soft line break really is U+000B, whether deleteText will
 * empty a run, whether setForegroundColor accepts null -- the answers decide how
 * DocumentClean.gs is written, and guessing them is how documents get damaged.
 */

/**
 * Replaces the real menu while the probe is pushed.
 *
 * The probe is driven from the Docs menu rather than from a panel because
 * HtmlService serves panels in a cross-origin sandboxed iframe, and synthetic
 * clicks from browser automation do not reach inside one. Menu items are native
 * Docs UI and are clickable, so this is the surface the harness can actually use.
 *
 * Results are never rendered in a dialog either. Each action writes into the
 * document, and the document is then exported as HTML through the Drive API --
 * which records every bold run, link, list and table exactly, rather than relying
 * on reading a screenshot.
 */
function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Clean selection', 'cleanSelection')
    .addItem('Clean document', 'cleanDocument')
    .addSeparator()
    .addItem('Cleanup options…', 'showSidebar')
    .addSeparator()
    .addItem('Dev: build fixture', 'devBuild')
    .addItem('Dev: measure behaviour', 'devMeasureIntoDoc')
    .addItem('Dev: inspect char codes', 'devInspect')
    .addItem('Dev: clean (defaults)', 'devCleanDefaults')
    .addItem('Dev: clean + remove links', 'devCleanLinks')
    .addToUi();
}

/** Runs the same call the real panel makes, with the default options. */
function devCleanDefaults() {
  cpClean('document', null);
}

/** Runs the same call the real panel makes, with link removal turned on. */
function devCleanLinks() {
  cpClean('document', {
    spacing: true, blankLines: true, hidden: true, lineBreaks: true, links: true
  });
}

/** Writes the measurements into the document so they can be exported and read. */
function devMeasureIntoDoc() {
  var body = devBody();
  body.clear();
  body.appendParagraph('--- end sentinel, never removed ---');
  var lines = devMeasure().split('\n');
  body.clear();
  for (var i = 0; i < lines.length; i++) body.appendParagraph(lines[i]);
}

/* ------------------------------------------------------------------ *
 * Building the fixture document
 * ------------------------------------------------------------------ */

var DEV_BR = '\u000D'; // what Google Docs stores for Shift+Enter, measured
var DEV_ZWSP = '\u200B';
var DEV_NBSP = '\u00A0';
var DEV_SHY = '\u00AD';

/**
 * Rebuilds the test document from scratch.
 *
 * Every case listed in TESTING.md appears here, and each one is built with real
 * Docs elements -- real bold runs, real links, real list items, a real table --
 * so that formatting preservation is tested against the thing itself rather than
 * against a simulation of it.
 */
function devBuild() {
  var body = devBody();
  body.clear();

  var p;

  // --- Headings and plain prose ---------------------------------------------
  body.appendParagraph('CleanPaste test document')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);

  body.appendParagraph('1. Plain wrapped paragraph')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph('Under the terms of the agreement the supplier');
  body.appendParagraph('shall deliver the goods within thirty days of');
  body.appendParagraph('receiving a written order from the buyer.');

  // --- Formatting that must survive -----------------------------------------
  body.appendParagraph('2. Mixed formatting')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  // Formatting is applied by character offset after the text exists. Appending a
  // run and calling setBold on what appendText returns does NOT bold just that
  // run -- Apps Script folds appended text into one Text element, so the bold
  // spreads over everything appended so far. That was observed in an export.
  var mixed = body.appendParagraph(
    'The word bold  and the word  italic and both together must survive a clean.');
  devMark(mixed, 'bold', true, false);
  devMark(mixed, 'italic', false, true);
  devMark(mixed, 'both together', true, true);

  var linked = body.appendParagraph(
    'A link to the documentation sits inside this sentence, which is long enough.');
  var linkText = linked.editAsText();
  var linkStart = linked.getText().indexOf('the documentation');
  linkText.setLinkUrl(linkStart, linkStart + 'the documentation'.length - 1,
                      'https://example.com/docs');

  // --- Soft line breaks (Shift+Enter), the PDF paste shape ------------------
  body.appendParagraph('3. Soft line breaks')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph(
    'The committee reviewed the submitted proposal' + DEV_BR +
    'and agreed to postpone the final decision.' + DEV_BR +
    'Measurements confirmed the improved perfor-' + DEV_BR +
    'mance of the redesigned engine assembly.');

  // --- Things that must NOT be joined ---------------------------------------
  body.appendParagraph('4. Must not be joined')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph('Northfield Logistics Limited' + DEV_BR +
                       'Unit 4, Hollowbrook Estate' + DEV_BR +
                       'Manchester M1 4XY');

  body.appendParagraph('Payment Terms And Conditions');
  body.appendParagraph('Invoices are due thirty days after delivery of the goods.');

  // --- Lists ----------------------------------------------------------------
  body.appendParagraph('5. Lists')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  var bullet1 = body.appendListItem('Review the quarterly figures  before the meeting');
  bullet1.setGlyphType(DocumentApp.GlyphType.BULLET);
  var bullet2 = body.appendListItem('Circulate the agenda to every attending member');
  bullet2.setListId(bullet1).setGlyphType(DocumentApp.GlyphType.BULLET);
  var nested = body.appendListItem('A nested item that is indented one level');
  nested.setListId(bullet1).setGlyphType(DocumentApp.GlyphType.BULLET).setNestingLevel(1);

  var number1 = body.appendListItem('First numbered step of the documented procedure');
  number1.setGlyphType(DocumentApp.GlyphType.NUMBER);
  body.appendListItem('Second numbered step of the documented procedure')
      .setListId(number1).setGlyphType(DocumentApp.GlyphType.NUMBER);

  // --- Blank lines ----------------------------------------------------------
  body.appendParagraph('6. Blank lines')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph('Before the blanks.');
  body.appendParagraph('');
  body.appendParagraph('');
  body.appendParagraph('');
  body.appendParagraph('After the blanks.');
  body.appendParagraph('');
  body.appendParagraph('A single blank line above this one must survive.');

  // --- Hidden characters, whitespace, Unicode -------------------------------
  body.appendParagraph('7. Hidden characters and whitespace')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph('   Leading and trailing spaces.   ');
  body.appendParagraph('Tabs\there\tand\tthere.');
  body.appendParagraph('Zero' + DEV_ZWSP + 'width' + DEV_ZWSP + ' and non' + DEV_NBSP +
                       'breaking' + DEV_NBSP + 'spaces and a soft' + DEV_SHY + 'hyphen.');
  body.appendParagraph('Total: $1,234.56 (up 3.2%) — see https://example.com/a__b?q=1 .');
  body.appendParagraph('const x = fn(a, b);');
  body.appendParagraph('👨‍👩‍👧 family emoji must survive.');

  // --- Korean ---------------------------------------------------------------
  body.appendParagraph('8. Korean')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph('위원회는 제출된 제안서를 충분히 검토한 결과 다음과 같은' + DEV_BR +
                       '결론에 도달하였다.');
  body.appendParagraph('한국어    문장의    공백도    정리된다.');

  // --- Table ----------------------------------------------------------------
  body.appendParagraph('9. Table')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  var table = body.appendTable([
    ['Item', 'Amount'],
    ['Widgets  with  double  spaces', '1,200'],
    ['A cell line that is quite long indeed' + DEV_BR + 'and continues here', '340']
  ]);
  table.getCell(1, 0).getChild(0).asParagraph().editAsText().setBold(0, 6, true);

  return 'built';
}

/** Applies bold/italic to one word by offset, leaving its neighbours untouched. */
function devMark(paragraph, needle, bold, italic) {
  var text = paragraph.editAsText();
  var start = text.getText().indexOf(needle);
  if (start < 0) return;
  var end = start + needle.length - 1;
  if (bold) text.setBold(start, end, true);
  if (italic) text.setItalic(start, end, true);
}

/** The body of the tab the probe is looking at. */
function devBody() {
  var doc = DocumentApp.getActiveDocument();
  var tab = doc.getActiveTab();
  if (tab) {
    try { return tab.asDocumentTab().getBody(); } catch (err) { /* fall through */ }
  }
  return doc.getBody();
}

/* ------------------------------------------------------------------ *
 * Reporting what is actually in the document
 * ------------------------------------------------------------------ */

/** Makes invisible characters visible in the report. */
function devEscape(text) {
  return String(text).replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u00A0\u00AD\u180E\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g,
    function (ch) {
      var code = ch.charCodeAt(0).toString(16).toUpperCase();
      while (code.length < 4) code = '0' + code;
      return '<' + code + '>';
    });
}

/**
 * Dumps the document structure with per-run text attributes.
 *
 * This is what makes "formatting was preserved" a measurement rather than an
 * impression: every bold run, link and colour is listed with its offsets, so the
 * before and after reports can be compared character range by character range.
 */
function devReport() {
  var body = devBody();
  var lines = [];
  devReportContainer(body, lines, '');
  return lines.join('\n');
}

function devReportContainer(container, lines, indent) {
  for (var i = 0; i < container.getNumChildren(); i++) {
    var child = container.getChild(i);
    var type = child.getType();

    if (type === DocumentApp.ElementType.TABLE) {
      var table = child.asTable();
      lines.push(indent + '[' + i + '] TABLE ' + table.getNumRows() + ' rows');
      for (var r = 0; r < table.getNumRows(); r++) {
        var row = table.getRow(r);
        for (var c = 0; c < row.getNumCells(); c++) {
          lines.push(indent + '  cell(' + r + ',' + c + ')');
          devReportContainer(row.getCell(c), lines, indent + '    ');
        }
      }
      continue;
    }

    if (type !== DocumentApp.ElementType.PARAGRAPH &&
        type !== DocumentApp.ElementType.LIST_ITEM) {
      lines.push(indent + '[' + i + '] ' + type);
      continue;
    }

    var block = type === DocumentApp.ElementType.LIST_ITEM
      ? child.asListItem()
      : child.asParagraph();

    var label = indent + '[' + i + '] ' + type;
    if (type === DocumentApp.ElementType.LIST_ITEM) {
      label += ' list=' + String(block.getListId()).slice(-6) +
               ' level=' + block.getNestingLevel() +
               ' glyph=' + block.getGlyphType();
    } else {
      label += ' heading=' + block.getHeading();
    }
    label += ' children=' + block.getNumChildren();
    lines.push(label);
    lines.push(indent + '  text: "' + devEscape(block.getText()) + '"');

    var text = block.editAsText();
    var length = text.getText().length;
    if (!length) continue;

    var indices = text.getTextAttributeIndices();
    for (var a = 0; a < indices.length; a++) {
      var start = indices[a];
      var end = (a + 1 < indices.length ? indices[a + 1] : length) - 1;
      if (end < start) continue;
      var marks = [];
      if (text.isBold(start)) marks.push('bold');
      if (text.isItalic(start)) marks.push('italic');
      if (text.isUnderline(start)) marks.push('underline');
      if (text.isStrikethrough(start)) marks.push('strike');
      var link = text.getLinkUrl(start);
      if (link) marks.push('link=' + link);
      var colour = text.getForegroundColor(start);
      if (colour && colour !== '#000000') marks.push('colour=' + colour);
      if (!marks.length) continue;
      lines.push(indent + '  run ' + start + '-' + end + ': ' + marks.join(' '));
    }
  }
}

/* ------------------------------------------------------------------ *
 * The probes whose answers the design depends on
 * ------------------------------------------------------------------ */

/**
 * Measures the Apps Script behaviours DocumentClean.gs relies on.
 *
 * Each answer is recorded rather than assumed, and any that contradicts the
 * design is a bug in the design, not in the document.
 */
/**
 * A scratch paragraph that is never the container's last child.
 *
 * Apps Script refuses to remove the final paragraph of a body, so a probe that
 * appends and then removes destroys its own result. Inserting before the last
 * child keeps every scratch paragraph removable.
 */
function devScratch(body, text) {
  return body.insertParagraph(Math.max(0, body.getNumChildren() - 1), text || '');
}

function devMeasure() {
  var body = devBody();
  var out = [];

  function record(name, run) {
    try {
      out.push(name + ': ' + run());
    } catch (err) {
      out.push(name + ': THREW ' + err);
    }
  }

  // --- what a soft line break survives as ----------------------------------
  record('setText with U+000B', function () {
    var probe = devScratch(body, '');
    var text = probe.editAsText();
    text.setText('a' + DEV_BR + 'b');
    var codes = devCodes(text.getText());
    probe.removeFromParent();
    return codes;
  });

  record('appendText with U+000B', function () {
    var probe = devScratch(body, '');
    probe.appendText('a' + DEV_BR + 'b');
    var codes = devCodes(probe.getText());
    probe.removeFromParent();
    return codes;
  });

  record('insertText with U+000B', function () {
    var probe = devScratch(body, 'ab');
    probe.editAsText().insertText(1, DEV_BR);
    var codes = devCodes(probe.getText());
    probe.removeFromParent();
    return codes;
  });

  // --- attribute round trip -------------------------------------------------
  record('getAttributes after setBold', function () {
    var probe = devScratch(body, 'bold plain');
    var text = probe.editAsText();
    text.setBold(0, 3, true);
    var attributes = text.getAttributes(0);
    var keys = [];
    for (var key in attributes) {
      if (attributes[key] !== null) keys.push(key + '=' + attributes[key]);
    }
    var result = 'isBold(0)=' + text.isBold(0) + ' nonNull=[' + keys.join(', ') + ']';
    probe.removeFromParent();
    return result;
  });

  record('setAttributes round trip preserves bold', function () {
    var probe = devScratch(body, 'bold plain');
    var text = probe.editAsText();
    text.setBold(0, 3, true);
    var attributes = text.getAttributes(2);
    text.deleteText(2, 2);
    text.insertText(2, 'X');
    text.setAttributes(2, 2, attributes);
    var result = 'text="' + text.getText() + '" isBold(2)=' + text.isBold(2);
    probe.removeFromParent();
    return result;
  });

  record('insertText inherits neighbour formatting', function () {
    var probe = devScratch(body, 'boldplain');
    var text = probe.editAsText();
    text.setBold(0, 3, true);
    text.insertText(4, 'X');
    var result = 'text="' + text.getText() + '" isBold(4)=' + text.isBold(4);
    probe.removeFromParent();
    return result;
  });

  // --- what may and may not be removed --------------------------------------
  record('merge() a paragraph that is NOT last', function () {
    var first = devScratch(body, 'first half');
    var second = devScratch(body, 'second half');
    var tail = devScratch(body, 'tail');
    var merged = second.merge();
    var result = merged ? '"' + first.getText() + '"' : 'null';
    first.removeFromParent();
    tail.removeFromParent();
    return result;
  });

  record('merge() a paragraph that IS last', function () {
    var first = devScratch(body, 'first half');
    var second = devScratch(body, 'second half');
    try {
      second.merge();
      return 'allowed';
    } finally {
      first.removeFromParent();
    }
  });

  record('removeFromParent on the last child of the body', function () {
    var last = body.appendParagraph('removable?');  // deliberately last
    last.removeFromParent();
    return 'allowed';
  });

  record('body last child type after all this', function () {
    return body.getChild(body.getNumChildren() - 1).getType();
  });

  return out.join('\n');
}

/** Character codes of a string, so invisible characters can be seen. */
function devCodes(text) {
  var codes = [];
  for (var i = 0; i < text.length; i++) codes.push(text.charCodeAt(i));
  return '[' + codes.join(',') + ']';
}

/** Reports the character codes of every paragraph, for inspecting typed input. */
function devInspect() {
  var body = devBody();
  var lines = [];
  for (var i = 0; i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    lines.push(i + ': ' + devCodes(child.asParagraph().getText()));
  }
  body.clear();
  for (var j = 0; j < lines.length; j++) body.appendParagraph(lines[j]);
}

/** Runs a clean the same way the real sidebar would, and reports the stats. */
function devClean(scope, options) {
  var result = cpClean(scope, options);
  return JSON.stringify(result);
}
