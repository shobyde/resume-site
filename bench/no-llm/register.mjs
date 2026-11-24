#!/usr/bin/env node
/**
 * Register control (rung 8): the same facts at the length that was asked for.
 *
 * Each task names a register and the sentence count the answer must have, plus
 * the facts it must still carry. The register is read from the question by the
 * same function the panel uses, the question is stripped of its cue before it
 * reaches the engine, and the answer is scored on both counts. A terse answer
 * that drops a name fails; a long answer to a terse request also fails.
 *
 * `session` sends utterances first, which is how a stated preference is
 * measured: the preference reply is checked, then the next question is scored
 * against the register it should have set.
 *
 * Usage: node bench/no-llm/register.mjs [--suite register.json] [--json]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseModelOutput } from '@shobyde/boaz';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { readRegister, resetRegister } from '../../src/agent/register.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
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

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'register.json'), 'utf8'));
const engine = createEngine();
const rows = [];

for (const task of suite.tasks) {
  resetRegister();
  const prefaces = [];
  for (const line of task.session ?? []) {
    const read = readRegister(line);
    prefaces.push(read);
    if (read.cleaned) await ask(engine, read.cleaned);
  }
  const read = readRegister(task.q);
  const answer = read.cleaned ? await ask(engine, read.cleaned) : '';
  const sentences = sentencesOf(answer);
  const [min, max] = task.sentences ?? [0, 99];
  const must = task.must ?? [];
  const missing = must.filter((fact) => !new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(answer));
  const registerOk = read.register === task.register;
  const lengthOk = sentences.length >= min && sentences.length <= max;
  const prefersReply = (task.session ?? []).every((line, i) => !prefaces[i]?.preference || prefaces[i].reply);
  const ok = registerOk && lengthOk && missing.length === 0 && prefersReply;
  rows.push({
    q: task.q,
    want: task.register,
    got: read.register,
    sentences: sentences.length,
    range: [min, max],
    missing,
    ok,
    answer,
    cleaned: read.cleaned,
  });
}

const passed = rows.filter((row) => row.ok).length;
const pct = Math.round((passed / rows.length) * 1000) / 10;
process.stdout.write(`register: ${pct}% (${passed}/${rows.length}) against the real engine\n`);
for (const row of rows.filter((r) => !r.ok)) {
  const why = [];
  if (row.want !== row.got) why.push(`register ${row.got} not ${row.want}`);
  if (row.sentences < row.range[0] || row.sentences > row.range[1]) why.push(`${row.sentences} sentences, wanted ${row.range[0]}-${row.range[1]}`);
  if (row.missing.length) why.push(`missing ${row.missing.join(', ')}`);
  process.stdout.write(`  "${row.q}"\n    ${why.join('; ')}\n    said: ${row.answer}\n`);
}
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}
process.exitCode = passed === rows.length ? 0 : 1;
