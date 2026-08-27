/**
 * CleanPaste - the only file that changes a document.
 *
 * Everything here is deliberately mechanical. What to change was already decided
 * by Clean.gs, which has no idea a document exists; this file's whole job is to
 * carry those decisions out without disturbing anything that was not part of them.
 *
 * Three rules it never breaks:
 *
 *  1. Text is edited in place by character offset. The document's text is never
 *     read out, rewritten as a string, and typed back -- that round trip is how
 *     cleanup add-ons lose bold, italics, links and colours, and it is the single
 *     most common way this kind of tool damages a document.
 *  2. Edits are applied from the end of a block backwards, so an earlier edit's
 *     offsets are still valid when it is reached.
 *  3. Paragraphs are joined with merge(), which moves the elements themselves.
 *     Nothing is re-typed, so formatting travels with the text it belongs to.
 */

/* ------------------------------------------------------------------ *
 * Reading the document
 * ------------------------------------------------------------------ */

/** Block types CleanPaste will edit. */
function cpIsBlock(type) {
  return type === DocumentApp.ElementType.PARAGRAPH ||
         type === DocumentApp.ElementType.LIST_ITEM;
}

/** Casts a block to its concrete type so type-specific methods are available. */
function cpAsBlock(element) {
  return element.getType() === DocumentApp.ElementType.LIST_ITEM
    ? element.asListItem()
    : element.asParagraph();
}

/** The body of the tab the user is actually looking at. */
function cpActiveBody(doc) {
  var tab = doc.getActiveTab();
  if (tab) {
    try {
      return tab.asDocumentTab().getBody();
    } catch (err) {
      // Not a document tab; fall through to the document-level body.
    }
  }
  return doc.getBody();
}

/**
 * Walks up from a selected element to the paragraph or list item that owns it.
 *
 * Selecting half a sentence and selecting the whole paragraph both land here, so
 * CleanPaste always works on whole blocks. Cleaning half a paragraph would leave
 * the user with a result they did not ask for and could not predict.
 */
function cpOwningBlock(element) {
  for (var node = element; node; node = node.getParent()) {
    var type = node.getType();
    if (cpIsBlock(type)) return node;
    if (type === DocumentApp.ElementType.BODY_SECTION) return null;
  }
  return null;
}

/**
 * A block can be merged into the one above it only if merging cannot lose
 * anything. List items are excluded because merging two of them destroys a list
 * entry; headings because their whole purpose is to stand apart; and blocks
 * holding an image or any other non-text child because their contents have not
 * been verified to survive the move.
 */
function cpIsJoinable(element) {
  if (element.getType() !== DocumentApp.ElementType.PARAGRAPH) return false;

  var paragraph = element.asParagraph();
  if (paragraph.getHeading() !== DocumentApp.ParagraphHeading.NORMAL) return false;

  for (var i = 0; i < paragraph.getNumChildren(); i++) {
    if (paragraph.getChild(i).getType() !== DocumentApp.ElementType.TEXT) return false;
  }
  return true;
}

/**
 * Describes a run of blocks in one container, ready for the block-level plans.
 *
 * `adjacentToPrev` is the guard that makes merge() safe: Apps Script merges a
 * paragraph with "the preceding sibling of the same type", which is not
 * necessarily the block immediately above it -- with a table in between it could
 * be one much further up the document. Requiring consecutive child indices means
 * the element merge() will pick is always the one that was actually planned for.
 */
function cpDescribeBlocks(container, blocks) {
  var described = [];
  var previousIndex = null;

  for (var i = 0; i < blocks.length; i++) {
    var index;
    try {
      index = container.getChildIndex(blocks[i]);
    } catch (err) {
      return null; // belongs to a different container; the caller refuses
    }

    described.push({
      element: blocks[i],
      index: index,
      text: cpAsBlock(blocks[i]).getText(),
      joinable: cpIsJoinable(blocks[i]),
      adjacentToPrev: previousIndex !== null && index === previousIndex + 1
    });
    previousIndex = index;
  }

  return described;
}

