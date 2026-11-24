#!/usr/bin/env node
/**
 * Working memory (rung 14). Each conversation is a scripted session driven
 * through the real engine, one utterance at a time.
 *
 * Two panels on the same sessions:
 *   before — what shipped: engine memory carries the last turn's rule and
 *            entities, so a pointer resolves against the previous sentence and
 *            nothing can recap the session.
 *   after  — `createSessionMemory` (boaz 0.7.10): a pointer is rewritten from
 *            the most salient subject, "what did we cover" is answered from the
 *            session, and a subject the session released decays out.
 *
 * The only difference between the two runs is the rewrite and the recap: both
 * send their text through the same engine, so a pass is attributable to the
 * memory and not to a different router.
 *
 * Usage: node bench/no-llm/memory.mjs [--suite memory.json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseModelOutput } from '@shobyde/boaz';
import { createEngine, runCapability } from '../agent-setup.mjs';
import {
  coverageAnswer,
  createSessionMemory,
  entitiesIn,
  isCoverageQuery,
  resolvePointer,
  SITE_SUBJECTS,
} from '../../src/agent/sessionMemory.js';
import { DATA } from '../../src/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'memory.json'), 'utf8'));

/** One turn through the engine, with the tool call a rule plans actually run. */
async function ask(engine, question) {
  const messages = [{ role: 'user', content: question }];
  let observations;
  let text = '';
  for (let turn = 0; turn < 2; turn += 1) {
    const completion = await engine.complete({ messages, tools: [], ...(observations ? { observations } : {}) });
    text = typeof completion.text === 'string' ? completion.text : String(completion.text ?? '');
    const parsed = parseModelOutput(text);
    if (parsed.kind !== 'tool') break;
    const result = await runCapability(parsed.capabilityId ?? '', parsed.args ?? {});
    observations = { ...(observations ?? {}), [parsed.capabilityId ?? '']: result };
  }
  return text;
}

const subjectNames = [...new Set([
  ...DATA.projects.map((project) => project.title),
  ...DATA.projects.flatMap((project) => project.stack ?? []),
])];

const namesIn = (text) => subjectNames.filter((name) => String(text ?? '').includes(name));

/**
 * Does this turn act on the named thing? The check reads the whole turn output,
 * not just the sentence: an attribute question about a project is answered with
 * a card, and the card's arguments name the project, which is the effect the
 * visitor sees.
 */
const namesTurn = (turn, name) =>
  String(turn?.answer ?? '').toLowerCase().includes(String(name).toLowerCase()) ? name : null;

/**
 * The panel as it shipped. Its only cross-turn state is the previous answer, and
 * it has no way to answer a question about the conversation.
 */
async function runBefore(conversation) {
  const engine = createEngine();
  const turns = [];
  let lastText = '';
  for (let index = 0; index < conversation.turns.length; index += 1) {
    const text = conversation.turns[index];
    const answer = await ask(engine, text);
    turns.push({ text, answer, entities: namesIn(answer) });
    lastText = answer;
  }
  return { turns, lastText };
}

/** The panel with a session memory: rewrite the pointer, recap when asked. */
async function runAfter(conversation) {
  const engine = createEngine();
  const memory = createSessionMemory();
  const turns = [];
  for (let index = 0; index < conversation.turns.length; index += 1) {
    const original = conversation.turns[index];
    const pointer = resolvePointer(memory, original);
    let answer;
    if (isCoverageQuery(pointer.query)) {
      answer = coverageAnswer(memory, 'normal').text;
    } else {
      answer = await ask(engine, pointer.query);
    }
    const record = memory.observe(original, { entities: entitiesIn(answer) });
    turns.push({
      text: original,
      sent: pointer.query,
      rewritten: pointer.rewritten,
      pointerSubject: pointer.rewritten ? pointer.subject : null,
      answer,
      entities: record.entities,
      snap: {
        salient: memory.salient().map((entity) => entity.name),
        subject: memory.context().subject,
        coverage: memory.covered(),
      },
    });
  }
  return { turns, memory };
}

/** The flat record a task asserts against, for each panel. */
function actualBefore(state, task) {
  const turn = state.turns[task.at];
  const previous = state.turns[task.at - 1];
  const base = { rewritten: false, coverageQuery: false };
  if (task.kind === 'answer-names') return { ...base, names: namesTurn(turn, task.expect.names) };
  if (task.kind === 'rewritten') return { ...base };
  if (task.kind === 'rewritten-to') return { ...base, rewrittenTo: null };
  if (task.kind === 'subject') return { ...base, subject: (previous ? namesIn(previous.answer)[0] : namesIn(turn?.answer)[0]) ?? null };
  if (task.kind === 'salient') {
    const entities = previous ? namesIn(previous.answer) : [];
    return { ...base, includes: entities.includes(task.expect.includes) ? task.expect.includes : null, excludes: entities.includes(task.expect.excludes) ? null : task.expect.excludes };
  }
  if (task.kind === 'salient-top') {
    const entities = previous ? namesIn(previous.answer) : [];
    return { ...base, salientTop: entities[0] ?? null };
  }
  if (task.kind === 'covered' || task.kind === 'recap') {
    const named = namesIn(turn?.answer);
    return {
      ...base,
      covered: named.includes(task.expect.covered) ? task.expect.covered : null,
      names: named.length ? named : null,
      notNames: named.filter((name) => !(task.expect.notNames ?? []).includes(name)).length ? null : task.expect.notNames,
      empty: isCoverageQuery(turn?.text ?? '') ? false : true,
    };
  }
  if (task.kind === 'coverage-query') return { ...base };
  return base;
}

