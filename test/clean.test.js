import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Clean.gs is plain JavaScript with no Apps Script dependencies, so it loads
// straight into Node -- no build step, no bundler, no transpiler.
const source = readFileSync(new URL('../src/Clean.gs', import.meta.url), 'utf8');
const {
  cpCleanText,
  cpPlanTextEdits,
  cpApplyEdits,
  cpShouldJoin,
  cpJoinSeparator,
  cpLooksLikeHeading,
  cpPlanJoins,
  cpPlanBlankLineRemovals,
  cpOptions,
  CP_DEFAULTS,
} = new Function(
  `${source}\nreturn { cpCleanText, cpPlanTextEdits, cpApplyEdits, cpShouldJoin,` +
    ` cpJoinSeparator, cpLooksLikeHeading, cpPlanJoins, cpPlanBlankLineRemovals,` +
    ` cpOptions, CP_DEFAULTS };`
)();

const BR = '\u000D'; // what Google Docs actually stores for Shift+Enter
const BR_VT = '\u000B'; // arrives in pasted content
const BR_LS = '\u2028'; // Unicode LINE SEPARATOR, arrives from web pastes

/** Cleans, then cleans the result again, asserting the second pass changes nothing. */
const stable = (input, options) => {
  const once = cpCleanText(input, options);
  const twice = cpCleanText(once, options);
  assert.equal(twice, once, `not idempotent:\n  1st: ${JSON.stringify(once)}\n  2nd: ${JSON.stringify(twice)}`);
  return once;
};

/** Block plan helper: turns plain strings into the shape cpPlanJoins expects. */
const blocks = (texts, overrides = {}) =>
  texts.map((text, index) => ({
    text,
    joinable: true,
    adjacentToPrev: index > 0,
    ...(overrides[index] || {}),
  }));

/* ================================================================== *
 * Whitespace
 * ================================================================== */

test('collapses repeated spaces to one', () => {
  assert.equal(stable('Hello    world'), 'Hello world');
});

test('collapses a tab in the middle of a line to a single space', () => {
  assert.equal(stable('Hello\tworld'), 'Hello world');
  assert.equal(stable('Hello \t  world'), 'Hello world');
});

test('removes leading and trailing whitespace from a line', () => {
  assert.equal(stable('   Hello world   '), 'Hello world');
  assert.equal(stable('\t\tIndented from a PDF'), 'Indented from a PDF');
});

test('normalises non-breaking and exotic spaces to a plain space', () => {
  assert.equal(stable('Hello\u00A0world'), 'Hello world');
  assert.equal(stable('Hello\u2009 world'), 'Hello world');
  assert.equal(stable('10\u00A0kg'), '10 kg');
});

test('a single ordinary space is left completely alone', () => {
  assert.deepEqual(cpPlanTextEdits('Hello world'), []);
});

test('collapsing spaces is a pure deletion, so no formatting is rewritten', () => {
  // The surviving character is one of the original spaces, not a new one. That is
  // what stops a bold word's run from swallowing the space after it when the two
  // spaces behind it collapse.
  assert.deepEqual(cpPlanTextEdits('Hello  world'), [{ start: 6, end: 6, insert: '' }]);
  assert.deepEqual(cpPlanTextEdits('Hello    world'), [{ start: 6, end: 8, insert: '' }]);

  // A space anywhere in the run is enough; the tabs around it are deleted.
  assert.deepEqual(cpPlanTextEdits('Hello\t \tworld'), [
    { start: 5, end: 5, insert: '' },
    { start: 7, end: 7, insert: '' },
  ]);
});

test('a run with no ordinary space in it has to be replaced', () => {
  assert.deepEqual(cpPlanTextEdits('Hello\tworld'), [{ start: 5, end: 5, insert: ' ' }]);
  assert.deepEqual(cpPlanTextEdits('Hello\u00A0world'), [{ start: 5, end: 5, insert: ' ' }]);
});

test('whitespace cleanup can be switched off', () => {
  assert.equal(cpCleanText('Hello    world', { spacing: false }), 'Hello    world');
});

/* ================================================================== *
 * Hidden characters
 * ================================================================== */

test('removes zero-width space, word joiner, BOM, soft hyphen', () => {
  assert.equal(stable('He\u200Bllo\u2060 wor\uFEFFld\u00AD'), 'Hello world');
});

test('removes OCR control characters but keeps the soft line break', () => {
  assert.equal(stable('Hello\u0001\u001Fworld'), 'Helloworld');
  assert.equal(cpCleanText(`Short${BR}Also short`, { lineBreaks: false }), `Short${BR}Also short`);
});

test('keeps ZWJ and ZWNJ, which are load-bearing in emoji and Indic scripts', () => {
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  assert.equal(stable(family), family);
  assert.equal(stable('می‌خواهم'), 'می‌خواهم');
});

