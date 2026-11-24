#!/usr/bin/env node
/**
 * No-LLM benchmark runner. One suite per rung; `--suite` picks the file.
 *
 * Two systems answer every utterance:
 *   baseline — what you write before you have a library. For taxonomy: take the
 *              first wh-word, special-case "how many", look for compare/vs. For
 *              negation: any subject word that follows a negation word anywhere
 *              in the sentence, with no scope and no effect on the entities.
 *   library  — analyzeQuestion() from boaz.
 *
 * A task passes only when the type matches (where asserted), every declared
 * entity is present, the exclusion set matches exactly, and no excluded subject
 * is also counted as an entity.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export function baselineType(query) {
  const s = query.toLowerCase().trim();
  if (/^compare\b/.test(s)) return 'compare';
  if (/\b(vs\.?|versus)\b/.test(s)) return 'compare';
  const lead = s.match(/^(?:can you |could you |please |and )?(who|what|where|when|why|which|how)\b/);
  if (!lead) return 'unknown';
  if (lead[1] === 'how') return /^how (many|much)\b/.test(s) ? 'how-many' : 'unknown';
  return lead[1];
}

const NEGATION_WORD = /\b(?:not|except|excluding|excludes?|besides|without|other than|apart from|anything but)\b/;

/** The subject's own first word, which is what a hand-written scan would look for. */
function anchor(subject) {
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !['the', 'a', 'an'].includes(word));
  return words[0] ?? '';
}

export function baselineExclusions(query, subjects) {
  const text = query.toLowerCase();
  const out = [];
  for (const subject of subjects) {
    const word = anchor(subject);
    if (!word) continue;
    const at = text.search(new RegExp(`\\b${word}`));
    if (at < 0) continue;
    if (NEGATION_WORD.test(text.slice(0, at))) out.push(subject);
  }
  return out;
}

export function baselineAnalysis(query, subjects = [], context = {}) {
  // A hand-written pointer scan: any pronoun resolves to whatever the last turn
  // was about, ordinals resolve to nothing, and a partial name only matches when
  // it is the whole name.
  const saysPronoun = /\b(?:he|him|his|she|her|it|its|that|this|those|these|they|them)\b/.test(
    query.toLowerCase(),
  );
  return {
    type: baselineType(query),
    slots: {
      entities: [],
      attribute: null,
      subject: null,
      newest: null,
      referenced: saysPronoun,
      reference: saysPronoun && context.subject ? { kind: 'pronoun', value: context.subject, cue: 'pronoun' } : null,
      exclude: baselineExclusions(query, subjects),
      mentions: [],
    },
  };
}

const sameSet = (a = [], b = []) =>
  a.length === b.length && [...a].sort().every((value, i) => value === [...b].sort()[i]);

export function scoreTask(task, analysis) {
  const want = task.expect;
  const problems = [];
  if (want.type && analysis.type !== want.type) problems.push(`type ${analysis.type} != ${want.type}`);
  for (const entity of want.entities ?? []) {
    if (!analysis.slots.entities.includes(entity)) problems.push(`missing entity ${entity}`);
  }
  if (want.attribute && analysis.slots.attribute !== want.attribute) {
    problems.push(`attribute ${analysis.slots.attribute} != ${want.attribute}`);
  }
  const got = analysis.slots.exclude ?? [];
  if (want.exclude && !sameSet(got, want.exclude)) {
    problems.push(`exclude [${got.join(', ')}] != [${want.exclude.join(', ')}]`);
  }
  const leaked = got.filter((subject) => analysis.slots.entities.includes(subject));
  if (leaked.length) problems.push(`excluded but counted as entity: ${leaked.join(', ')}`);
  if ('reference' in want) {
    const resolved = analysis.slots.reference?.value ?? null;
    if (resolved !== want.reference) problems.push(`reference ${resolved} != ${want.reference}`);
  }
  return { ok: problems.length === 0, problems };
}

function rate(rows) {
  const passed = rows.filter((row) => row.ok).length;
  return Math.round((passed / rows.length) * 1000) / 10;
}

function argValue(flag) {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main() {
  const { analyzeQuestion } = await import('boaz');
  const suitePath = argValue('--suite') ?? 'tasks.json';
  const suite = JSON.parse(await readFile(path.resolve(here, suitePath), 'utf8'));
  const subjects = suite.subjects ?? [];

  const rows = suite.tasks.map((task) => {
    const context = task.context ?? {};
    const before = baselineAnalysis(task.q, subjects, context);
    const after = analyzeQuestion(task.q, { subjects, context });
    const b = scoreTask(task, before);
    const a = scoreTask(task, after);
    return { q: task.q, want: task.expect, before, after, b, a };
  });

  const beforePct = rate(rows.map((r) => ({ ok: r.b.ok })));
  const afterPct = rate(rows.map((r) => ({ ok: r.a.ok })));

  if (process.argv.includes('--json')) {
    const out = {
      class: suite.class,
      n: rows.length,
      before: beforePct,
      after: afterPct,
      rows: rows.map((r) => ({
        q: r.q,
        want: r.want,
        beforeExclude: r.before.slots.exclude,
        afterExclude: r.after.slots.exclude,
        afterEntities: r.after.slots.entities,
        afterReference: r.after.slots.reference,
        beforePass: r.b.ok,
        afterPass: r.a.ok,
        problems: r.a.problems,
      })),
    };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    `${suite.class}: ${afterPct}% (${rows.filter((r) => r.a.ok).length}/${rows.length}) after, ` +
      `${beforePct}% (${rows.filter((r) => r.b.ok).length}/${rows.length}) before\n`,
  );

  const misses = rows.filter((r) => !r.a.ok);
  if (misses.length > 0) {
    process.stdout.write('\nmisses:\n');
    for (const miss of misses) {
      process.stdout.write(`  "${miss.q}"  (${miss.a.problems.join('; ')})\n`);
    }
  }
  const wins = rows.filter((r) => !r.b.ok && r.a.ok);
  if (wins.length > 0) process.stdout.write(`\nfixed by the library: ${wins.length}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('run.mjs')) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
