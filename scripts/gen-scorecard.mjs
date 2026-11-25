#!/usr/bin/env node
/**
 * Regenerates measured numbers for the no-LLM scorecard at /labs/no-llm/.
 *
 * Every number on that page comes from running the class's own harness and
 * reading what it printed. Nothing here is typed in from memory: the fraction
 * is parsed out of the harness output with the regex declared beside it, and a
 * class whose regex stops matching fails this script instead of shipping a
 * stale number (`SUITE FAILED n/40 ...` and exit 1).
 *
 *   node scripts/gen-scorecard.mjs            # run every suite, rewrite the json
 *   node scripts/gen-scorecard.mjs --only taxonomy,negation
 *
 * Cost: about 90 seconds, most of it the browser-agent suite (real Chromium).
 * Run it after any change to a suite, a harness, or the library. The suites are
 * scored against the installed `@shobyde/boaz`, so a page built on an older
 * package will show the older numbers.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const out = path.join(repo, 'labs/no-llm/scorecard.json');

const boazVersion = JSON.parse(
  readFileSync(path.join(repo, 'node_modules/@shobyde/boaz/package.json'), 'utf8'),
).version;

/**
 * `p`/`t` named groups: passed, total. `before: null` means the harness prints
 * no before number, and the recorded one lives in the ledger; the page shows
 * that as a dash rather than inventing a baseline.
 */
