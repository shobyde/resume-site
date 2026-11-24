#!/usr/bin/env node
/**
 * Answer-level check for the compound suite.
 *
 * `run.mjs` scores what the slots extracted. This scores what the visitor would
 * actually read: the real engine, the real knowledge, the real tool call, then
 * the project names in the answer compared with the set the task expects. A
 * union where the visitor asked for an intersection passes extraction and fails
 * here, which is the failure rung 4 exists to fix.
 *
 * Usage: node bench/no-llm/answers.mjs [--suite compound.json]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseModelOutput } from '@shobyde/boaz';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { DATA } from '../../src/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

const shortName = (title) => String(title).split(':')[0].trim();
const PROJECTS = new Set(DATA.projects.map((project) => shortName(project.title)));
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

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'compound.json'), 'utf8'));
const engine = createEngine();

const rows = [];
for (const task of suite.tasks) {
  if (!task.members) continue;
  const answer = await ask(engine, task.q);
  // The claim is the first sentence: that is where the answered set lives. A
  // later sentence may name a project that does not match, on purpose (the
  // contrast rung 6 adds), and discourse.mjs is what checks those are grounded.
  const claim = sentencesOf(answer)[0] ?? answer;
  // Every project the claim names, so a union is visible even when the
  // expected set is a subset of it.
  const named = [...PROJECTS].filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(claim));
  const want = [...task.members].sort();
  const got = named.sort();
  const ok = want.length === got.length && want.every((name, i) => name === got[i]);
  rows.push({ q: task.q, want, got, ok, answer });
}

const passed = rows.filter((row) => row.ok).length;
const pct = Math.round((passed / rows.length) * 1000) / 10;
process.stdout.write(`answers: ${pct}% (${passed}/${rows.length}) against the real engine\n`);
for (const row of rows.filter((r) => !r.ok)) {
  process.stdout.write(`  "${row.q}"\n    want [${row.want.join(', ')}] got [${row.got.join(', ')}]\n    said: ${row.answer}\n`);
}
