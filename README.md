# CleanPaste

A Google Docs editor add-on that cleans up pasted text — without flattening the
formatting you want to keep.

```
The committee reviewed the proposal          The committee reviewed the proposal
at length                               →    at length and agreed to postpone
and agreed to postpone the decision.         the decision.
```

Text pasted from a PDF, a web page or an AI chat arrives full of things you did not
ask for: doubled spaces, stray tabs, invisible characters, and line breaks that stop
mid-sentence because that is where the original column ended. CleanPaste removes
those and leaves everything else alone.

> **Status: working MVP, verified in Google Docs.** Every cleanup below has been run
> against a real document through an Editor add-on test deployment, and the result
> was checked by exporting the document from Google and comparing it formatting run
> by formatting run — not by eye. The evidence is in
> [`test/fixtures/live-document-diff.txt`](test/fixtures/live-document-diff.txt) and
> the method is in [TESTING.md](TESTING.md).

## What it does

Open **Extensions → CleanPaste** and choose **Clean selection** or **Clean document**.
Five cleanups, four of them on by default:

| Cleanup | Default | What it changes |
|---|---|---|
| **Spacing** | on | Repeated spaces collapse to one; stray tabs become a space; leading indents and trailing spaces go; non-breaking and other exotic spaces become ordinary spaces |
| **Extra blank lines** | on | A run of two or more empty lines collapses to one. A single blank line is never removed |
| **Hidden characters** | on | Zero-width spaces, word joiners, byte-order marks, soft hyphens and stray control characters |
| **Broken line breaks** | on | Rejoins lines that a paste cut mid-sentence, leaving real paragraph breaks alone |
| **Remove links** | **off** | Keeps the text, clears the link, and clears the blue and the underline it left behind |

**Clean selection** works on whole paragraphs. Selecting half a sentence cleans the
paragraph it sits in, because cleaning half a paragraph produces a result nobody
could predict.

Ctrl+Z (Cmd+Z) undoes a clean in a single step. That was measured, not assumed.

## The line-break rule

This is the part that damages documents when it is done carelessly, and it is the
top complaint about the add-ons CleanPaste replaces: *"it struggles to distinguish
between line breaks and paragraph breaks."*

CleanPaste joins two lines only when **all** of the following hold:

- the first line is at least 30 characters — a deliberate short line is usually short
- it does not end on `.` `!` `?` `:` `;` `,` or a closing quote or bracket
- it ends on a letter, a digit or a hyphen
- neither line reads as a heading — Title Case, ALL CAPS, or a real Docs heading style
- neither line starts with a bullet or a number
- both are ordinary paragraphs, not list items

Everything else is left exactly as it was. A missed join costs the user one keypress;
a wrong join welds two separate thoughts together and is not obvious until much later,
so the rule is deliberately biased towards leaving things alone.

Two consequences worth knowing:

- **A line ending in a full stop is never joined**, even mid-paragraph. From the
  characters alone, a sentence that happens to end at the end of a line is
  indistinguishable from a paragraph that ends there. CleanPaste leaves a break you
  can delete rather than merging two paragraphs you cannot easily separate.
- **A word split across a break keeps its hyphen.** `perfor-` / `mance` joins to
  `perfor-mance`, not `performance`, because dropping the hyphen would also destroy
  it in `well-` / `known`.

## Supported content

Verified to survive a clean, in a real document:

| Content | Result |
|---|---|
| Bold, italic, bold + italic | Preserved, with their exact character ranges |
| Hyperlinks | Preserved (unless link removal is switched on) |
| Bulleted, numbered and nested lists | Preserved, including list identity and nesting level |
| Headings | Preserved, and never merged into body text |
| Tables | Spacing and hidden characters cleaned in cells; the table's shape untouched |
| Korean, mixed Korean/English | Cleaned by the same rules; CJK is never mistaken for a heading |
| Emoji, Arabic, Persian, Indic scripts | Preserved — ZWJ and ZWNJ are deliberately not stripped |
| Currency, numbers, URLs, code-like text | Untouched |

## Known limitations

- Inside a **table cell**, only spacing and hidden characters are cleaned. Blank lines
  and broken line breaks are left alone, because a cell is narrow enough that a
  deliberate break looks exactly like a wrapped one.
- The **last paragraph of a document** is never removed or merged away. Apps Script
  forbids it, and a document that lost its final paragraph would be worse than one
  with a stray blank line.
- **Two consecutive paragraphs that both end without punctuation** are treated as one
  wrapped paragraph and joined. That is the PDF-paste signature the add-on exists to
  repair; real prose almost always ends a paragraph with punctuation.
- **Leading whitespace is removed.** That is right for pasted text and wrong for
  pasted code — switch Spacing off, or press Ctrl+Z.
- Editor add-ons run on **desktop only**. Google does not support them in the Docs
  mobile apps.

## Privacy

CleanPaste makes no network requests. Your document is read and edited inside the
Apps Script runtime and nothing about it is sent anywhere, stored anywhere, or logged.
There is no backend, no account, no API key and no AI service involved.

It asks for two permissions:

| Scope | Why |
|---|---|
| `documents.currentonly` | Read and edit **only the document it is open in**. Not Drive, not your other documents |
| `script.container.ui` | Draw its menu and its panel inside Google Docs |

Google attaches `userinfo.email` and `userinfo.profile` to every Marketplace listing
automatically; CleanPaste's own code never reads them. Full detail in
[PRIVACY.md](PRIVACY.md).

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer (uses the built-in test runner; developed on 24)
- npm
- A Google account

## Local setup

```bash
git clone https://github.com/maxtop9843-byte/cleanpaste.git
```

```bash
cd cleanpaste && npm install && npm test
```

The cleanup rules are plain JavaScript with no Apps Script dependencies, so
`npm test` runs them directly in Node with no build step.

## Deploying your own copy

```bash
cp .clasp.json.example .clasp.json
```

Put your own Apps Script project id in it, then:

```bash
node tools/push.mjs
```

`tools/push.mjs` pushes `src/` through the Apps Script REST API in one atomic call,
reading credentials from clasp's own `~/.clasprc.json`. Add `--version` to cut an
immutable version, or `--dev` to include the development probe described in
[TESTING.md](TESTING.md).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how it is built, and the Apps Script behaviours it was built around
- [TESTING.md](TESTING.md) — what is tested, how, and against what evidence
- [PRIVACY.md](PRIVACY.md) — exactly what is and is not collected
- [marketplace/PUBLISHING.md](marketplace/PUBLISHING.md) — Marketplace state and what remains

## Licence

MIT. See [LICENSE](LICENSE).