test('hidden character cleanup can be switched off', () => {
  assert.equal(cpCleanText('a\u200Bb', { hidden: false }), 'a\u200Bb');
});

/* ================================================================== *
 * Line break reconstruction -- the joins that should happen
 * ================================================================== */

test('joins a line the PDF broke mid-sentence', () => {
  const dirty = `The committee reviewed the proposal at length${BR}and agreed to postpone the decision.`;
  assert.equal(
    stable(dirty),
    'The committee reviewed the proposal at length and agreed to postpone the decision.'
  );
});

test('joins three wrapped lines into one paragraph', () => {
  const dirty =
    `Under the terms of the agreement the supplier${BR}` +
    `shall deliver the goods within thirty days of${BR}` +
    `receiving a written order.`;
  assert.equal(
    stable(dirty),
    'Under the terms of the agreement the supplier shall deliver the goods within ' +
      'thirty days of receiving a written order.'
  );
});

test('a hyphen split across the break joins without a space, keeping the hyphen', () => {
  const dirty = `Measurements confirmed the improved perfor-${BR}mance of the new engine.`;
  assert.equal(stable(dirty), 'Measurements confirmed the improved perfor-mance of the new engine.');
});

test('joining swallows the whitespace hugging the break', () => {
  const dirty = `The committee reviewed the proposal at length   ${BR}   and agreed to it later on.`;
  assert.equal(
    stable(dirty),
    'The committee reviewed the proposal at length and agreed to it later on.'
  );
});

test('joins across separate paragraphs too', () => {
  const texts = [
    'Under the terms of the agreement the supplier',
    'shall deliver the goods within thirty days.',
  ];
  assert.deepEqual(cpPlanJoins(blocks(texts)), [1]);
});

/* ================================================================== *
 * Line break reconstruction -- the joins that must NOT happen
 * ================================================================== */

test('never joins after a full stop', () => {
  assert.equal(cpShouldJoin('The committee reviewed the whole proposal.', 'It agreed to postpone.'), false);
});

test('never joins after a colon, semicolon or comma-free question mark', () => {
  assert.equal(cpShouldJoin('The following items were considered by us:', 'Budget forecasts'), false);
  assert.equal(cpShouldJoin('Several items were raised at the meeting;', 'others were deferred'), false);
  assert.equal(cpShouldJoin('Did the committee actually review the proposal?', 'Nobody could say'), false);
});

test('never joins a short line, which is usually deliberate', () => {
  assert.equal(cpShouldJoin('Yours sincerely', 'Jane Watson'), false);
  assert.equal(cpShouldJoin('57 Seonhwa-ro', 'Jung-gu, Daejeon'), false);
});

test('never joins a Title Case line onto the body text under it', () => {
  assert.equal(cpLooksLikeHeading('Chapter Three: The Long Road Ahead'), true);
  assert.equal(
    cpShouldJoin('Quarterly Results And Operating Highlights', 'The group reported revenue growth'),
    false
  );
});

test('never joins an ALL CAPS heading onto the body text under it', () => {
  assert.equal(
    cpShouldJoin('TERMS AND CONDITIONS OF SUPPLY AGREEMENT', 'These terms apply to all orders'),
    false
  );
});

test('never joins into or out of a hand-typed bullet or number', () => {
  const long = 'The committee considered each of the following points';
  assert.equal(cpShouldJoin(long, '- the first point raised'), false);
  assert.equal(cpShouldJoin(long, '1. the first point raised'), false);
  assert.equal(cpShouldJoin(long, '• the first point raised'), false);
  assert.equal(cpShouldJoin('- a bullet that runs on for quite a long while', 'and continues here'), false);
});

test('never joins when the previous line ends on punctuation that is not a hyphen', () => {
  assert.equal(cpShouldJoin('The report covered every relevant topic *', 'and then some'), false);
});

test('paragraph boundaries survive: two real sentences stay two blocks', () => {
  const texts = [
    'The committee reviewed the proposal at length and agreed.',
    'The next meeting will be held in March of next year.',
  ];
  assert.deepEqual(cpPlanJoins(blocks(texts)), []);
});

test('a non-joinable block breaks the run and is never merged', () => {
  const texts = [
    'Under the terms of the agreement the supplier',
    'Heading Style Paragraph',
    'shall deliver the goods within thirty days of receipt',
  ];
  const plan = cpPlanJoins(blocks(texts, { 1: { joinable: false } }));
  assert.deepEqual(plan, []);
});

test('a block that is not the immediately preceding sibling is never merged into', () => {
  const texts = [
    'Under the terms of the agreement the supplier',
    'shall deliver the goods within thirty days.',
  ];
  assert.deepEqual(cpPlanJoins(blocks(texts, { 1: { adjacentToPrev: false } })), []);
});

