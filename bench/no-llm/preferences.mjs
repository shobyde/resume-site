#!/usr/bin/env node
/**
 * Stated preferences as facts (rung 15).
 *
 * Each task is a scripted session: utterances that state a preference, then the
 * question under test. Two panels run the same tasks through the same engine:
 *
 *   before: the panel as it shipped after rung 8. The register lives in a module
 *            variable, so a preference can hold, but nothing can report what was
 *            set and a standing request the site cannot serve is routed as a
 *            question about the page.
 *   after: the panel with boaz 0.7.11 `createPreferenceMemory`. The preference
 *            is a `prefers()` fact, "what did I ask for" is answered from the
 *            store, and an unservable standing request is declined.
 *
 * The only difference between the runs is the preference path: both send their
 * text through the same engine, so a pass is attributable to the machinery and
 * not to a different router. A task passes only when every key it names matches.
 *
 * Usage: node bench/no-llm/preferences.mjs [--json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseModelOutput } from 'boaz';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { readRegister, resetRegister } from '../../src/agent/register.js';
import {
  isPreferenceQuery,
  preferenceLine,
  preferenceMemory,
  preferenceRecap,
  recordLine,
  unknownPreference,
  UNKNOWN_REPLY,
} from '../../src/agent/preferences.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes('--verbose');

const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/** One turn, with the tool call the rule plans actually run. */
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

const suite = JSON.parse(await readFile(path.resolve(here, 'preferences.json'), 'utf8'));
const engine = createEngine();

const fresh = () => {
  resetRegister();
  preferenceMemory.reset();
};

/** The panel before this rung: register semantics only. */
async function runBefore(task) {
  fresh();
  for (const line of task.session ?? []) {
    const read = readRegister(line);
    if (read.cleaned) await ask(engine, read.cleaned);
  }
  const read = readRegister(task.q);
  let answer = '';
  let qUsedEngine = false;
  if (read.cleaned) {
    qUsedEngine = true;
    answer = await ask(engine, read.cleaned);
  } else {
    answer = read.reply ?? '';
  }
  return { answer, lines: [], qUsedEngine, register: read.register };
}

/** The panel after this rung: the same register, recorded as a fact. */
async function runAfter(task) {
  fresh();
  for (const line of task.session ?? []) {
    const read = readRegister(line);
    if (read.cleaned) await ask(engine, read.cleaned);
  }
  const read = readRegister(task.q);
  const lines = [];
  let qUsedEngine = false;
  let answer = '';
  if (read.preference) {
    const entry = preferenceMemory.stated('register').at(-1);
    const line = recordLine(entry);
    if (line) lines.push(line.label);
    answer = read.reply;
  } else if (isPreferenceQuery(task.q)) {
    const recap = preferenceRecap(preferenceMemory, read.register);
    answer = recap.text;
    lines.push(recap.line);
  } else if (unknownPreference(read.cleaned || task.q)) {
    answer = UNKNOWN_REPLY;
    lines.push(`Heard a standing request with no setting behind it: "${unknownPreference(read.cleaned || task.q)}"`);
  } else {
    const sessionLine = read.cue ? null : preferenceLine(read.register);
    if (sessionLine) lines.push(sessionLine.label);
    qUsedEngine = true;
    answer = await ask(engine, read.cleaned || task.q);
  }
  return { answer, lines, qUsedEngine, register: read.register };
}

const has = (text, phrase) => String(text).toLowerCase().includes(String(phrase).toLowerCase());

function score(task, run) {
  const expect = task.expect ?? {};
  const misses = [];
  if (expect.register && run.register !== expect.register) misses.push(`register ${run.register} not ${expect.register}`);
  if (expect.sentences) {
    const [min, max] = expect.sentences;
    const count = sentencesOf(run.answer).length;
    if (count < min || count > max) misses.push(`${count} sentences, wanted ${min}-${max}`);
  }
  for (const phrase of expect.must ?? []) if (!has(run.answer, phrase)) misses.push(`answer lacks "${phrase}"`);
  for (const phrase of expect.mustNot ?? []) if (has(run.answer, phrase)) misses.push(`answer contains "${phrase}"`);
  for (const phrase of expect.trace ?? []) if (!run.lines.some((line) => has(line, phrase))) misses.push(`no trace line with "${phrase}"`);
  for (const phrase of expect.traceNot ?? []) if (run.lines.some((line) => has(line, phrase))) misses.push(`trace claims "${phrase}"`);
  if (expect.noEngine && run.qUsedEngine) misses.push('routed as a question instead of answered from the preference');
  for (const fact of expect.facts ?? []) if (!preferenceMemory.facts().includes(fact)) misses.push(`store lacks ${fact}`);
  return misses;
}

const rows = [];
for (const task of suite.tasks) {
  const before = await runBefore(task);
  const beforeMisses = score(task, before);
  const after = await runAfter(task);
  const afterMisses = score(task, after);
  rows.push({
    id: task.id,
    q: task.q,
    ceiling: /^ceiling/.test(String(task.why ?? '')),
    before: { ok: beforeMisses.length === 0, misses: beforeMisses, answer: before.answer },
    after: { ok: afterMisses.length === 0, misses: afterMisses, answer: after.answer },
  });
}

const pct = (passed, total) => Math.round((passed / total) * 1000) / 10;
const total = rows.length;
const passedBefore = rows.filter((row) => row.before.ok).length;
const passedAfter = rows.filter((row) => row.after.ok).length;
process.stdout.write(
  `preferences: before ${pct(passedBefore, total)}% (${passedBefore}/${total}), after ${pct(passedAfter, total)}% (${passedAfter}/${total})\n`,
);
for (const row of rows.filter((r) => !r.after.ok)) {
  process.stdout.write(`  ${row.ceiling ? 'CEILING' : 'FAIL'} ${row.id} "${row.q}"\n    ${row.after.misses.join('; ')}\n    said: ${row.after.answer}\n`);
}
if (verbose) {
  for (const row of rows.filter((r) => r.before.ok)) process.stdout.write(`  was passing: ${row.id} "${row.q}"\n`);
}
if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
const realMisses = rows.filter((row) => !row.after.ok && !row.ceiling);
process.exitCode = realMisses.length === 0 ? 0 : 1;
