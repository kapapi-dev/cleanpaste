# CleanPaste — Marketplace store listing copy

Ready to paste into the Google Workspace Marketplace SDK **Store Listing** tab.
Character counts are against Google's documented limits.

Nothing here claims anything the code does not do. In particular there is no "AI",
no "smart", and no "learns from your writing" — CleanPaste is a set of rules, and
saying otherwise would be a lie a reviewer could catch in five minutes.

---

## Application name

`50 char limit` — **used: 10**

```
CleanPaste
```

> Must not contain "Google" or a Google product name. "CleanPaste" is clear of that.

---

## Short description

`200 char limit` — **used: 178**

```
Clean up text pasted from PDFs, web pages and AI tools. Fixes broken line breaks, extra spaces, blank lines and hidden characters — and keeps your bold, links and lists. Nothing is uploaded.
```

---

## Detailed description

`16,000 char limit` — **used: ~2,900**

```
CleanPaste tidies up text you have pasted into a Google Doc, without flattening the
formatting you want to keep.

Paste from a PDF and every line stops where the original column ended. Paste from a
web page and you get doubled spaces, non-breaking spaces and invisible characters you
cannot see but can definitely feel. Paste from an AI chat and you get all of the above
plus a run of empty lines. CleanPaste removes those, and leaves everything else alone.

Open Extensions > CleanPaste and pick Clean selection or Clean document. That is the
whole product.

WHAT IT CLEANS

• Spacing — repeated spaces collapse to one, stray tabs become a space, leading
  indents and trailing spaces go, and non-breaking spaces become ordinary ones
• Extra blank lines — a run of two or more empty lines collapses to one; a single
  blank line is never touched
• Hidden characters — zero-width spaces, word joiners, byte-order marks, soft
  hyphens and stray control characters left behind by OCR
• Broken line breaks — rejoins lines that a paste cut mid-sentence
• Remove links — off by default. Keeps the text, clears the link, and clears the
  blue and the underline it leaves behind

CAREFUL WITH LINE BREAKS

This is the part that ruins documents when it is done carelessly, so CleanPaste is
deliberately cautious. Two lines are joined only when the first is long enough to have
been wrapped, does not end on a full stop or other closing punctuation, and neither
line reads as a heading or a list item. Everything else is left exactly as it was.

A missed join costs you one keypress. A wrong join welds two separate thoughts
together and you may not notice for an hour. CleanPaste is built around that
difference.

Two things that follow from it: a line ending in a full stop is never joined, because
a sentence that ends at the end of a line is indistinguishable from a paragraph that
ends there. And a word split across a break keeps its hyphen, because there is no
reliable way to tell "perfor-" and "mance" apart from "well-" and "known".

YOUR FORMATTING SURVIVES

CleanPaste edits your document in place, character by character. It never reads a
paragraph out as plain text and types it back, which is how this kind of add-on
usually loses your work.

Verified in a real document: bold, italic, bold and italic together, hyperlinks,
bulleted lists, numbered lists, nested lists, headings and tables all come through a
clean unchanged. So do currency, numbers, URLs, code-like text, emoji, Korean and
other non-Latin scripts.

Ctrl+Z (Cmd+Z on Mac) undoes a clean in one step.

MINIMUM PERMISSIONS

CleanPaste asks to see the document it is open in, and nothing else. Not your Drive.
Not your other documents. It cannot open a file you have not opened it in.

NOTHING LEAVES YOUR DOCUMENT

CleanPaste makes no network requests of any kind. There is no server, no database, no
account to create, no API key, no analytics, and no AI service involved. Your text is
read and edited inside Google's own Apps Script runtime and goes nowhere else.

It is free, with no trial, no upgrade prompt and no paid tier.

GOOD TO KNOW

• Editor add-ons run on desktop only. Google does not support them in the Docs
  mobile apps.
• Inside a table cell, only spacing and hidden characters are cleaned. A cell is
  narrow enough that a deliberate line break looks exactly like a wrapped one, so
  CleanPaste leaves the shape of your tables alone.
• Leading whitespace is removed, which is right for pasted prose and wrong for
  pasted code. Switch Spacing off, or press Ctrl+Z.

The source code is public: github.com/maxtop9843-byte/cleanpaste
```