/* ------------------------------------------------------------------ *
 * Gathering the work
 * ------------------------------------------------------------------ */

/**
 * A group is a set of consecutive blocks sharing one container.
 *
 * `structural` is false inside table cells, and it switches off both kinds of
 * line repair there: removing blank lines, and joining lines that look wrapped.
 * A cell is narrow, so a line inside one reaches the edge at a length that would
 * read as "obviously wrapped" in body text, and a break the author put there on
 * purpose looks identical to one a paste left behind. Reshaping a table on that
 * evidence is not a trade worth making.
 *
 * Spacing and hidden-character cleanup still run in cells. Deleting a zero-width
 * space or a double space cannot change a table's shape.
 */
function cpGroup(container, blocks) {
  return {
    container: container,
    blocks: blocks,
    structural: container.getType() === DocumentApp.ElementType.BODY_SECTION
  };
}

/** Every block in the active tab, including the ones inside tables. */
function cpDocumentGroups(body) {
  var groups = [];
  var topLevel = [];

  for (var i = 0; i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    var type = child.getType();

    if (cpIsBlock(type)) {
      topLevel.push(child);
    } else if (type === DocumentApp.ElementType.TABLE) {
      cpCollectTable(child.asTable(), groups);
    }
  }

  if (topLevel.length) groups.unshift(cpGroup(body, topLevel));
  return groups;
}

/** Adds one group per table cell, recursing through nested tables. */
function cpCollectTable(table, groups) {
  for (var r = 0; r < table.getNumRows(); r++) {
    var row = table.getRow(r);
    for (var c = 0; c < row.getNumCells(); c++) {
      var cell = row.getCell(c);
      var blocks = [];
      for (var i = 0; i < cell.getNumChildren(); i++) {
        var child = cell.getChild(i);
        if (cpIsBlock(child.getType())) {
          blocks.push(child);
        } else if (child.getType() === DocumentApp.ElementType.TABLE) {
          cpCollectTable(child.asTable(), groups);
        }
      }
      if (blocks.length) groups.push(cpGroup(cell, blocks));
    }
  }
}

/**
 * The blocks the selection touches, grouped by their container.
 *
 * Returns null when there is no selection. Blocks are de-duplicated and returned
 * in document order, because a range that covers three Text runs of one paragraph
 * must still clean that paragraph exactly once.
 */
function cpSelectionGroups(doc) {
  var selection = doc.getSelection();
  if (!selection) return null;

  var ranges = selection.getRangeElements();
  var containers = [];
  var byContainer = [];

  for (var i = 0; i < ranges.length; i++) {
    var block = cpOwningBlock(ranges[i].getElement());
    if (!block) continue;

    var container = block.getParent();
    var slot = containers.indexOf(container);
    if (slot === -1) {
      containers.push(container);
      byContainer.push([]);
      slot = containers.length - 1;
    }
    if (byContainer[slot].indexOf(block) === -1) byContainer[slot].push(block);
  }

  var groups = [];
  for (var g = 0; g < containers.length; g++) {
    var blocks = byContainer[g];
    var ordered = cpOrderByChildIndex(containers[g], blocks);
    if (ordered) groups.push(cpGroup(containers[g], ordered));
  }
  return groups;
}