function actualAfter(state, task) {
  const turn = state.turns[task.at];
  const memory = state.memory;
  const salient = turn?.snap?.salient ?? [];
  const base = { rewritten: Boolean(turn?.rewritten), coverageQuery: isCoverageQuery(turn?.text ?? ''), names: null };
  if (task.kind === 'answer-names') {
    return { ...base, names: namesTurn(turn, task.expect.names) };
  }
  if (task.kind === 'rewritten') return base;
  if (task.kind === 'rewritten-to') return { ...base, rewrittenTo: turn?.pointerSubject ?? null };
  if (task.kind === 'subject') return { ...base, subject: turn?.snap?.subject ?? null };
  if (task.kind === 'salient') {
    return {
      ...base,
      includes: salient.includes(task.expect.includes) ? task.expect.includes : null,
      excludes: salient.includes(task.expect.excludes) ? null : task.expect.excludes,
    };
  }
  if (task.kind === 'salient-top') return { ...base, salientTop: salient[0] ?? null };
  if (task.kind === 'covered' || task.kind === 'recap') {
    const coverage = turn?.snap?.coverage ?? { entities: [], empty: true };
    const covered = coverage.entities;
    return {
      ...base,
      covered: covered.includes(task.expect.covered) ? task.expect.covered : null,
      names: (task.expect.names ?? []).every((name) => covered.includes(name)) ? task.expect.names : null,
      notNames: (task.expect.notNames ?? []).every((name) => !covered.includes(name)) ? task.expect.notNames : null,
      empty: coverage.empty,
    };
  }
  if (task.kind === 'coverage-query') return base;
  return base;
}

const passes = (expect, actual) => Object.keys(expect).every((key) => JSON.stringify(expect[key]) === JSON.stringify(actual[key]));

const rows = [];
for (const conversation of suite.conversations) {
  const before = await runBefore(conversation);
  const after = await runAfter(conversation);
  for (const task of conversation.tasks) {
    const beforeActual = actualBefore(before, task);
    const afterActual = actualAfter(after, task);
    rows.push({ conversation: conversation.id, task, beforeActual, afterActual, beforePass: passes(task.expect, beforeActual), afterPass: passes(task.expect, afterActual) });
  }
}

console.log(`\nMemory suite: ${rows.length} tasks over ${suite.conversations.length} conversations (rung ${suite.rung})\n`);
console.log('id  conv          kind            expect                                  before   after');
for (const row of rows) {
  console.log(
    `${row.task.id.padEnd(3)} ${row.conversation.padEnd(13)} ${row.task.kind.padEnd(15)} ${JSON.stringify(row.task.expect).padEnd(39)} ${row.beforePass ? 'PASS  ' : 'fail  '} ${row.afterPass ? 'PASS' : 'FAIL'}`,
  );
  if (verbose) {
    console.log(`    before ${JSON.stringify(row.beforeActual)}`);
    console.log(`    after  ${JSON.stringify(row.afterActual)}`);
  }
}

const format = (value) => `${(value * 100).toFixed(1)}%`;
const count = (key) => rows.filter((row) => row[key]).length;
console.log(`\nbefore ${count('beforePass')}/${rows.length} = ${format(count('beforePass') / rows.length)}`);
console.log(`after  ${count('afterPass')}/${rows.length} = ${format(count('afterPass') / rows.length)}`);

const group = (label, list, key) => console.log(`${label.padEnd(24)} ${list.filter((row) => row[key]).length}/${list.length}`);
for (const kind of [...new Set(rows.map((row) => row.task.kind))]) {
  const list = rows.filter((row) => row.task.kind === kind);
  console.log(`  ${kind.padEnd(22)} before ${list.filter((row) => row.beforePass).length}/${list.length}, after ${list.filter((row) => row.afterPass).length}/${list.length}`);
}

const failed = rows.filter((row) => !row.afterPass);
if (failed.length) {
  console.log('\nmisses:');
  for (const row of failed) console.log(`  ${row.task.id} ${row.task.kind} on ${row.conversation}: wanted ${JSON.stringify(row.task.expect)}, got ${JSON.stringify(row.afterActual)}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