const CLASSES = [
  {
    id: 'taxonomy', rung: 1, name: 'Question taxonomy and slot filling', suite: 'tasks.json',
    cmd: ['bench/no-llm/run.mjs', '--suite', 'tasks.json'],
    after: /\((?<p>\d+)\/(?<t>\d+)\) after/, before: /\((?<p>\d+)\/(?<t>\d+)\) before/,
    ceiling: 'none found this run: all 40 utterances classify, and the type is the only thing the suite asserts for most of them',
  },
  {
    id: 'negation', rung: 2, name: 'Negation and exclusion', suite: 'negation.json',
    cmd: ['bench/no-llm/run.mjs', '--suite', 'negation.json'],
    after: /\((?<p>\d+)\/(?<t>\d+)\) after/, before: /\((?<p>\d+)\/(?<t>\d+)\) before/,
    ceiling: '"nothing about hobnob, tell me about readback" reads as a topic shift, not an exclusion, so Hobnob stays in the entity set',
  },
  {
    id: 'reference', rung: 3, name: 'Reference: ordinals, pronouns, partial names', suite: 'reference.json',
    cmd: ['bench/no-llm/run.mjs', '--suite', 'reference.json'],
    after: /\((?<p>\d+)\/(?<t>\d+)\) after/, before: /\((?<p>\d+)\/(?<t>\d+)\) before/,
    ceiling: 'a description ("the one that uses sqlite") needs the fact join, not an antecedent',
  },
  {
    id: 'compound', rung: 4, name: 'Compound asks: intersection and union', suite: 'compound.json',
    cmd: ['bench/no-llm/run.mjs', '--suite', 'compound.json'],
    after: /\((?<p>\d+)\/(?<t>\d+)\) after/, before: /\((?<p>\d+)\/(?<t>\d+)\) before/,
    ceiling: 'three-name chains, "neither ... nor", and two asks joined by "and" are documented ceilings, not extraction errors',
  },
  {
    id: 'synonyms', rung: 5, name: 'Synonyms from a bundled table', suite: 'synonyms.json',
    cmd: ['bench/no-llm/run.mjs', '--suite', 'synonyms.json'],
    after: /\((?<p>\d+)\/(?<t>\d+)\) after/, before: /\((?<p>\d+)\/(?<t>\d+)\) before/,
    ceiling: 'a synonym outside the table fails silently, and an alias plus a connective loses combine',
  },
  {
    id: 'answers', rung: 4, name: 'The real engine answers the joined set', suite: 'compound.json',
    cmd: ['bench/no-llm/answers.mjs'],
    after: /\((?<p>\d+)\/(?<t>\d+)\) against the real engine/, before: null,
    ceiling: 'scored on the first sentence of the answer, which is where the answered set lives',
  },
  {
    id: 'discourse', rung: 6, name: 'Discourse plans from the record set', suite: 'discourse.json',
    cmd: ['bench/no-llm/discourse.mjs'],
    after: /^discourse: [\d.]+% \((?<p>\d+)\/(?<t>\d+)\)/m, before: null,
    ceiling: 'a declared constant is unreachable by its first word ("a2ui"), a punctuated subject never reaches a rule ("c++"), and an unknown second name drops combine',
  },
  {
    id: 'property', rung: 26, name: 'A property the cards describe', suite: 'property.json',
    cmd: ['bench/no-llm/property.mjs'],
    after: /^property: (?<p>\d+)\/(?<t>\d+)/m, before: null,
    ceiling: 'a property word on most cards is treated as a common noun and dropped ("app"), a negation in the same sentence as a real claim is read as a denial, and polysemy is not resolved: "surface model" answers a question about language models',
  },
  {
    id: 'summarise', rung: 7, name: 'Extractive summarisation with citations', suite: 'summarise.json',
    cmd: ['bench/no-llm/summarise.mjs'],
    after: null, before: null,
    pct: /pass\s+(?<b>[\d.]+)% -> (?<a>[\d.]+)%/,
    ceiling: 'a subject in one post yields a one-sentence summary, and a subject in no post yields adjacent claims instead of "I have not written about that"',
  },
  {
    id: 'register', rung: 8, name: 'Register control: terse, normal, explanatory', suite: 'register.json',
    cmd: ['bench/no-llm/register.mjs'],
    after: /\((?<p>\d+)\/(?<t>\d+)\) against the real engine/, before: null,
    ceiling: 'the cue table misses "shorten that", "too long", "be shorter", "less detail", "stop explaining", and a leading cue is stripped blind',
  },
  {
    id: 'outline', rung: 9, name: 'Long-form outline from ledger facts', suite: 'outline.json',
    cmd: ['bench/no-llm/outline.mjs'],
    after: null, before: null,
    pct: /(?<b>\d+)% -> (?<a>\d+)% \((?<t>\d+) entries/,
    ceiling: 'no connective prose and no series-level through-line: nine outlines, not one post',
  },
  {
    id: 'plan', rung: 10, name: 'Two-step plans from one sentence', suite: 'plan.json',
    cmd: ['bench/no-llm/plan.mjs'],
    after: /plan (?<p>\d+)\/(?<t>\d+) two-step/, before: /engine (?<p>\d+)\/(?<t>\d+) two-step/,
    ceiling: 'a verb the app never declared drops the whole plan ("no-second-verb"), and a verb-carrying capability still wins with needs: args unfilled',
  },
  {
    id: 'execute', rung: 11, name: 'The planner executes and reports effects', suite: 'execute.json',
    cmd: ['bench/no-llm/execute.mjs'],
    after: /plan\+execute (?<p>\d+)\/(?<t>\d+) \([\d.]+%\)/, before: /engine (?<p>\d+)\/(?<t>\d+) \([\d.]+%\)/,
    ceiling: 'a step that leaves the SPA ends the plan document, so step two never runs on a navigating sentence',
  },
  {
    id: 'recover', rung: 12, name: 'Failure recovery: runner-up or a named refusal', suite: 'recover.json',
    cmd: ['bench/no-llm/recover.mjs'],
    after: /recover (?<p>\d+)\/(?<t>\d+) \(/, before: /shipped (?<p>\d+)\/(?<t>\d+) \(/,
    ceiling: 'routes get no runner-up (a wrong page is worse than a refusal), and a lexical score cannot tell two acts on the same words apart',
  },
  {
    id: 'skills', rung: 13, name: 'Declarative skill runner', suite: 'skills.json',
    cmd: ['bench/no-llm/skills.mjs'],
    after: /^skill\s+(?<p>\d+)\/(?<t>\d+) =/m, before: /^shipped (?<p>\d+)\/(?<t>\d+) =/m,
    ceiling: 'the trigger table is a closed vocabulary: "main points of this page" is not claimed',
  },
  {
    id: 'memory', rung: 14, name: 'Working memory with salience and decay', suite: 'memory.json',
    cmd: ['bench/no-llm/memory.mjs'],
    after: /^after\s+(?<p>\d+)\/(?<t>\d+) =/m, before: /^before (?<p>\d+)\/(?<t>\d+) =/m,
    ceiling: 'a pointer follows the previous answer\'s subjects, so a multi-subject answer widens what "that" means',
  },
  {
    id: 'preferences', rung: 15, name: 'Stated preferences stored as facts', suite: 'preferences.json',
    cmd: ['bench/no-llm/preferences.mjs'],
    after: /after [\d.]+% \((?<p>\d+)\/(?<t>\d+)\)/, before: /before [\d.]+% \((?<p>\d+)\/(?<t>\d+)\)/,
    ceiling: 'two preferences in one sentence are not split, and explanatory adds nothing to a count answer',
  },
  {
    id: 'actions', rung: 16, name: 'Actions on the accessibility tree', suite: 'actions.json',
    cmd: ['bench/no-llm/actions.mjs'],
    beforeCmd: ['bench/no-llm/actions.mjs', '--before'],
    after: /^after: (?<p>\d+)\/(?<t>\d+)/m, before: /^before: (?<p>\d+)\/(?<t>\d+)/m,
    ceiling: 'SEND is aria-disabled until the input has text, so "ask the panel X" needs a plan, not one action',
  },
  {
    id: 'mcp', rung: 17, name: 'MCP-shaped tool bridge', suite: 'mcp.json',
    cmd: ['bench/no-llm/mcp.mjs', '--before'],
    after: /^bridge [\d.]+%\s+\((?<p>\d+)\/(?<t>\d+)\)/m, before: /^naive\s+[\d.]+%\s+\((?<p>\d+)\/(?<t>\d+)\)/m,
    ceiling: 'a step that acts on a page an earlier step opens has no completable tool-call form, and tools/list cannot carry requiresConfirmation',
  },
  {
    id: 'browser', rung: 18, name: 'Scripted browser agent (real Chromium)', suite: 'browser.json',
    cmd: ['bench/no-llm/browser-agent.mjs'],
    beforeCmd: ['bench/no-llm/browser-agent.mjs', '--before'],
    after: /^agent: (?<p>\d+)\/(?<t>\d+) = [\d.]+%/m, before: /^keyword table: (?<p>\d+)\/(?<t>\d+) = [\d.]+%/m,
    ceiling: '"open the boaz page" cannot navigate because the manifest declares no route for /boaz/, and the site has no form to fill',
  },
];

function run(cmd) {
  const stdout = execFileSync('node', cmd, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return stdout;
}

function grab(text, pattern) {
  if (!pattern) return null;
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const all = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (all.length === 0) return null;
  const match = all[all.length - 1];
  const p = match.groups?.p ?? null;
  const t = match.groups?.t ?? null;
  if (p !== null && t !== null) return { passed: Number(p), total: Number(t) };
  return null;
}

function pct(text, pattern) {
  if (!pattern) return null;
  const match = text.match(pattern);
  if (!match) return null;
  const before = match.groups?.b !== undefined ? Number(match.groups.b) : null;
  const after = match.groups?.a !== undefined ? Number(match.groups.a) : null;
  const total = match.groups?.t !== undefined ? Number(match.groups.t) : null;
  return { beforePct: before, afterPct: after, total };
}

function pickLines(text, needles) {
  return needles
    .map((needle) => text.split('\n').find((line) => line.includes(needle)))
    .filter(Boolean);
}

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? (process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean) : null;

const classes = [];
const failures = [];

for (const entry of CLASSES) {
  if (only && !only.includes(entry.id)) continue;
  let report = '';
  try {
    report = run(entry.cmd);
  } catch (error) {
    // Several harnesses exit 1 when a task misses; that is a score, not a
    // failure of the run. Their numbers are parsed below, and a class whose
    // number cannot be read is what fails this script.
    report = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
  }
  const after = grab(report, entry.after);
  const beforeReport = entry.beforeCmd
    ? (() => {
        try {
          return run(entry.beforeCmd);
        } catch (error) {
          return `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
        }
      })()
    : report;

  const before = grab(beforeReport, entry.before);
  const percentages = entry.pct ? pct(report, entry.pct) : null;
  if (!after && !percentages) failures.push(`${entry.id}: after-number did not match`);

  const suite = entry.suite && existsSync(path.join(repo, 'bench/no-llm', entry.suite))
    ? JSON.parse(readFileSync(path.join(repo, 'bench/no-llm', entry.suite), 'utf8'))
    : null;

  classes.push({
    id: entry.id,
    rung: entry.rung,
    name: entry.name,
    suite: entry.suite ?? null,
    tasks: suite?.tasks?.length ?? after?.total ?? percentages?.total ?? null,
    before,
    after,
    beforePct: percentages?.beforePct ?? null,
    afterPct: percentages?.afterPct ?? null,
    headline: pickLines(report, ['score:', 'pass ', 'before', 'after', 'bridge', 'outline:', 'discourse:', 'property:', 'preferences:', 'taxonomy:', 'negation:', 'reference:', 'compound:', 'synonyms:', 'answers:', 'register:', 'Skill suite', 'Memory suite']).slice(0, 3),
    ceiling: entry.ceiling,
    // The whole harness transcript, so the page can show the failing input next
    // to a passing one without re-deriving anything.
    report: report.trim(),
  });
}

if (failures.length) {
  process.stderr.write(`scorecard: ${failures.length} suite(s) not readable\n${failures.join('\n')}\n`);
  process.exit(1);
}

const doc = {
  generated: new Date().toISOString(),
  library: `@shobyde/boaz ${boazVersion}`,
  note: 'Every number here was parsed from the harness output in the same run that wrote this file. The five slot-filling classes are also graded live in the browser by /labs/no-llm/, through bench/no-llm/grade.mjs, which is the module the Node harness uses.',
  classes,
};

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
process.stdout.write(`scorecard: ${classes.length} classes -> ${path.relative(repo, out)}\n`);
for (const entry of classes) {
  const show = entry.after
    ? `${entry.after.passed}/${entry.after.total}`
    : entry.afterPct !== null
      ? `${entry.afterPct}%`
      : 'unreadable';
  process.stdout.write(`  ${entry.id.padEnd(12)} ${show}\n`);
}
