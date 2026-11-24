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
 *
 * The two systems and the scorer live in ./grade.mjs, because the browser
 * scorecard at /labs/no-llm/ grades the same suites with the same code. If you
 * change the grader here, the page's numbers change with it on the next build.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { baselineAnalysis, scoreTask } from './grade.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

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
    const context = { ...(task.context ?? {}), ...(suite.baseline === 'naive' ? { naive: true } : {}) };
    const before = baselineAnalysis(task.q, subjects, context);
    const after = analyzeQuestion(task.q, { subjects, context: task.context ?? {} });
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
        afterCombine: r.after.slots.combine?.op ?? null,
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
