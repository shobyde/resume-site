#!/usr/bin/env node
/**
 * Answered-or-refused check: the real engine, the real knowledge, one turn.
 *
 * The routing audit scores which capability wins, so an answer rule that owns a
 * phrasing reads as a "prose" miss even when the visitor got a correct sentence.
 * This suite scores what the visitor reads instead: a sentence that is not the
 * refusal, and one that names the fact the question asked for.
 *
 * Usage: node bench/no-llm/refusals.mjs [--suite refusals.json] [--json]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseModelOutput } from '@shobyde/boaz';
import { createEngine, runCapability } from '../agent-setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

const REFUSAL = /(not sure about that|i can help with|no project on this page|i only answer questions about this page)/i;

async function ask(engine, question) {
  const messages = [{ role: 'user', content: question }];
  let observations;
  let text = '';
  for (let step = 0; step < 3; step += 1) {
    const completion = await engine.complete({ messages, tools: [], ...(observations ? { observations } : {}) });
    text = typeof completion.text === 'string' ? completion.text : String(completion.text ?? '');
    const parsed = parseModelOutput(text);
    if (parsed.kind !== 'tool') break;
    const id = parsed.capabilityId ?? '';
    const result = await runCapability(id, parsed.args ?? {});
    observations = { ...(observations ?? {}), [id]: result };
  }
  return text;
}

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'refusals.json'), 'utf8'));
const engine = createEngine();
const rows = [];

for (const task of suite.tasks) {
  const text = await ask(engine, task.q);
  const lower = text.toLowerCase();
  const refused = REFUSAL.test(text);
  const missing = (task.include ?? []).filter((word) => !lower.includes(String(word).toLowerCase()));
  const pass = !refused && missing.length === 0;
  rows.push({ q: task.q, pass, refused, missing, text: text.replace(/\s+/g, ' ').trim() });
}

const passed = rows.filter((row) => row.pass).length;
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ tasks: rows.length, passed, rows }, null, 1));
} else {
  for (const row of rows) {
    console.log(`${row.pass ? 'pass' : 'FAIL'}  "${row.q}"${row.refused ? '  (refused)' : ''}`);
    if (!row.pass) console.log(`      got: ${row.text.slice(0, 150)}${row.missing.length ? `\n      missing: ${row.missing.join(', ')}` : ''}`);
  }
  console.log(`\nrefusals  ${passed}/${rows.length} answered`);
}
process.exit(passed === rows.length ? 0 : 1);
