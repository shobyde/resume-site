#!/usr/bin/env node
/**
 * Rung 1 runner: question taxonomy and slot filling, without a model.
 *
 * Two systems answer the same 40 utterances:
 *   baseline — the leading-interrogative heuristic, i.e. what you write before
 *              you have a library: take the first wh-word, special-case "how
 *              many", and look for "compare"/"vs" anywhere.
 *   library  — analyzeQuestion() from client-agent.
 *
 * A task passes only when the type matches AND every slot the task declares is
 * filled. Numbers are per task; --json writes the full table.
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

export function baselineAnalysis(query) {
  return {
    type: baselineType(query),
    slots: { entities: [], attribute: null, subject: null, newest: null, referenced: false, mentions: [] },
  };
}

export function scoreTask(task, analysis) {
  const want = task.expect;
  const problems = [];
  if (analysis.type !== want.type) problems.push(`type ${analysis.type} != ${want.type}`);
  for (const entity of want.entities ?? []) {
    if (!analysis.slots.entities.includes(entity)) problems.push(`missing entity ${entity}`);
  }
  if (want.attribute && analysis.slots.attribute !== want.attribute) {
    problems.push(`attribute ${analysis.slots.attribute} != ${want.attribute}`);
  }
  return { ok: problems.length === 0, problems };
}

function rate(rows) {
  const passed = rows.filter((row) => row.ok).length;
  return Math.round((passed / rows.length) * 1000) / 10;
}

async function main() {
  const { analyzeQuestion } = await import('client-agent');
  const suite = JSON.parse(await readFile(path.join(here, 'tasks.json'), 'utf8'));
  const subjects = suite.subjects ?? [];

  const rows = suite.tasks.map((task) => {
    const before = baselineAnalysis(task.q);
    const after = analyzeQuestion(task.q, { subjects });
    const b = scoreTask(task, before);
    const a = scoreTask(task, after);
    return { q: task.q, want: task.expect, before, after, b, a };
  });

  const byType = new Map();
  for (const row of rows) {
    const key = row.want.type;
    const entry = byType.get(key) ?? { type: key, n: 0, before: 0, after: 0 };
    entry.n += 1;
    if (row.b.ok) entry.before += 1;
    if (row.a.ok) entry.after += 1;
    byType.set(key, entry);
  }

  const beforePct = rate(rows.map((r) => ({ ok: r.b.ok })));
  const afterPct = rate(rows.map((r) => ({ ok: r.a.ok })));
  const typeBefore = rate(rows.map((r) => ({ ok: r.before.type === r.want.type })));
  const typeAfter = rate(rows.map((r) => ({ ok: r.after.type === r.want.type })));

  if (process.argv.includes('--json')) {
    const out = {
      class: suite.class,
      n: rows.length,
      before: beforePct,
      after: afterPct,
      typeBefore,
      typeAfter,
      rows: rows.map((r) => ({
        q: r.q,
        want: r.want,
        before: r.before.type,
        after: r.after.type,
        afterSlots: r.after.slots,
        beforePass: r.b.ok,
        afterPass: r.a.ok,
        problems: r.a.problems,
      })),
    };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }

  const label = (n, total) => `${n}/${total}`;
  for (const [type, entry] of byType) {
    process.stdout.write(
      `${type.padEnd(9)} ${label(entry.after, entry.n).padStart(5)} after  ` +
        `${label(entry.before, entry.n).padStart(5)} before\n`,
    );
  }
  process.stdout.write(
    `\n${suite.class}: ${afterPct}% (${rows.filter((r) => r.a.ok).length}/${rows.length}) after, ` +
      `${beforePct}% (${rows.filter((r) => r.b.ok).length}/${rows.length}) before\n`,
  );
  process.stdout.write(`type only: ${typeAfter}% after, ${typeBefore}% before\n`);

  const misses = rows.filter((r) => !r.a.ok);
  if (misses.length > 0) {
    process.stdout.write('\nmisses:\n');
    for (const miss of misses) {
      process.stdout.write(`  "${miss.q}"  want ${miss.want.type}, got ${miss.after.type}`);
      if (miss.a.problems.length) process.stdout.write(`  (${miss.a.problems.join('; ')})`);
      process.stdout.write('\n');
    }
  }
  const breaks = rows.filter((r) => r.b.ok && !r.a.ok);
  if (breaks.length > 0) {
    process.stdout.write(`\nregressions against baseline: ${breaks.length}\n`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('run.mjs')) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
