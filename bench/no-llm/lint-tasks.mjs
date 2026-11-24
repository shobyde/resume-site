#!/usr/bin/env node
/**
 * Drift gate for the no-model suites.
 *
 * Runs on prebuild, so every site build (including the Pages one) fails when a
 * suite and its scorecard row disagree. Two things it is protecting:
 *
 *   1. A task file is the source of truth. A task that no longer has the shape
 *      the runner reads is a silent skip, and a skipped task reads as a pass in
 *      the pass rate.
 *   2. The scorecard publishes a task count per class. Add a task and forget
 *      `npm run scorecard`, and the published number describes a suite that no
 *      longer exists. That is the drift this fails on.
 *
 * Adding a task is a one-line edit to a suite JSON. Nothing here needs the
 * engine, node_modules, or a browser.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

const failures = [];
const warnings = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

/** Key order must not decide identity, so sort before stringifying. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function flatten(suite, container) {
  if (container === 'tasks') {
    if (!Array.isArray(suite.tasks)) return null;
    return suite.tasks.map((task, i) => ({ task, at: `tasks[${i}]` }));
  }
  if (container === 'intents') {
    if (!suite.intents || typeof suite.intents !== 'object') return null;
    const out = [];
    for (const [key, list] of Object.entries(suite.intents)) {
      if (!Array.isArray(list)) return null;
      list.forEach((task, i) => out.push({ task, at: `intents.${key}[${i}]` }));
    }
    return out;
  }
  if (container === 'conversations') {
    if (!Array.isArray(suite.conversations)) return null;
    const out = [];
    suite.conversations.forEach((conv, c) => {
      const list = Array.isArray(conv.tasks) ? conv.tasks : null;
      if (!list) return;
      list.forEach((task, i) => out.push({ task, at: `conversations[${c}].tasks[${i}]` }));
    });
    return out;
  }
  return null;
}

async function main() {
  const registry = await readJson(path.join(here, 'suites.json'));
  const scorecard = await readJson(path.join(repo, 'labs/no-llm/scorecard.json'));
  const rows = new Map(scorecard.classes.map((row) => [row.id, row]));

  const counts = new Map(); // class -> task count
  const checked = new Map(); // file -> count, so a shared file is validated once
  let total = 0;

  for (const entry of registry.entries) {
    const where = `bench/no-llm/${entry.file}`;
    let suite;
    try {
      suite = await readJson(path.join(here, entry.file));
    } catch (err) {
      fail(where, `cannot read suite for class "${entry.class}": ${err.message}`);
      continue;
    }

    let items = flatten(suite, entry.container);
    if (!items || items.length === 0) {
      fail(where, `class "${entry.class}" declares container "${entry.container}" and it is missing or empty`);
      continue;
    }
    counts.set(entry.class, items.length);

    if (checked.has(entry.file)) continue;
    checked.set(entry.file, items.length);

    const seenInput = new Map();
    const seenId = new Map();
    let withoutId = 0;

    for (const { task, at } of items) {
      if (!task || typeof task !== 'object' || Array.isArray(task)) {
        fail(`${where} ${at}`, 'task is not an object');
        continue;
      }
      if (typeof task.id === 'string' && task.id) {
        if (seenId.has(task.id)) fail(`${where} ${at}`, `duplicate id "${task.id}" (also ${seenId.get(task.id)})`);
        else seenId.set(task.id, at);
      } else if (entry.input === null) {
        const keyField = entry.key ?? 'id';
        const name = task[keyField];
        if (typeof name !== 'string' || !name) {
          fail(`${where} ${at}`, `no utterance and no "${keyField}", so this task has no name at all`);
        } else if (seenId.has(name)) {
          fail(`${where} ${at}`, `duplicate "${keyField}" "${name}" (also ${seenId.get(name)})`);
        } else seenId.set(name, at);
      } else {
        withoutId += 1;
      }

      if (entry.input === null) continue;
      const text = task[entry.input];
      if (typeof text !== 'string' || !text.trim()) {
        fail(`${where} ${at}`, `missing "${entry.input}" (a suite task must carry the visitor's words)`);
        continue;
      }
      const state = (entry.discriminator ?? []).map((k) => stable(task[k])).join('|');
      const key = `${text.trim().toLowerCase().replace(/\s+/g, ' ')}::${state}`;
      if (seenInput.has(key)) fail(`${where} ${at}`, `duplicate task "${text.trim()}" with the same state (also ${seenInput.get(key)})`);
      else seenInput.set(key, at);
    }

    if (withoutId) warnings.push(`${entry.class}: ${withoutId}/${items.length} tasks have no id (positions are used instead)`);

    const row = rows.get(entry.class);
    if (!row) {
      fail(`labs/no-llm/scorecard.json`, `class "${entry.class}" has a suite but no scorecard row, so its number is unpublished`);
      continue;
    }
    if (row.tasks !== items.length) {
      fail(
        `labs/no-llm/scorecard.json`,
        `class "${entry.class}" says ${row.tasks} tasks, ${entry.file} has ${items.length}; run \`npm run scorecard\` and commit the result`,
      );
    }
    if (row.suite !== entry.file) {
      fail(`labs/no-llm/scorecard.json`, `class "${entry.class}" cites suite "${row.suite}", the registry says "${entry.file}"`);
    }
  }

  const registered = new Set(registry.entries.map((e) => e.class));
  for (const id of rows.keys()) {
    if (!registered.has(id)) fail('bench/no-llm/suites.json', `scorecard row "${id}" has no suite entry, so nothing checks its tasks`);
  }

  const uniqueTasks = [...checked.values()].reduce((a, b) => a + b, 0);
  total = [...counts.values()].reduce((a, b) => a + b, 0);

  console.log(`no-llm suites: ${registry.entries.length} classes, ${total} tasks (${uniqueTasks} in ${checked.size} files)`);
  for (const entry of registry.entries) {
    const n = counts.get(entry.class);
    if (n === undefined) continue;
    const row = rows.get(entry.class);
    const pct = row?.after ? `${row.after.passed}/${row.after.total}` : 'recorded';
    console.log(
      `  ${entry.class.padEnd(12)} ${String(n).padStart(3)} tasks  ${pct.padStart(9)}  ${entry.live ? 'live in tab' : `harness: ${entry.runner}`}`,
    );
  }
  for (const w of warnings) console.log(`  warn ${w}`);

  if (failures.length) {
    console.error(`\nFAIL ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('\nOK every suite parses, every task carries its input, and every count matches the scorecard.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