test('line break cleanup can be switched off', () => {
  const dirty = `The committee reviewed the proposal at length${BR}and agreed to postpone it.`;
  assert.equal(cpCleanText(dirty, { lineBreaks: false }), dirty);
});

test('all three soft break characters are treated as line breaks', () => {
  const line = 'The committee reviewed the proposal at length';
  const rest = 'and agreed to postpone the decision.';
  for (const br of [BR, BR_VT, BR_LS]) {
    assert.equal(
      stable(`${line}${br}${rest}`),
      `${line} ${rest}`,
      `soft break U+${br.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')} was not joined`
    );
  }
});

test('a carriage return is never treated as a hidden character to delete', () => {
  // Short lines are not joined, so the break must simply survive untouched.
  assert.equal(stable(`Short one${BR}Short two`), `Short one${BR}Short two`);
});

/* ================================================================== *
 * Lists, URLs, code-like text, punctuation
 * ================================================================== */

test('a list-shaped run of blocks is left entirely alone', () => {
  const texts = [
    '- Review the quarterly figures before the meeting',
    '- Circulate the agenda to every attending member',
    '- Book the larger room on the third floor of the annex',
  ];
  assert.deepEqual(cpPlanJoins(blocks(texts)), []);
});

test('a URL is never split or joined into', () => {
  const long = 'The full documentation is available at the address';
  assert.equal(cpShouldJoin(long, 'https://example.com/docs/getting-started'), true);
  // ...but the URL text itself is never rewritten.
  assert.equal(stable('https://example.com/a__b?q=1&r=2'), 'https://example.com/a__b?q=1&r=2');
});

test('code-like text keeps its interior single spaces and its symbols', () => {
  assert.equal(stable('const x = fn(a, b);'), 'const x = fn(a, b);');
});

test('currency, numbers and punctuation are never rewritten', () => {
  assert.equal(stable('Total: $1,234.56 (up 3.2%)'), 'Total: $1,234.56 (up 3.2%)');
});

/* ================================================================== *
 * Language coverage
 * ================================================================== */

test('Korean prose survives whitespace cleanup unchanged', () => {
  assert.equal(stable('한국어 문장은 그대로 유지된다.'), '한국어 문장은 그대로 유지된다.');
  assert.equal(stable('한국어    문장'), '한국어 문장');
});

test('Korean wrapped lines join, because case-based heading detection cannot apply', () => {
  const dirty =
    `위원회는 제출된 제안서를 충분히 검토한 결과 다음과 같은${BR}결론에 도달하였다.`;
  assert.equal(
    stable(dirty),
    '위원회는 제출된 제안서를 충분히 검토한 결과 다음과 같은 결론에 도달하였다.'
  );
});

test('Korean sentences that already ended are not joined', () => {
  assert.equal(
    cpShouldJoin('위원회는 제출된 제안서를 충분히 검토하였다.', '다음 회의는 삼월에 열린다.'),
    false
  );
});

test('mixed Korean and English is handled by the same rules', () => {
  const dirty = `Google Docs 문서에서 붙여넣은 텍스트를 정리하는 도구이며${BR}설치가 간단하다.`;
  assert.equal(
    stable(dirty),
    'Google Docs 문서에서 붙여넣은 텍스트를 정리하는 도구이며 설치가 간단하다.'
  );
});

/* ================================================================== *
 * Blank lines
 * ================================================================== */

test('collapses a run of empty blocks to one', () => {
  const texts = ['First', '', '', '', 'Second'];
  assert.deepEqual(cpPlanBlankLineRemovals(blocks(texts)), [2, 3]);
});

test('a single blank line between paragraphs is never removed', () => {
  assert.deepEqual(cpPlanBlankLineRemovals(blocks(['First', '', 'Second'])), []);
});

test('blocks holding only whitespace count as blank', () => {
  assert.deepEqual(cpPlanBlankLineRemovals(blocks(['First', '   ', '\t', 'Second'])), [2]);
});

test('blank line collapsing is idempotent', () => {
  const texts = ['First', '', '', '', 'Second'];
  const removals = cpPlanBlankLineRemovals(blocks(texts));
  const survivors = texts.filter((_, index) => !removals.includes(index));
  assert.deepEqual(cpPlanBlankLineRemovals(blocks(survivors)), []);
});

/* ================================================================== *
 * Idempotency of the block-level plans
 * ================================================================== */

test('running the join plan twice produces no further joins', () => {
  const texts = [
    'Under the terms of the agreement the supplier',
    'shall deliver the goods within thirty days of',
    'receiving a written order.',
    'The next review is scheduled for March.',
  ];
  const plan = cpPlanJoins(blocks(texts));
  assert.deepEqual(plan, [1, 2]);

  const merged = ['Under the terms of the agreement the supplier shall deliver the goods ' +
    'within thirty days of receiving a written order.', texts[3]];
  assert.deepEqual(cpPlanJoins(blocks(merged)), []);
});

