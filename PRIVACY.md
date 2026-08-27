# CleanPaste privacy policy

**Last updated: 27 August 2026**

CleanPaste is a Google Docs editor add-on that cleans up pasted text. This document
describes exactly what it does with your data. It describes the behaviour of the code
in this repository, and nothing in it is aspirational.

## The short version

CleanPaste does not collect, transmit, store or share anything.

Your document is read and edited inside Google's Apps Script runtime, on Google's
servers, while you are using it. Nothing about it leaves that runtime. There is no
CleanPaste server, no database, no analytics, no logging of document content, no
account, and no AI service.

## What CleanPaste can see

One permission governs document access:

**`https://www.googleapis.com/auth/documents.currentonly`**
Google describes this as the ability to view and manage the document the add-on is
open in. It grants access to **that one document only**. It does not grant access to
Google Drive, to your other documents, or to any file you have not opened CleanPaste
in.

Inside that document, CleanPaste reads the text of the paragraphs it is about to
clean, and their formatting, so it can decide what to change and put it back
unchanged. That reading happens in memory, during the few seconds a clean takes.

## What CleanPaste does with it

It works out which characters to delete, which blank lines are surplus, and which line
breaks a paste left behind. Then it edits your document.

That is the entire data flow. The text is never copied anywhere else, never written to
storage, and never sent over a network.

## The second permission

**`https://www.googleapis.com/auth/script.container.ui`**
This lets the add-on draw its menu and its options panel inside Google Docs. It does
not grant access to document content. An editor add-on with any interface at all
requires it.

## Scopes Google adds by itself

Any Google Workspace Marketplace listing automatically includes:

- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`
- `openid`

These are attached by the platform to every listed add-on and cannot be removed from
the listing. **CleanPaste's own code never calls any identity API and never reads your
email address, name or profile.** The consent screen shows them because Google
requires them of the listing, not because the add-on uses them.

CleanPaste's manifest declares two scopes. The full, honest answer is: two that the
code uses, plus three the platform attaches to every listing.

## No network requests

CleanPaste makes no outbound requests of any kind. It does not use `UrlFetchApp`, it
loads no third-party scripts, and it contacts no API.

The one external resource the options panel references is Google's own add-on
stylesheet at `ssl.gstatic.com`, which Google publishes for add-ons to look native
inside Docs. It is a stylesheet: it carries no data out, and requesting it tells
Google only that a Google add-on panel was opened, inside Google Docs, by a user
already signed in to Google.

## Local storage

The options panel remembers which checkboxes you ticked, using your browser's own
`localStorage`. Five booleans, stored in your browser, on your device.

That data never reaches CleanPaste's author, is never sent anywhere, and contains
nothing about your documents. Clearing your browser data removes it, and CleanPaste
falls back to its defaults.

## No analytics

CleanPaste does not measure usage. There are no counters, no events, no crash
reporting and no telemetry of any kind — not even the privacy-safe sort.

Google may report aggregate installation counts to the developer through the
Marketplace and Cloud consoles. That is Google's reporting about the listing; the
add-on itself sends nothing.

## Children

CleanPaste is a general-purpose document utility with no accounts and no data
collection. It is not directed at children and collects nothing from anyone.

## Changes to this policy

This policy describes the code. If the code's data handling ever changes, this file
changes in the same commit, and the "Last updated" date above changes with it. The
full history is public in the repository.

## Removing CleanPaste

Uninstall it from the Google Workspace Marketplace, or from **Extensions → Add-ons →
Manage add-ons** in Google Docs. Uninstalling removes the add-on's access
immediately. Because CleanPaste stores nothing, there is nothing left behind to
delete — the only trace is the browser `localStorage` entry described above, which
you can clear with your browsing data.

## Contact

maxtop9843@gmail.com