/** Sorts blocks into document order, or returns null if any is not a child. */
function cpOrderByChildIndex(container, blocks) {
  var keyed = [];
  for (var i = 0; i < blocks.length; i++) {
    try {
      keyed.push({ element: blocks[i], index: container.getChildIndex(blocks[i]) });
    } catch (err) {
      return null;
    }
  }
  keyed.sort(function (a, b) { return a.index - b.index; });
  return keyed.map(function (entry) { return entry.element; });
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

function cpNewStats() {
  return { charactersRemoved: 0, linesJoined: 0, blankLinesRemoved: 0, linksRemoved: 0 };
}

function cpStatsTotal(stats) {
  return stats.charactersRemoved + stats.linesJoined +
         stats.blankLinesRemoved + stats.linksRemoved;
}

/**
 * Applies one block's character edits, last edit first.
 *
 * A deletion is applied as a deletion, which cannot disturb the formatting of
 * anything left behind.
 *
 * The rare replacement -- collapsing a tab or a non-breaking space down to one
 * ordinary space, or turning a soft line break into one -- inserts the new
 * character *before* deleting the old one. That order is not cosmetic. Two
 * behaviours were measured in a live document and they decide it:
 *
 *   insertText inherits the formatting of the character to its left.
 *   getAttributes(offset) returns paragraph attributes only -- BOLD, ITALIC and
 *   LINK_URL all come back null even where isBold(offset) is true.
 *
 * So the obvious implementation -- read the attributes, delete, insert, write the
 * attributes back -- silently destroys character formatting, because what it
 * writes back is a bag of nulls. That was not a guess: the round trip was run and
 * the replaced character came back with isBold null where it had been true.
 * Inserting first gets the formatting right by construction and needs no
 * attribute handling at all.
 */
function cpApplyTextEdits(block, options, stats) {
  var text = cpAsBlock(block).editAsText();
  var source = text.getText();
  if (!source) return;

  var edits = cpPlanTextEdits(source, options);
  if (!edits.length) return;

  // A whitespace-only block is allowed to clean down to nothing. deleteText was
  // measured emptying a run without complaint, and the empty block it leaves is
  // exactly what the blank-line pass knows how to collapse.
  for (var i = edits.length - 1; i >= 0; i--) {
    var edit = edits[i];
    stats.charactersRemoved += (edit.end - edit.start + 1) - edit.insert.length;

    if (!edit.insert) {
      text.deleteText(edit.start, edit.end);
      continue;
    }

    var shift = edit.insert.length;
    text.insertText(edit.start, edit.insert);
    text.deleteText(edit.start + shift, edit.end + shift);
  }
}

/**
 * Strips hyperlinks from a block, and the styling that made them look like links.
 *
 * Clearing the URL alone leaves blue underlined text that still reads as a link
 * and still gets clicked, so the underline and the colour go with it. That is a
 * deliberate, documented consequence of asking for links to be removed.
 */
function cpRemoveLinks(block, stats) {
  var text = cpAsBlock(block).editAsText();
  var length = text.getText().length;
  if (!length) return;

  var indices = text.getTextAttributeIndices();
  var runs = [];

  for (var i = 0; i < indices.length; i++) {
    var start = indices[i];
    var end = (i + 1 < indices.length ? indices[i + 1] : length) - 1;
    if (end < start) continue;
    if (!text.getLinkUrl(start)) continue;

    // One visual link can span several attribute runs; count and clear it once.
    var previous = runs[runs.length - 1];
    if (previous && previous.end === start - 1 && previous.url === text.getLinkUrl(start)) {
      previous.end = end;
    } else {
      runs.push({ start: start, end: end, url: text.getLinkUrl(start) });
    }
  }

  for (var r = runs.length - 1; r >= 0; r--) {
    text.setLinkUrl(runs[r].start, runs[r].end, null);
    text.setUnderline(runs[r].start, runs[r].end, false);
    text.setForegroundColor(runs[r].start, runs[r].end, null);
    stats.linksRemoved++;
  }
}

/**
 * True when removing this element would take away its container's last child.
 *
 * Measured, not assumed: removeFromParent() on the final paragraph of a body
 * throws "Cannot remove the last paragraph of a document section", and merge()
 * throws the same way because merging removes the element it is called on. The
 * check has to happen immediately before each mutation rather than when the plan
 * is drawn up, because earlier removals can make a different block the last one.
 */
function cpIsLastChild(container, element) {
  try {
    return container.getChildIndex(element) === container.getNumChildren() - 1;
  } catch (err) {
    return true; // not a child of this container any more; refuse to touch it
  }
}

/**
 * Removes the extra blank blocks, working backwards so indices stay valid.
 *
 * A container is never emptied and its final paragraph is never taken: Apps
 * Script rejects both, and a document that has lost its last paragraph is worse
 * than one with a stray blank line.
 */
function cpRemoveBlankBlocks(container, described, stats) {
  var removals = cpPlanBlankLineRemovals(described);
  var removed = {};

  for (var i = removals.length - 1; i >= 0; i--) {
    var element = described[removals[i]].element;
    if (container.getNumChildren() <= 1) break;
    if (cpIsLastChild(container, element)) continue;
    element.removeFromParent();
    removed[removals[i]] = true;
    stats.blankLinesRemoved++;
  }

  var survivors = [];
  for (var b = 0; b < described.length; b++) {
    if (!removed[b]) survivors.push(described[b].element);
  }
  return survivors;
}

/**
 * Joins the blocks the paste broke apart, working backwards.
 *
 * Backwards matters: merging block i moves its contents into i-1 and removes i,
 * so every block still to be processed sits before the one just changed and its
 * handle is untouched. The separator is inserted into the previous block's
 * existing text run rather than appended as a new one, so it picks up that run's
 * formatting instead of arriving with the document's defaults.
 */
function cpJoinBlocks(container, described, stats) {
  var joins = cpPlanJoins(described);

  for (var i = joins.length - 1; i >= 0; i--) {
    var index = joins[i];
    var block = described[index].element;

    // merge() removes the block it is called on, so the same rule that forbids
    // removing a container's last paragraph forbids merging it away.
    if (cpIsLastChild(container, block)) continue;

    var previousText = cpAsBlock(described[index - 1].element).editAsText();
    var separator = cpJoinSeparator(previousText.getText());

    if (separator) previousText.insertText(previousText.getText().length, separator);
    if (block.asParagraph().merge()) stats.linesJoined++;
  }
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

/**
 * Cleans one group of blocks.
 *
 * Order is not arbitrary. Character cleanup runs first so that the join rules see
 * a line ending in a letter rather than in three stray spaces. Blank lines go
 * next, because removing them changes which blocks are adjacent. Joining is last,
 * and is planned against text that has already been cleaned.
 */
function cpCleanGroup(group, options, stats) {
  var i;

  // Inside a table cell the line-repair rules are switched off entirely, so the
  // character pass runs there without them too -- otherwise a soft line break in
  // a cell would still be joined while a paragraph break in the same cell was not.
  var textOptions = group.structural
    ? options
    : cpOptions({ spacing: options.spacing, hidden: options.hidden, lineBreaks: false });

  for (i = 0; i < group.blocks.length; i++) {
    if (textOptions.spacing || textOptions.hidden || textOptions.lineBreaks) {
      cpApplyTextEdits(group.blocks[i], textOptions, stats);
    }
    if (options.links) {
      cpRemoveLinks(group.blocks[i], stats);
    }
  }

  if (!group.structural) return;

  var blocks = group.blocks;

  if (options.blankLines) {
    var forBlanks = cpDescribeBlocks(group.container, blocks);
    if (!forBlanks) return;
    blocks = cpRemoveBlankBlocks(group.container, forBlanks, stats);
  }

  if (options.lineBreaks) {
    var forJoins = cpDescribeBlocks(group.container, blocks);
    if (!forJoins) return;
    cpJoinBlocks(group.container, forJoins, stats);
  }
}

/** Cleans every group and returns what changed. */
function cpCleanGroups(groups, options) {
  var stats = cpNewStats();
  for (var i = 0; i < groups.length; i++) {
    cpCleanGroup(groups[i], options, stats);
  }
  return stats;
}