---

## Category

```
Productivity
```

## Pricing

```
Free
```

> Matches the code, which contains no licensing, no trial and no payment logic.

---

## Post-install tip

`Required field.`

```
Open a document and choose Extensions > CleanPaste > Clean document to try it. Ctrl+Z undoes a clean in one step.
```

---

## URLs

| Field | Value |
|---|---|
| Developer website | `https://maxtop9843-byte.github.io/cleanpaste-site/` |
| Terms of service | `https://maxtop9843-byte.github.io/cleanpaste-site/terms.html` |
| Privacy policy | `https://maxtop9843-byte.github.io/cleanpaste-site/privacy.html` |
| Support | `https://maxtop9843-byte.github.io/cleanpaste-site/support.html` |
| Report an issue | `https://maxtop9843-byte.github.io/cleanpaste-site/support.html` |

> The report-issue field rejects `mailto:` — it must start with `http://` or `https://`,
> so it points at the support page rather than at an address.

---

## Graphic assets

| Asset | File | Size |
|---|---|---|
| Application icon | `assets/icon-128.png` | 128 × 128 |
| Application icon | `assets/icon-32.png` | 32 × 32 |
| Application icon | `assets/icon-48.png` | 48 × 48 |
| Application icon | `assets/icon-96.png` | 96 × 96 |
| Store card banner | `assets/card-banner-220x140.png` | 220 × 140 |
| Screenshot | `assets/screenshot-1-1280x800.png` | 1280 × 800 |
| Consent screen logo | `assets/icon-120.png` | 120 × 120 |

All are generated from one vector source by `node tools/assets.mjs`, so a change to
the mark regenerates every size consistently.

The screenshot is a real capture of the released build running in Google Docs, cropped
to remove the browser's tab strip, address bar and bookmarks. Nothing in it is mocked
up or composited.

---

## OAuth consent screen

| Field | Value |
|---|---|
| App name | `CleanPaste` |
| User support email | `maxtop9843@gmail.com` |
| App logo | `assets/icon-120.png` |
| Application home page | `https://maxtop9843-byte.github.io/cleanpaste-site/` |
| Privacy policy link | `https://maxtop9843-byte.github.io/cleanpaste-site/privacy.html` |
| Terms of service link | `https://maxtop9843-byte.github.io/cleanpaste-site/terms.html` |
| Authorised domain | `maxtop9843-byte.github.io` |

> The consent-screen app name must match the name on the home page, and the home page
> must state what the app does. Both were requirements that failed brand verification
> on the previous project before they were fixed.

---

## Scopes, and how to justify them

| Scope | Classification | Justification |
|---|---|---|
| `documents.currentonly` | Non-sensitive | Reads and edits only the open document. This is the narrowest scope that allows editing at all |
| `script.container.ui` | **Sensitive** | Draws the add-on's menu and options panel inside Docs. An editor add-on with any interface requires it |

Draft justification for the sensitive scope:

```
CleanPaste is a Google Docs editor add-on that cleans up pasted text: it removes
repeated spaces, stray tabs, invisible characters and surplus blank lines, and rejoins
lines that a paste from a PDF or web page cut mid-sentence.

script.container.ui is required for the add-on to have any user interface at all. It
is used for exactly two things: to add the "CleanPaste" menu under Extensions, and to
show the options panel in which the user chooses which cleanups to run and presses
Clean selection or Clean document. Both are drawn with DocumentApp.getUi() and
HtmlService, and there is no other way for an Editor add-on to present them.

The scope is not used to read, transmit or store any document content. CleanPaste
makes no network requests of any kind: it has no backend, no analytics and no third
party services. Document text is read and edited entirely inside the Apps Script
runtime through documents.currentonly, which limits access to the single document the
add-on is open in.

The full source code is public at github.com/maxtop9843-byte/cleanpaste and can be
checked against this description.
```
