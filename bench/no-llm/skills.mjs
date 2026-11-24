#!/usr/bin/env node
/**
 * Declarative skills (rung 13). One skill, declared as data: a trigger, two
 * capability calls where the second consumes the first's result, four checks
 * between them, and a stop condition.
 *
 * Two systems on the same tasks:
 *   shipped — the panel before this rung: no skill machinery, so the question
 *             routes to whatever capability the keywords pick.
 *   skill   — `selectSkill` + `runSkill` over the site's own capability handlers.
 *
 * A task passes only when every field it asserts matches: which skill claimed
 * the sentence (or none), how many points came back, and which check stopped
 * the run. A stop is a pass when the task expects it; padding to three points on
 * a two-sentence page is a failure.
 *
 * Usage: node bench/no-llm/skills.mjs [--suite skills.json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseModelOutput, runSkill, selectSkill } from 'boaz/core';
import { createEngine } from '../agent-setup.mjs';
import { siteCapabilities } from '../../src/agent/capabilities.js';
import { siteSkills } from '../../src/agent/skills.js';
import { DATA } from '../../src/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'skills.json'), 'utf8'));

const plain = (html) =>
  String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const project = (index) => plain(DATA.projects[index]?.summary ?? '');
const repeated = 'Hobnob records meetings on the device and never sends audio to a server.';

/** Page fixtures. The long one is the site's own copy; the rest are pages a visitor can land on. */
const PAGES = {
  long: [
    { label: 'About', text: `${plain(DATA.about.p1)} ${plain(DATA.about.p2)}` },
    { label: 'Projects', text: `${project(0)} ${project(1)} ${project(2)}` },
    { label: 'Contact', text: plain(DATA.contact?.note ?? 'Email is the fastest way to reach him, and LinkedIn is the other one.') },
  ],
  medium: [
    { label: 'About', text: plain(DATA.about.p1) },
    { label: 'Projects', text: project(0) },
  ],
  short: [{ label: 'Hero', text: plain(DATA.hero.headlineText) }],
  'one-section': [{ label: 'Projects', text: project(1) }],
  duplicate: [
    { label: 'About', text: `${repeated} ${repeated} ${repeated}` },
    { label: 'Projects', text: `${repeated} ${repeated} ${repeated}` },
    { label: 'Contact', text: 'Email is the fastest way to reach him, and LinkedIn is the other one.' },
  ],
  empty: [],
};

const handlers = new Map();
for (const capability of siteCapabilities) {
  if (typeof capability.handler === 'function') handlers.set(capability.id, capability.handler);
}

const SNAPSHOT = { postCount: 0, newestPost: null, postsIndex: [], query: '', pageSections: [] };

function hostFor(page) {
  const calls = [];
  return {
    calls,
    call: async (capabilityId, args) => {
      calls.push({ capabilityId, args });
      const handler = handlers.get(capabilityId);
      if (!handler) throw new Error(`no handler for ${capabilityId}`);
      return handler(args ?? {}, {
        currentRoute: '#hero',
        navigate: () => {},
        dispatch: () => {},
        read: (key) => (key === 'pageSections' ? PAGES[page] ?? [] : SNAPSHOT[key]),
      });
    },
  };
}

const engine = createEngine();

/** What the panel does today: one route, no skill. */
async function shippedAnswer(text) {
  const completion = await engine.complete({ messages: [{ role: 'user', content: text }], tools: [] });
  const raw = typeof completion.text === 'string' ? completion.text : String(completion.text ?? '');
  const parsed = parseModelOutput(raw);
  return { skill: null, points: null, stopped: null, routed: parsed.kind === 'tool' ? parsed.capabilityId ?? '' : '' };
}

async function skillAnswer(text, page) {
  const skill = selectSkill(siteSkills, text);
  if (!skill) return { skill: null, points: null, stopped: null, quoted: null, run: null };
  const host = hostFor(page);
  const run = await runSkill(skill, { call: (id, args) => host.call(id, args) });
  const points = run.steps.find((step) => step.id === 'points')?.result?.points ?? [];
  // What the visitor actually reads: points quoted in the composed answer. A
  // check that runs after a step cannot unrun it, so this is the only honest
  // count of padding.
  const answer = String(skill.compose?.(run) ?? '');
  const quoted = (answer.match(/"[^"]+"/g) ?? []).length;
  return { skill: run.skillId, points: points.length, delivered: quoted, stopped: run.stopped?.check ?? null, run, answer, calls: host.calls };
}

function passes(expect, actual) {
  for (const key of Object.keys(expect)) {
    if (expect[key] !== actual[key]) return false;
  }
  return true;
}

const rows = [];
for (const task of suite.tasks) {
  const before = await shippedAnswer(task.text);
  const after = await skillAnswer(task.text, task.page);
  rows.push({
    id: task.id,
    page: task.page,
    text: task.text,
    expect: task.expect,
    before,
    after,
    beforePass: passes(task.expect, before),
    afterPass: passes(task.expect, after),
  });
}

const rate = (key) => rows.filter((row) => row[key]).length / rows.length;

console.log(`\nSkill suite: ${rows.length} tasks, ${suite.class} class (rung ${suite.rung})\n`);
console.log('id   page         expect                              shipped                     skill');
for (const row of rows) {
  const want = JSON.stringify(row.expect);
  const got = (result) =>
    `${result.skill ?? 'none'}/${result.delivered ?? '-'}/${result.stopped ?? '-'}`.padEnd(10) +
    (result.routed ? ` via ${result.routed}` : '');
  console.log(
    `${row.id.padEnd(4)} ${row.page.padEnd(12)} ${want.padEnd(35)} ${got(row.before).padEnd(28)}${row.afterPass ? 'PASS' : 'FAIL'}  ${got(row.after)}`,
  );
  if (verbose && row.after.run) {
    for (const check of row.after.run.checks) console.log(`       check ${check.id.padEnd(9)} ${check.ok ? 'ok  ' : 'FAIL'} ${check.observed}`);
    if (row.after.run.stopped) console.log(`       stopped at ${row.after.run.stopped.check}: ${row.after.run.stopped.message}`);
  }
}

const format = (value) => `${(value * 100).toFixed(1)}%`;
console.log(`\nshipped ${rows.filter((row) => row.beforePass).length}/${rows.length} = ${format(rate('beforePass'))}`);
console.log(`skill   ${rows.filter((row) => row.afterPass).length}/${rows.length} = ${format(rate('afterPass'))}`);

const triggers = rows.filter((row) => row.expect.delivered === 3);
const stops = rows.filter((row) => typeof row.expect.stopped === 'string');
const controls = rows.filter((row) => row.expect.skill === null);
const group = (label, list, key) =>
  console.log(`${label.padEnd(22)} ${list.filter((row) => row[key]).length}/${list.length}`);
group('three-point answers', triggers, 'afterPass');
group('stop conditions', stops, 'afterPass');
group('controls (not claimed)', controls, 'afterPass');

const failed = rows.filter((row) => !row.afterPass);
if (failed.length) {
  console.log('\nmisses:');
  for (const row of failed) console.log(`  ${row.id} "${row.text}" on ${row.page}: wanted ${JSON.stringify(row.expect)}, got ${JSON.stringify({ skill: row.after.skill, points: row.after.points, stopped: row.after.stopped })}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