test('a wrapped run followed by a heading-shaped line does not creep into it', () => {
  const texts = [
    'Under the terms of the agreement the supplier',
    'shall deliver the goods within thirty days of receipt',
    'Payment Terms And Conditions',
    'Invoices are due thirty days after the delivery date.',
  ];
  assert.deepEqual(cpPlanJoins(blocks(texts)), [1]);
});

/* ================================================================== *
 * Options plumbing
 * ================================================================== */

test('defaults are the four safe cleanups, with link removal off', () => {
  assert.deepEqual(CP_DEFAULTS, {
    spacing: true,
    blankLines: true,
    hidden: true,
    lineBreaks: true,
    links: false,
  });
});

test('unspecified options fall back to the defaults and unknown keys are dropped', () => {
  assert.deepEqual(cpOptions({ links: true, nonsense: true }), {
    spacing: true,
    blankLines: true,
    hidden: true,
    lineBreaks: true,
    links: true,
  });
});

/* ================================================================== *
 * Realistic fixtures: dirty input -> expected clean output
 * ================================================================== */

test('fixture: a paragraph pasted out of a PDF', () => {
  const dirty =
    `  The Board of Directors met on 14 March to consider the${BR}` +
    `proposed  acquisition of  Northfield Logistics  Limited.${BR}` +
    `After  a  full  discussion the Board resolved  to  proceed.  `;

  // The first break falls mid-sentence and is repaired. The second one falls
  // immediately after a full stop, and CleanPaste deliberately leaves it: from
  // the characters alone, a sentence ending at the end of a line is
  // indistinguishable from a paragraph ending there. Leaving a break the user can
  // delete is the cheap mistake; welding two paragraphs together is the expensive
  // one, and it is the exact complaint made against the incumbent add-ons.
  assert.equal(
    stable(dirty),
    'The Board of Directors met on 14 March to consider the proposed acquisition of ' +
      `Northfield Logistics Limited.${BR}` +
      'After a full discussion the Board resolved to proceed.'
  );
});

test('fixture: text pasted out of a web page, full of non-breaking spaces', () => {
  const dirty = 'Shipping\u00A0is\u00A0free\u00A0on\u00A0orders\u00A0over\u00A0\u200B$50.\u00AD';
  assert.equal(stable(dirty), 'Shipping is free on orders over $50.');
});

test('fixture: OCR output with stray control characters and ragged lines', () => {
  const dirty =
    `\u0002The applicant submitted the required documents on${BR}` +
    `\u0007  the fourteenth of March, well within the deadline.`;
  assert.equal(
    stable(dirty),
    'The applicant submitted the required documents on the fourteenth of March, ' +
      'well within the deadline.'
  );
});

test('fixture: an address block is never welded together', () => {
  const dirty = `Northfield Logistics Limited${BR}Unit 4, Hollowbrook Estate${BR}Manchester M1 4XY`;
  assert.equal(stable(dirty), dirty);
});

test('fixture: a heading followed by its body text stays two lines', () => {
  const dirty = `Payment Terms And Conditions${BR}Invoices are due thirty days after delivery of goods.`;
  assert.equal(stable(dirty), dirty);
});

/* ================================================================== *
 * Edits are structurally sound
 * ================================================================== */

test('planned edits never overlap and are always in ascending order', () => {
  const samples = [
    '  a  b  \u200B c ',
    `x${BR}y${BR}z`,
    `The committee reviewed the proposal at length  ${BR}  and agreed to postpone.`,
    '\u00A0\u00A0\u00A0',
    '',
  ];
  for (const sample of samples) {
    const edits = cpPlanTextEdits(sample);
    let previousEnd = -1;
    for (const edit of edits) {
      assert.ok(edit.start > previousEnd, `overlap in ${JSON.stringify(sample)}`);
      assert.ok(edit.end >= edit.start, `inverted range in ${JSON.stringify(sample)}`);
      assert.ok(edit.end < sample.length, `out of range in ${JSON.stringify(sample)}`);
      previousEnd = edit.end;
    }
    // Applying the edits must reproduce exactly what cpCleanText claims.
    assert.equal(cpApplyEdits(sample, edits), cpCleanText(sample));
  }
});

test('an empty or whitespace-only block cleans to nothing without error', () => {
  assert.equal(stable(''), '');
  assert.equal(stable('     '), '');
  assert.equal(stable('\t \u00A0 '), '');
});

test('the join separator is a space, or nothing after whitespace or a hyphen', () => {
  assert.equal(cpJoinSeparator('word'), ' ');
  assert.equal(cpJoinSeparator('word '), '');
  assert.equal(cpJoinSeparator('perfor-'), '');
  assert.equal(cpJoinSeparator(''), '');
});
