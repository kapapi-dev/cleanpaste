# Testing CleanPaste

Two layers, because they catch different things.

1. **Unit tests** over the pure planner — fast, exhaustive, run on every change.
2. **A live document** in Google Docs — slower, and the only place that can tell you
   what Apps Script actually does.

Both matter. Every bug found late in this project was found by the second layer, and
none of them could have been found by the first.

## Running the unit tests

```bash
npm test
```

`src/Clean.gs` has no Apps Script dependencies, so the test file loads it straight
into Node with `new Function(source)`. No build step, no bundler, no transpiler, and
nothing that could make the tested code differ from the shipped code.

54 tests covering:

| Area | What is asserted |
|---|---|
| Whitespace | Repeated spaces, tabs, leading and trailing whitespace, non-breaking and exotic spaces |
| Edit shape | That collapsing spaces is a **pure deletion**, keeping an original space rather than inserting a new one |
| Hidden characters | Zero-width space, word joiner, BOM, soft hyphen, OCR control characters |
| Unicode safety | ZWJ and ZWNJ are **kept** — a family emoji and Persian text survive intact |
| Line breaks | All three soft-break characters join; a carriage return is never treated as junk |
| Joins that must happen | Mid-sentence breaks, three-line wraps, hyphen splits, whitespace hugging a break |
| Joins that must **not** happen | After a full stop, colon, semicolon or question mark; short lines; Title Case and ALL CAPS headings; hand-typed bullets and numbers; across a non-adjacent or non-joinable block |
| Blank lines | Runs of two or more collapse to one; a single blank line is never removed |
| Idempotency | Every fixture is cleaned twice and the second pass must change nothing |
| Languages | Korean, English, mixed Korean/English, punctuation, currency, URLs, code-like text |
| Structure | Edits never overlap, are always ascending, and always land inside the string |

The idempotency check is not a separate test — it is built into the `stable()` helper
that almost every assertion goes through, so a rule that is not stable fails wherever
it is used.

## The live document

Unit tests cannot tell you that a soft line break is a carriage return, or that
`getAttributes` returns nulls for bold, or that `merge()` throws on a document's last
paragraph. All three were true, all three broke the implementation, and all three
were found here.

### The probe

`tools/dev/DevProbe.gs` is a development-only file. It is **never** in a release:

```bash
node tools/push.mjs --dev     # release source + the probe
node tools/push.mjs           # release source only
```

Because the Apps Script API replaces a project's entire contents in one call, a plain
push removes the probe. The shipped source contains no test hook of any kind: the
probe wins by being pushed last and redefining `onOpen`, so nothing in `src/` has to
know it exists.

The probe adds four menu items:

| Item | What it does |
|---|---|
| Dev: build fixture | Rebuilds the whole test document from scratch |
| Dev: measure behaviour | Runs the Apps Script probes and writes the answers into the document |
| Dev: inspect char codes | Replaces the document with the character codes of every paragraph |
| Dev: clean (defaults) / + remove links | Calls exactly what the real panel calls |

It is driven from the **menu** rather than from a panel, because HtmlService serves
panels in a cross-origin sandboxed iframe and synthetic clicks from browser
automation do not reach inside one. Menu items are native Docs UI.

### Reading the result

```bash
node tools/snapshot.mjs before
node tools/snapshot.mjs after
```

`tools/snapshot.mjs` exports the document from Google as HTML and reduces it to one
line per block, with bold, italic, underline, colour, links, list identity, nesting
level and every invisible character made explicit.

The export is the point. A report the add-on writes about itself agrees with its own
bugs; an export comes from Google and cannot. `test/fixtures/live-document-diff.txt`
is the diff between those two exports, produced by the released build.

Two artefacts of Google's export to know before reading one:

- **A space next to a tag boundary is exported as `&nbsp;`.** `«/i»⟨00A0⟩and` is one
  ordinary space, not a non-breaking one. Two spaces export as space + `&nbsp;`, so a
  `⟨00A0⟩` *next to* a space is a real doubled space, and after a clean there should
  be none.
- **Formatting lives in inline `style` attributes**, not in CSS classes.

### What the fixture covers

`devBuild()` builds a document containing every case in this list, using real Docs
elements — real bold runs, real links, real list items, a real table:

plain paragraphs · wrapped paragraphs · bold · italic · bold + italic · hyperlinks ·
bulleted lists · numbered lists · nested lists · headings · tables · empty paragraphs ·
runs of empty paragraphs · soft line breaks · an address block · a Title Case
pseudo-heading · zero-width spaces · non-breaking spaces · soft hyphens · tabs ·
leading and trailing whitespace · currency · numbers · URLs · code-like text ·
a ZWJ emoji sequence · Korean · mixed Korean and English

One thing the fixture cannot build is a *typed* soft line break — Apps Script converts
U+000B to a space on every write path. That case was produced by typing Shift+Enter in
the browser and reading the result back with `Dev: inspect char codes`, which is how
the carriage return was found.

### Verified in a live document

Run against the released build, through the menu and through the panel:

- [x] Menu appears under Extensions with exactly three items
- [x] Panel renders, options persist, buttons work
- [x] **Clean document** — every intended change made, nothing else touched
- [x] **Clean selection** — only the selected paragraph changed, 17 characters removed
- [x] Wrapped paragraphs joined into one
- [x] Soft break mid-sentence joined; soft break after a full stop **kept**
- [x] `perfor-` / `mance` joined to `perfor-mance`
- [x] Address block of three short lines **untouched**
- [x] Title Case pseudo-heading **not** merged into the body text under it
- [x] Bold, italic and bold + italic preserved at their exact character ranges
- [x] Bold run does **not** swallow the space that was collapsed next to it
- [x] Hyperlink preserved with defaults; removed cleanly with link removal on —
      link, blue and underline all gone, text kept
- [x] List identity and nesting level unchanged (`L0`, `L0`, `L1`, `L0`, `L0`)
- [x] Three blank lines collapsed to one; single blank line survived
- [x] Table cells cleaned for spacing; table shape and cell breaks untouched
- [x] Korean joined and cleaned; ZWJ emoji intact; currency, URL and code untouched
- [x] **Idempotency** — a second clean produced a byte-identical export
- [x] **Ctrl+Z** undoes a clean in a single step

### Bugs this layer caught

Recorded because they are the argument for doing it at all. None would have been
caught by unit tests, and every one of them was silent.

| Bug | How it presented |
|---|---|
| Soft breaks are `\r`, not U+000B | The headline feature did nothing to soft breaks, with no error |
| `getAttributes` returns nulls for character formatting | Replacements stripped bold from the character they replaced |
| Collapsing spaces extended the bold run over the space | Visible only in the exported HTML |
| `merge()` throws on a container's last paragraph | An exception mid-edit, on a document that ended the wrong way |
| `var status` in the panel shadows `window.status` | Every message silently failed to render. Nothing threw — assigning an element to `window.status` coerces it to a string, and writes to `.innerHTML` on a string are discarded in sloppy mode |

## Before a release

```bash
npm test
```

- [ ] `npm test` green
- [ ] `node tools/push.mjs` (no `--dev`) — confirm the pushed file list has no probe
- [ ] Reload a document; the menu has exactly three items
- [ ] Build a dirty fixture, clean it, diff the exports
- [ ] Clean it again; the diff must be empty
- [ ] Manifest scopes unchanged, and still matching PRIVACY.md and the listing
