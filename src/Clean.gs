/**
 * CleanPaste - the cleanup decisions, as pure functions.
 *
 * Nothing in this file touches DocumentApp, so it runs unchanged in Node and is
 * unit tested by test/clean.test.js. It never returns rewritten document text:
 * it returns *edits* -- character ranges to delete or replace, and block indices
 * to merge or remove. The document layer applies them in place, which is what
 * keeps bold, links and list structure attached to the text they belong to.
 */

/** The cleanups, and which of them are on before the user touches anything. */
var CP_DEFAULTS = {
  spacing: true,
  blankLines: true,
  hidden: true,
  lineBreaks: true,
  links: false
};

/** Fills in anything the caller left out. Unknown keys are ignored. */
function cpOptions(given) {
  var out = {};
  for (var key in CP_DEFAULTS) {
    out[key] = given && Object.prototype.hasOwnProperty.call(given, key)
      ? !!given[key]
      : CP_DEFAULTS[key];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Character classes
 * ------------------------------------------------------------------ */

/**
 * Invisible characters that carry no meaning in a Google Doc.
 *
 * Deliberately excludes ZWJ (U+200D) and ZWNJ (U+200C): they are load-bearing in
 * Arabic, Persian and Indic scripts, and ZWJ is what holds a multi-person emoji
 * together. Cleaners that strip them break 👨‍👩‍👧 into three separate people.
 * Bidi marks (U+200E/U+200F/U+202A-E) are excluded for the same reason.
 */
var CP_INVISIBLE = '\u200B\u2060\uFEFF\u00AD\u180E';

/**
 * Control characters that should never appear in prose.
 *
 * The gap from U+0009 to U+000D is deliberate: tab is whitespace, and U+000D and
 * U+000B are soft line breaks. Deleting those as junk would silently destroy the
 * very line structure this add-on exists to repair.
 */
var CP_CONTROL = '\u0000-\u0008\u000E-\u001F\u007F';

/** Space characters that are not U+0020 but read as one. NBSP and friends. */
var CP_EXOTIC_SPACE = '\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000';

/**
 * Soft line breaks inside a single paragraph.
 *
 * U+000D leads because that is what Google Docs actually stores for Shift+Enter.
 * This was measured in a live document, not taken from the reference: a real soft
 * break was typed into a Doc and read back through getText(), and it came back as
 * a carriage return. U+000B, which the documentation's wording suggests, cannot
 * even be written -- setText, appendText and insertText all silently convert it
 * to an ordinary space. U+2028 is kept because it arrives in pasted web content.
 */
var CP_SOFT_BREAK = '\u000D\u000B\u2028';

var CP_RE_INVISIBLE = new RegExp('[' + CP_INVISIBLE + CP_CONTROL + ']');
var CP_RE_SPACE = new RegExp('[ \\t' + CP_EXOTIC_SPACE + ']');
var CP_RE_BREAK = new RegExp('[' + CP_SOFT_BREAK + ']');

function cpIsInvisible(ch) { return CP_RE_INVISIBLE.test(ch); }
function cpIsSpace(ch) { return CP_RE_SPACE.test(ch); }
function cpIsSoftBreak(ch) { return CP_RE_BREAK.test(ch); }

/* ------------------------------------------------------------------ *
 * Line joining: the heuristic
 * ------------------------------------------------------------------ */

/**
 * How long a line has to be before CleanPaste will believe it was wrapped.
 *
 * A line broken by a PDF's column width runs nearly the full width; a line broken
 * on purpose -- a title, an address, a table row, a signature -- is usually short.
 * 30 is below any real Latin text column (60-90 characters) and above most
 * deliberate short lines, and it still works for CJK, where 30 characters is
 * already a long line.
 */
var CP_MIN_WRAP_LEN = 30;

/** A line that ends here finished its thought. Joining it would be wrong. */
var CP_SENTENCE_END = /[.!?…:;,"'”’»)\]}。！？）]$/;

/** A line must end on one of these to be believable as a wrapped fragment. */
var CP_CONTINUABLE_END = /[\p{L}\p{N}\-–—]$/u;

/** Manual bullets and numbering, i.e. structure the user typed by hand. */
var CP_LIST_START = /^\s*(?:[-*•·▪◦‣–—]\s|\(?\d+[.)]\s|\(?[A-Za-z][.)]\s|[ivxIVX]+[.)]\s)/;

/** Words that stay lowercase in Title Case, so they must not count against it. */
var CP_MINOR_WORDS = {
  a: 1, an: 1, and: 1, as: 1, at: 1, but: 1, by: 1, for: 1, from: 1, in: 1,
  nor: 1, of: 1, on: 1, or: 1, per: 1, so: 1, the: 1, to: 1, up: 1, via: 1,
  vs: 1, with: 1, yet: 1
};

/**
 * True when a line reads as a heading rather than as prose that ran out of room.
 *
 * Real Google Docs headings are caught earlier by their heading style. This
 * catches the far more common case in a PDF or web paste: a line that is visually
 * a heading but structurally a plain paragraph. Joining one of those onto the
 * body text underneath is the single most damaging mistake this feature can make.
 *
 * Only Latin words are judged. Korean, Japanese and Chinese have no letter case,
 * so every word would look "capitalised" and no CJK line could ever be joined.
 */
function cpLooksLikeHeading(text) {
  var line = String(text).trim();
  if (!line) return false;

  var words = line.split(/\s+/);
  if (words.length < 2) return false; // one word carries no case signal either way

  // ALL CAPS, but only when there are Latin letters to be capital in the first place.
  if (/[A-Z]/.test(line) && line === line.toUpperCase()) return true;

  var capitalised = 0;
  var judged = 0;
  for (var i = 0; i < words.length; i++) {
    var word = words[i].replace(/^[^\p{L}\p{N}]+/u, '');
    if (!/[A-Za-z]/.test(word)) continue;
    if (i > 0 && CP_MINOR_WORDS[word.toLowerCase()]) continue;
    judged++;
    if (word.charAt(0) === word.charAt(0).toUpperCase()) capitalised++;
  }

  // The Latin words have to be most of the line before their capitalisation means
  // anything. "Google Docs 문서에서 붙여넣은 텍스트를 정리하는" is Korean prose that
  // happens to open with a product name, not a title, and joining it is correct.
  if (judged * 2 < words.length) return false;

  return judged >= 2 && capitalised === judged;
}

/**
 * Decides whether `next` is the continuation of `prev`.
 *
 * Every rule here is a reason to refuse. Refusing leaves the document exactly as
 * the user left it; joining wrongly welds two separate thoughts together and is
 * not obvious on screen until much later. So the bias is heavily towards refusing,
 * and a missed join is treated as a far cheaper mistake than a wrong one.
 */
function cpShouldJoin(prev, next) {
  var before = String(prev == null ? '' : prev).replace(/\s+$/, '');
  var after = String(next == null ? '' : next).replace(/^\s+/, '');

  if (!before || !after) return false;
  if (before.length < CP_MIN_WRAP_LEN) return false;
  if (before.split(/\s+/).length < 2) return false; // one long word is not a wrapped line
  if (CP_SENTENCE_END.test(before)) return false;
  if (!CP_CONTINUABLE_END.test(before)) return false;
  if (CP_LIST_START.test(before) || CP_LIST_START.test(after)) return false;

  // Both directions matter. Welding a heading onto the body above it is just as
  // damaging as welding body text onto the heading above that.
  if (cpLooksLikeHeading(before) || cpLooksLikeHeading(after)) return false;

  return true;
}

/**
 * What goes between two joined lines.
 *
 * A trailing hyphen is a word split across the break ("perfor-" / "mance"), so no
 * space -- but the hyphen itself is kept, because removing it would also destroy
 * the hyphen in "well-" / "known", and there is no reliable way to tell those apart.
 */
function cpJoinSeparator(prev) {
  var before = String(prev == null ? '' : prev);
  if (!before) return '';
  if (/\s$/.test(before)) return '';
  if (/[-–—]$/.test(before)) return '';
  return ' ';
}


/* ------------------------------------------------------------------ *
 * Character-level edits inside one block
 * ------------------------------------------------------------------ */

/**
 * Plans every edit for one block's text.
 *
 * Returns non-overlapping `{ start, end, insert }` entries in ascending order,
 * where `end` is inclusive and `insert` is '' for a plain deletion. Almost every
 * edit is a deletion, which is why formatting survives: deleting characters
 * leaves every remaining character's attributes exactly where they were.
 *
 * Two passes that cannot collide. The character pass never touches a soft line
 * break; the line pass only ever rewrites the break character itself. Keeping
 * them disjoint is what lets the results simply be concatenated.
 */
function cpPlanTextEdits(text, options) {
  var opts = cpOptions(options);
  var source = String(text == null ? '' : text);

  var characterEdits = cpPlanCharacterEdits(source, opts);
  var breakEdits = opts.lineBreaks ? cpPlanBreakEdits(source, characterEdits) : [];

  var all = characterEdits.concat(breakEdits);
  all.sort(function (a, b) { return a.start - b.start; });
  return cpNormaliseEdits(all);
}

/**
 * Pass one: invisible characters and whitespace, line by line.
 *
 * Whitespace at the start or end of a visual line goes entirely; whitespace in
 * the middle collapses to a single plain space.
 *
 * When the run already contains an ordinary space, that exact character is the
 * one kept and everything around it is deleted. Nothing is inserted, so the
 * surviving space keeps the formatting it always had. Inserting a fresh space
 * instead looks equivalent and is not: a replacement inherits the formatting of
 * the character to its left, so collapsing the two spaces after a bold word
 * quietly extends the bold run over the space. That was seen in a real document
 * export before this was written.
 *
 * A run with no ordinary space in it -- a lone tab, a run of non-breaking spaces
 * -- has nothing to keep, so that case does become a replacement.
 */
function cpPlanCharacterEdits(source, opts) {
  var edits = [];
  var lineHasContent = false;
  var i = 0;

  while (i < source.length) {
    var ch = source.charAt(i);

    if (cpIsSoftBreak(ch)) {
      lineHasContent = false;
      i++;
      continue;
    }

    if (opts.hidden && cpIsInvisible(ch)) {
      var lastInvisible = i;
      while (lastInvisible + 1 < source.length &&
             cpIsInvisible(source.charAt(lastInvisible + 1))) {
        lastInvisible++;
      }
      edits.push({ start: i, end: lastInvisible, insert: '' });
      i = lastInvisible + 1;
      continue;
    }

    if (opts.spacing && cpIsSpace(ch)) {
      var runEnd = i;
      while (runEnd + 1 < source.length && cpIsSpace(source.charAt(runEnd + 1))) runEnd++;

      var after = runEnd + 1;
      var atLineEnd = after >= source.length || cpIsSoftBreak(source.charAt(after));

      if (!lineHasContent || atLineEnd) {
        edits.push({ start: i, end: runEnd, insert: '' });
      } else if (runEnd > i || ch !== ' ') {
        var keep = cpFirstPlainSpace(source, i, runEnd);
        if (keep === -1) {
          edits.push({ start: i, end: runEnd, insert: ' ' });
        } else {
          if (keep > i) edits.push({ start: i, end: keep - 1, insert: '' });
          if (keep < runEnd) edits.push({ start: keep + 1, end: runEnd, insert: '' });
        }
      }
      i = runEnd + 1;
      continue;
    }

    lineHasContent = true;
    i++;
  }

  return edits;
}

/** The first ordinary space in a whitespace run, or -1 if there is not one. */
function cpFirstPlainSpace(source, start, end) {
  for (var i = start; i <= end; i++) {
    if (source.charAt(i) === ' ') return i;
  }
  return -1;
}

/** The visual lines of a block: character ranges between the soft line breaks. */
function cpSplitLines(source) {
  var lines = [];
  var start = 0;
  for (var i = 0; i < source.length; i++) {
    if (cpIsSoftBreak(source.charAt(i))) {
      lines.push({ start: start, end: i });
      start = i + 1;
    }
  }
  lines.push({ start: start, end: source.length });
  return lines;
}

/**
 * Pass two: which soft line breaks were the paste's fault rather than the user's.
 *
 * Each line is judged against the text that will actually be there once pass one
 * lands -- a line ending in "word   " ends on a space before cleanup and on a
 * letter after it, and those two answers disagree about whether it can be joined.
 *
 * `running` carries the joined-so-far paragraph rather than just the previous
 * line, so the third line of a wrapped sentence is judged against the first two
 * already joined. That is also what makes a second run of CleanPaste a no-op:
 * it sees the same joined text and reaches the same answer.
 */
function cpPlanBreakEdits(source, characterEdits) {
  var edits = [];
  var lines = cpSplitLines(source);
  if (lines.length < 2) return edits;

  var running = null;

  for (var i = 0; i < lines.length; i++) {
    var text = cpTextAfterEdits(source, characterEdits, lines[i].start, lines[i].end);

    if (i === 0) {
      running = text;
      continue;
    }

    if (running && text && cpShouldJoin(running, text)) {
      var head = running.replace(/\s+$/, '');
      var separator = cpJoinSeparator(running);
      // lines[i].start - 1 is the soft break that produced this line.
      edits.push({ start: lines[i].start - 1, end: lines[i].start - 1, insert: separator });
      running = head + separator + text.replace(/^\s+/, '');
    } else {
      running = text;
    }
  }

  return edits;
}

/** What `source[start, end)` becomes once the given edits land. */
function cpTextAfterEdits(source, edits, start, end) {
  var out = '';
  var cursor = start;
  for (var i = 0; i < edits.length; i++) {
    var edit = edits[i];
    if (edit.end < start || edit.start >= end) continue;
    out += source.substring(cursor, edit.start) + edit.insert;
    cursor = edit.end + 1;
  }
  return out + source.substring(cursor, end);
}

/** Drops no-op edits and anything that would overlap an earlier one. */
function cpNormaliseEdits(edits) {
  var out = [];
  var lastEnd = -1;
  for (var i = 0; i < edits.length; i++) {
    var edit = edits[i];
    if (edit.end < edit.start) continue;
    if (edit.start <= lastEnd) continue;
    out.push(edit);
    lastEnd = edit.end;
  }
  return out;
}

/** Applies planned edits to a string. Used by the tests and by cpCleanText. */
function cpApplyEdits(text, edits) {
  var source = String(text == null ? '' : text);
  var out = '';
  var cursor = 0;
  for (var i = 0; i < edits.length; i++) {
    out += source.substring(cursor, edits[i].start) + edits[i].insert;
    cursor = edits[i].end + 1;
  }
  return out + source.substring(cursor);
}

/** Convenience wrapper: the cleaned form of one block's text. */
function cpCleanText(text, options) {
  return cpApplyEdits(text, cpPlanTextEdits(text, options));
}


/* ------------------------------------------------------------------ *
 * Block-level plans
 * ------------------------------------------------------------------ */

/**
 * Picks the empty blocks to remove.
 *
 * A run of two or more empty blocks collapses to one. A single empty block is
 * never touched: one blank line between paragraphs is how a great many documents
 * are legitimately laid out, and deleting those would be a reformat, not a cleanup.
 *
 * `blocks` is an array of { text, adjacentToPrev }.
 */
function cpPlanBlankLineRemovals(blocks) {
  var remove = [];
  var runLength = 0;
  for (var i = 0; i < blocks.length; i++) {
    var isEmpty = !String(blocks[i].text || '').trim();
    var continues = isEmpty && (i === 0 || blocks[i].adjacentToPrev !== false);
    if (!continues) {
      runLength = isEmpty ? 1 : 0;
      continue;
    }
    runLength++;
    if (runLength > 1) remove.push(i);
  }
  return remove;
}

/**
 * Picks the blocks to merge into the block above them.
 *
 * `blocks` is an array of { text, joinable, adjacentToPrev }, in document order.
 * `joinable` is false for anything the document layer refuses to merge -- list
 * items, headings, table cells, blocks holding images.
 *
 * The running text matters: when three lines of one wrapped sentence are joined,
 * the third is judged against the first two already joined together, not against
 * the second alone. Without that, a second run of CleanPaste could reach a
 * different answer than the first, and the result would not be stable.
 */
function cpPlanJoins(blocks) {
  var joins = [];
  var running = null;

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    var text = String(block.text == null ? '' : block.text);

    if (!block.joinable || !text.trim()) {
      running = null;
      continue;
    }

    if (running !== null && block.adjacentToPrev && cpShouldJoin(running, text)) {
      joins.push(i);
      running = running.replace(/\s+$/, '') + cpJoinSeparator(running.replace(/\s+$/, '')) +
                text.replace(/^\s+/, '');
    } else {
      running = text;
    }
  }

  return joins;
}
