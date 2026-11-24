#!/usr/bin/env node
/**
 * Rung 9: long-form from facts. Compile each spike ledger entry into a post
 * outline and score it.
 *
 *   baseline — what the loop has been doing by hand: take the note's first
 *              sentence and the commit line, and stop. That is a grep, not an
 *              outline: one claim, no boundary, no question.
 *   compiler — `scripts/outline.mjs`: parse the entry, select the sentences that
 *              carry measurements, keep commit and gates as provenance, reframe
 *              the first ceiling bullet as the open question.
 *
 * Five components per task, all required:
 *   structure   two or more claims, two or more evidence lines, a question ending in ?
 *   headline    the first claim carries the entry's pass-rate delta and task count
 *   provenance  the evidence names the commit and the gate numbers
 *   numbers     every percentage and task count in the pass rate survives into the outline
 *   fidelity    the outline carries no number the entry does not
 *
 * The fidelity component is the point: a summary may drop a number, but a number
 * that is not in the ledger is an invention, and this is the check that would
 * have caught it.
 *
 * Usage: node bench/no-llm/outline.mjs [--ledger <path>] [--suite outline.json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseLedger, compileOutline, naiveOutline, renderOutline, numbersIn } from '../../scripts/outline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'outline.json'), 'utf8'));
const ledgerPath = argValue('--ledger') ?? path.resolve(here, 'outline-ledger.md');
const entries = parseLedger(await readFile(ledgerPath, 'utf8'));

const pctOf = (text) => String(text).match(/\d+(?:\.\d+)?%/g) ?? [];

/** Percentages and task counts a claim has to keep to count as the measurement. */
function requiredNumbers(entry) {
  const first = entry.passRate.split(/(?<=[.!?])\s+/)[0] ?? '';
  const found = new Set(pctOf(first));
  const tasks = /(\d+)\s+tasks?/.exec(first);
  if (tasks) found.add(`${tasks[1]} tasks`);
  return [...found];
}

function score(outline, entry) {
  const text = [
    ...outline.claims.map((c) => c.text),
    ...outline.evidence,
    outline.openQuestion,
    outline.boundary ?? '',
  ].join(' ');
  const checks = {};
  checks.structure =
    outline.claims.length >= 2 && outline.evidence.length >= 2 && /\?$/.test(outline.openQuestion.trim()) && outline.openQuestion.length >= 12;
  const headline = requiredNumbers(entry);
  checks.headline = headline.length
    ? headline.every((n) => (outline.claims[0]?.text ?? '').includes(n))
    : numbersIn(outline.claims[0]?.text ?? '').length >= 2;
  const commit = /([0-9a-f]{7,}\b|v\d+\.\d+\.\d+)/.exec(entry.commit)?.[1] ?? '';
  const audit = /audit\s+\d+\/\d+/.exec(entry.gates)?.[0] ?? '';
  checks.provenance = [commit, audit].filter(Boolean).every((needle) => text.includes(needle));
  checks.numbers = headline.every((n) => text.includes(n));
  const stray = numbersIn(text).filter((n) => !entry.raw.includes(n.replace(/%$/, '')));
  checks.fidelity = stray.length === 0;
  return { checks, ok: Object.values(checks).every(Boolean), headline, stray };
}

const rows = [];
for (const task of suite.tasks) {
  const entry = entries.find((e) => (task.at ? e.timestamp === task.at : e.rung === task.rung));
  if (!entry) {
    rows.push({ rung: task.rung, missing: true });
    continue;
  }
  const before = naiveOutline(entry);
  const after = compileOutline(entry);
  const beforeScore = score(before, entry);
  const afterScore = score(after, entry);
  const questionOk = !task.questionMust || after.openQuestion.toLowerCase().includes(task.questionMust.toLowerCase());
  rows.push({
    rung: task.rung,
    at: task.at,
    name: entry.name,
    before: beforeScore,
    after: afterScore,
    questionOk,
    ok: afterScore.ok && questionOk,
    statsOk: beforeScore.ok,
    outline: after,
    rendered: renderOutline(after),
  });
}

const n = rows.length;
const beforePass = rows.filter((r) => r.statsOk).length;
const afterPass = rows.filter((r) => r.ok).length;
const pct = (k) => `${Math.round((k / n) * 1000) / 10}%`;

process.stdout.write(`outline: ${pct(beforePass)} -> ${pct(afterPass)} (${n} entries, baseline ${beforePass}/${n}, compiler ${afterPass}/${n})\n`);
for (const row of rows) {
  if (row.missing) {
    process.stdout.write(`  rung ${row.rung}: not in the ledger\n`);
    continue;
  }
  const failed = Object.entries(row.after.checks).filter(([, ok]) => !ok).map(([k]) => k);
  const beforeFailed = Object.entries(row.before.checks).filter(([, ok]) => !ok).map(([k]) => k);
  const note = failed.length || !row.questionOk ? ` after fails: ${[...failed, ...(row.questionOk ? [] : ['question'])]}` : '';
  process.stdout.write(`  rung ${row.rung}: before ${5 - beforeFailed.length}/5 (fails ${beforeFailed.join(',')}) after ${5 - failed.length}/5${note}\n`);
  process.stdout.write(`    q: ${row.outline.openQuestion}\n`);
  if (verbose) process.stdout.write(`${row.rendered}\n`);
}

// The ceiling this rung actually has: how much of the outline is new prose.
const norm = (text) => String(text).replace(/\s+/g, ' ').trim();
const claimChars = rows.reduce((sum, r) => sum + (r.outline?.claims ?? []).reduce((s, c) => s + c.text.length, 0), 0);
const verbatim = rows.reduce((sum, r) => {
  const raw = norm(entries.find((e) => e.rung === r.rung && (!r.at || e.timestamp === r.at))?.raw ?? '');
  return sum + (r.outline?.claims ?? []).filter((c) => raw.includes(norm(c.text))).reduce((s, c) => s + c.text.length, 0);
}, 0);
const component = (side, key) => rows.filter((r) => r[side]?.checks?.[key]).length;
process.stdout.write(
  `verbatim: ${claimChars ? Math.round((verbatim / claimChars) * 1000) / 10 : 0}% of claim text is ledger text (${claimChars} chars over ${rows.length} entries)\n`,
);
for (const key of ['structure', 'headline', 'provenance', 'numbers', 'fidelity']) {
  process.stdout.write(`  ${key}: baseline ${component('before', key)}/${n} compiler ${component('after', key)}/${n}\n`);
}
process.exitCode = afterPass === n ? 0 : 1;
