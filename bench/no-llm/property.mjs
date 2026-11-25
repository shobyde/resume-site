#!/usr/bin/env node
/**
 * Rung 26: property questions.
 *
 * "Which projects run locally" names a property no stack entry carries. The page
 * still describes it, in the card's own prose. This suite asks whether the
 * assistant reads that prose, which projects it names, and whether it can tell a
 * claim from a rejection: Boaz's card names a GPU only to say it avoids one.
 *
 * Usage: node bench/no-llm/property.mjs [--suite property.json] [--verbose]
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
const verbose = process.argv.includes('--verbose');

const shortName = (title) => String(title).split(':')[0].trim();
const words = (text) =>
  String(text)
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);

/** Every word the cards themselves contain: the answer may not invent one. */
const CORPUS = new Set();
for (const project of DATA.projects ?? []) {
  for (const field of [
    project.title,
    project.summary,
    project.contribution,
    project.details?.architecture,
    ...(project.details?.decisions ?? []),
    ...(project.stack ?? []),
  ]) {
    for (const word of words(field ?? '')) CORPUS.add(word);
  }
}
// What an answer is allowed to say about itself without quoting a card.
for (const word of words(
  'no card here claims one project projects only names mentions does not describe list stacks stack page the of them and so that is are it its this which what',
)) {
  CORPUS.add(word);
}

// Function words carry no claim, so a sentence is judged on its content words.
const STOP = new Set(
  'a an the and or but if then than that this these those it its it\'s they them their there here is are was were be been being do does did done have has had can could should would will may might must of in on at to for from with by without as so not no nor only just every each any some all both one two three also more most other another else what which who whom whose how when where why i you he she we'.split(
    ' ',
  ),
);

const BANNED = /\u2014/;

const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const containsName = (text, name) =>
  new RegExp(`(?<![A-Za-z0-9])${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i').test(text);

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

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'property.json'), 'utf8'));
const engine = createEngine();

const rows = [];
for (const task of suite.tasks) {
  const answer = await ask(engine, task.q);
  const again = await ask(engine, task.q);
  const sent = sentencesOf(answer);

  const must = (task.must ?? []).every((name) => containsName(answer, name));
  const mustNot = (task.mustNot ?? []).every((name) => !containsName(answer, name));
  const says = !task.says || new RegExp(task.says, 'i').test(answer);
  // A sentence has to be made of words the page carries. Function words are
  // free; a content word no card contains is the invention this catches, and a
  // single stray word does not fail an otherwise quoted sentence.
  const grounded = sent.every((sentence) => {
    const tokens = words(sentence).filter((word) => !STOP.has(word) && !/^\d+$/.test(word));
    if (!tokens.length) return true;
    const known = tokens.filter((token) => CORPUS.has(token)).length;
    return known / tokens.length >= 0.6;
  });
  const stable = answer === again;
  const clean = !BANNED.test(answer);
  const shaped = sent.length >= 1 && sent.length <= 3 && sent.every((sentence) => words(sentence).length <= 30);

  const pass = must && mustNot && says && grounded && stable && clean && shaped;
  rows.push({ task, answer, pass, parts: { must, mustNot, says, grounded, stable, clean, shaped } });
  if (verbose || !pass) {
    const failed = Object.entries(rows.at(-1).parts).filter(([, ok]) => !ok).map(([key]) => key);
    console.log(`FAIL ${task.q}\n  parts: ${failed.join(', ') || 'none'}\n  got: ${answer}\n`);
  }
}

const passed = rows.filter((row) => row.pass).length;
const covered = rows.filter((row) => row.answer && !/not sure/i.test(row.answer)).length;
console.log(`property: ${passed}/${rows.length} pass, ${covered}/${rows.length} answered`);
process.exit(passed === rows.length ? 0 : 1);
