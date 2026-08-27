# CleanPaste architecture

```
Google Docs
     ↓  Extensions → CleanPaste
Menu and panel          (Code.gs, Sidebar.html, Ui.gs)
     ↓  scope + options
Work gatherer           (DocumentClean.gs — selection or document → groups of blocks)
     ↓
Cleanup planner         (Clean.gs — pure, no DocumentApp, unit tested in Node)
     ↓  edits and block plans
Document mutator        (DocumentClean.gs — the only code that writes)
```

The split exists for one reason: everything that *decides* what to change can be
reasoned about and tested without a document, and the code that can actually damage
a document is small enough to read in a sitting.

## The planner returns edits, not text

`Clean.gs` never returns rewritten document text. It returns:

- **character edits** — `{ start, end, insert }` ranges within one block, and
- **block plans** — which blocks to remove, which to merge into the one above.

The document layer applies those in place by character offset.

The obvious implementation is `getText()` → clean the string → `setText()`. It is
also how cleanup add-ons lose their users' work: that round trip discards everything
that is not characters — bold runs, italics, links, colours, fonts, and the boundaries
between them. CleanPaste never holds a "cleaned version of the paragraph"; it holds a
list of characters to delete, and deleting characters cannot disturb the formatting of
the characters left behind.

Almost every edit is a pure deletion. The rare replacement is discussed under
[Measured behaviours](#measured-behaviours) below, because getting it wrong silently
destroys formatting.

## Why there is no backend

Removing a double space is a pure function of the text already on screen. A server
would add an outage surface, a privacy question, a bill and a Marketplace review
burden, in exchange for nothing a user would notice. All work happens inside the Apps
Script runtime.

That is a design constraint, not a marketing line: adding a `UrlFetchApp` call would
break it, and would require [PRIVACY.md](PRIVACY.md) to change in the same commit.

## Order of operations

Order is not arbitrary, and getting it wrong produces subtly different results.

```
read and validate  →  character edits  →  link removal  →  blank lines  →  joins
```

1. **Nothing is written until everything is read.** A selection CleanPaste cannot
   handle produces a message and an untouched document.
2. **Character cleanup runs first**, so the join rules see a line ending in a letter
   rather than in three stray spaces. `"word   "` ends on whitespace and is not
   joinable; `"word"` ends on a letter and is.
3. **Blank lines go next**, because removing them changes which blocks are adjacent,
   and adjacency is what makes a merge safe.
4. **Joining is last**, planned against text that has already been cleaned.

Within a block, character edits are applied **from the last edit backwards**, so an
earlier edit's offsets are still valid when it is reached. Merges and removals also
run backwards, for the same reason.

## Idempotency is structural, not incidental

Running CleanPaste twice must leave the document exactly as the first run did. That
is not a happy accident of the rules; one piece of the design exists for it.

`cpPlanJoins` carries a **running joined text** rather than comparing each block to
the one literally above it. When three lines of one wrapped sentence are joined, the
third is judged against the first two *already joined together*. Without that, the
second run would see a different first line than the first run did and could reach a
different answer.

The same reasoning applies inside a paragraph, where soft line breaks are judged with
the same accumulator.

Verified both ways: a unit-test helper cleans every fixture twice and asserts the
second pass is a no-op, and a real document was cleaned twice through the add-on with
a byte-identical export.

## Measured behaviours

Apps Script's document behaviour decides how this add-on has to be written, and
several of the decisive facts are not in the reference documentation — or contradict
what its wording implies. Each was measured inside a real Editor add-on test
deployment before being relied on. The probe that measured them is in `tools/dev/`.

| Call | Measured result |
|---|---|
| A real Shift+Enter, read via `getText()` | **`\r` (U+000D)** — not U+000B |
| `setText` / `appendText` / `insertText` with U+000B | Silently becomes an ordinary space |
| `getAttributes(offset)` on a bold character | Returns **paragraph** attributes only; `BOLD`, `ITALIC` and `LINK_URL` are all `null` while `isBold(offset)` is `true` |
| `insertText(offset, s)` | Inherits the formatting of the character to its **left** |
| `deleteText(0, length - 1)` | Allowed; leaves an empty run |
| `Paragraph.merge()` | Concatenates with **no separator** |
| `merge()` / `removeFromParent()` on a container's **last** paragraph | **Throws** — "Cannot remove the last paragraph of a document section" |

Four of these changed the implementation:

**Soft line breaks are carriage returns.** The character class started as U+000B,
which the documentation's wording suggests. Had it shipped that way, the headline
feature would have quietly done nothing to soft breaks: `\r` is in neither the
line-break set nor the junk-character set, so it would have been passed over in
silence. U+000B and U+2028 are still recognised because they arrive in pasted content;
U+000D leads because it is what Docs actually stores.

**Replacements insert before deleting.** The natural way to swap one character for
another is read the attributes, delete, insert, write the attributes back. Here that
*destroys* formatting, because what gets written back is a bag of nulls — the round
trip was run and the replaced character came back with `isBold` null where it had
been true. Inserting first and deleting afterwards gets the formatting right by
construction, because the inserted character inherits from its left neighbour, which
is the run it belongs to. No attribute handling is needed at all.

**Collapsing spaces keeps an existing space.** Even with insert-then-delete, a
replacement inherits from the left. Collapsing the two spaces after a bold word would
therefore extend the bold run over the surviving space — visible in an export as
`<span style="font-weight:700">bold </span>`. So when a whitespace run already
contains an ordinary space, that exact character is kept and everything around it is
deleted. Nothing is inserted, and the space keeps the formatting it always had. Only
a run with no ordinary space in it — a lone tab, a run of non-breaking spaces — has
to be replaced.

**Nothing merges away a container's last paragraph.** `merge()` removes the block it
is called on, so the rule that forbids removing a body's final paragraph forbids
merging it too. The check runs immediately before each mutation rather than when the
plan is drawn up, because earlier removals can make a *different* block the last one.

## Safety rules the code will not break

**Merging only ever touches the block immediately above.** Apps Script documents
`merge()` as merging with "the preceding sibling of the same type", which is not
necessarily the block above — with a table in between it could be one much further up
the document. Every join therefore requires consecutive child indices, so the element
`merge()` will pick is always the one that was planned for.

**Cross-container work is refused.** `getChildIndex()` throws for an element that
belongs to a different container, and that throw is the mechanism behind the
same-container rule: a selection spanning two table cells, or two tabs, is refused
rather than guessed at.

**Table cells get text cleanup only.** Blank-line removal and line joining are off
inside cells. A cell is narrow, so a line reaches its edge at a length that would
read as obviously wrapped in body text, and a break the author put there on purpose
looks identical to one a paste left behind. Reshaping a table on that evidence is not
a trade worth making. Deleting a zero-width space cannot reshape anything, so that
still runs.

**The element whitelist is narrow.** A paragraph is joinable only if every child is a
`TEXT` element. A paragraph holding an inline image, a footnote or an equation is left
alone, because its behaviour across a merge has not been observed. The list widens
only with evidence.

## Failure policy

A damaged document is a worse outcome than a missing feature.

Every ambiguous case is refused with a message rather than guessed at. Failures during
reading say the document has not been changed, and that is literally true because
nothing has been written yet. Failures during editing deliberately do **not** claim
that — they point at Ctrl+Z instead, because at that point the claim might be false.

## Files

| File | Role |
|---|---|
| `src/Clean.gs` | Every cleanup decision. No `DocumentApp`. Runs in Node |
| `src/DocumentClean.gs` | The only code that writes to a document |
| `src/Code.gs` | Menu, entry points, and the read → validate → edit flow |
| `src/Ui.gs` | Every message the server side shows, in one place |
| `src/Sidebar.html` | The options panel |
| `test/clean.test.js` | Unit tests for the planner |
| `tools/push.mjs` | Pushes `src/` to Apps Script; `--dev` adds the probe, `--version` cuts a version |
| `tools/snapshot.mjs` | Exports the test document from Google and prints its real structure |
| `tools/dev/DevProbe.gs` | Development probe. Never released — see [TESTING.md](TESTING.md) |
