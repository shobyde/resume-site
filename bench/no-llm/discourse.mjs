#!/usr/bin/env node
/**
 * Rung 6: discourse plans.
 *
 * `run.mjs` scores the slots and `answers.mjs` scores the answer set. This one
 * scores the answer as a piece of writing: the claim still has to carry every
 * required fact, and every sentence after it has to be read off the page's own
 * records rather than asserted. A sentence naming no project, no stack entry and
 * no count is the thing this rung exists to catch, because that is where filler
 * and adjectives get in.
 *
 * Usage: node bench/no-llm/discourse.mjs [--suite discourse.json] [--verbose]
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
const wordTokens = (text) => String(text).toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);

/** Everything a sentence is allowed to be grounded in: names, stacks, the role. */
const VOCAB = new Set();
for (const project of DATA.projects) {
  for (const word of wordTokens(shortName(project.title))) VOCAB.add(word);
  for (const entry of project.stack ?? []) for (const word of wordTokens(entry)) VOCAB.add(word);
}
for (const word of wordTokens(DATA.hero?.role ?? '')) VOCAB.add(word);
for (const word of wordTokens(DATA.hero?.name ?? '')) VOCAB.add(word);
// The profile rule answers from the experience records, so their orgs and
// titles are grounded facts too.
for (const role of DATA.experience ?? []) {
  for (const word of wordTokens(`${role.org ?? ''} ${role.title ?? ''}`)) VOCAB.add(word);
}

/** Filler the site's editorial rule bans outright. */
const BANNED = /\b(actually|simply|robust|seamless|powerful|cutting-edge|revolutionary|leverage|arguably|game-changing|world-class)\b|\u2014/i;

const countSyllables = (word) => {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  const groups = clean.match(/[aeiouy]+/g) ?? [];
  let n = groups.length;
  if (clean.endsWith('e') && n > 1 && !/[aeiouy]{2}e$/.test(clean)) n -= 1;
  return Math.max(1, n);
};

const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const wordsOf = (text) => String(text).match(/[A-Za-z0-9][A-Za-z0-9+#.'/-]*/g) ?? [];

const trigrams = (text) => {
  const clean = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  const set = new Set();
  for (let i = 0; i < clean.length - 2; i += 1) set.add(clean.slice(i, i + 3));
  return set;
};

const jaccard = (a, b) => {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const gram of A) if (B.has(gram)) shared += 1;
  return shared / (A.size + B.size - shared);
};

const containsWord = (text, word) =>
  new RegExp(`(?<![a-z0-9])${String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(text);

/** One turn, with the tool call the rule plans actually runs. */
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

const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'discourse.json'), 'utf8'));
const engine = createEngine();

const rows = [];
const records = DATA.projects ?? [];
const TRUE_NUMBERS = new Set([
  records.length,
  new Set(records.flatMap((project) => (project.stack ?? []).flatMap(wordTokens))).size,
  new Set(records.flatMap((project) => project.stack ?? [])).size,
  (DATA.experience ?? []).length,
]);
// Counts derived from the record set ("the other 5") are checkable too.
for (let i = 0; i <= records.length; i += 1) TRUE_NUMBERS.add(i);

/** A sentence past the first must cite something checkable: a name, a stack
 *  entry, or a count the page actually supports. Numbers are checked against
 *  TRUE_NUMBERS, so an invented count fails instead of passing as "a digit". */
function groundedSentence(sentence) {
  const tokens = wordTokens(sentence);
  if (tokens.some((token) => VOCAB.has(token))) return true;
  const digits = String(sentence).match(/\b\d+\b/g) ?? [];
  return digits.length > 0 && digits.every((d) => TRUE_NUMBERS.has(Number(d)));
}

for (const [intent, tasks] of Object.entries(suite.intents)) {
  for (const task of tasks) {
    const answer = await ask(engine, task.q);
    const again = await ask(engine, task.q);
    const sent = sentencesOf(answer);
    const extra = sent.slice(1);
    const allWords = wordsOf(answer);
    const syllables = allWords.reduce((n, w) => n + countSyllables(w), 0);
    const longest = Math.max(...sent.map((s) => wordsOf(s).length));

    const fidelity = task.must.every((needle) => containsWord(answer, needle));
    const says = !task.says || new RegExp(task.says, 'i').test(answer);
    // Copy a task names as wrong, whatever else the answer gets right: a
    // zero-match answer that counts "the other N projects" is inventing a match
    // set, and a property refusal claims a card names the word (rung 28).
    const allowed = (task.forbids ?? []).every((pattern) => !new RegExp(pattern, 'i').test(answer));
    const sentenceCount = sent.length >= task.minSentences && sent.length <= (task.minSentences === 1 ? 2 : 3);
    const grounded = extra.every(groundedSentence);
    const clean = !BANNED.test(answer);
    const readable = allWords.length > 0 && allWords.length / sent.length <= 22 && longest <= 30;
    const flesch = sent.length && allWords.length
      ? 206.835 - 1.015 * (allWords.length / sent.length) - 84.6 * (syllables / allWords.length)
      : 0;
    // Flesch on a run of proper nouns ("C++ physics simulation engines") reads
    // low without the prose being hard, so it is reported and only floored at
    // the point where a sentence has stopped parsing at all.
    const plain = flesch >= 30;
    const stable = answer === again;
    const ok = fidelity && says && allowed && sentenceCount && grounded && clean && readable && plain && stable;

    rows.push({ intent, q: task.q, answer, sent, must: task.must, fidelity, says, allowed, sentenceCount, grounded, clean, readable, flesch, plain, stable, ok });
  }
}

const passed = rows.filter((r) => r.ok).length;
const pct = (n = passed, d = rows.length) => Math.round((n / d) * 1000) / 10;
const flag = (n, d) => `${n}/${d}`;
const meanWps = rows.reduce((sum, r) => sum + wordsOf(r.answer).length / r.sent.length, 0) / rows.length;
const meanFlesch = rows.reduce((sum, r) => sum + r.flesch, 0) / rows.length;

process.stdout.write(`discourse: ${pct()}% (${passed}/${rows.length})\n`);
process.stdout.write(`  fidelity ${flag(rows.filter((r) => r.fidelity).length, rows.length)}  sentences ${flag(rows.filter((r) => r.sentenceCount).length, rows.length)}  grounded ${flag(rows.filter((r) => r.grounded).length, rows.length)}  clean ${flag(rows.filter((r) => r.clean).length, rows.length)}  plain ${flag(rows.filter((r) => r.plain).length, rows.length)}  stable ${flag(rows.filter((r) => r.stable).length, rows.length)}\n`);
process.stdout.write(`  readability: flesch ${meanFlesch.toFixed(1)}, words per sentence ${meanWps.toFixed(1)}\n`);

// Same-answer-twice is already checked per task; this checks the other half:
// four ways of asking one thing should not produce one sentence four times.
for (const [intent, tasks] of Object.entries(suite.intents)) {
  if (tasks.length < 2) continue;
  const answers = rows.filter((r) => r.intent === intent).map((r) => r.answer);
  let worst = 0;
  for (let i = 0; i < answers.length; i += 1) {
    for (let j = i + 1; j < answers.length; j += 1) worst = Math.max(worst, jaccard(answers[i], answers[j]));
  }
  process.stdout.write(`  template ${intent}: max paraphrase similarity ${worst.toFixed(2)} (want < 0.95)\n`);
}

for (const row of rows.filter((r) => !r.ok || verbose)) {
  const why = [
    !row.fidelity && `missing ${row.must.filter((m) => !containsWord(row.answer, m)).join(', ')}`,
    !row.says && 'did not give the expected answer',
    !row.allowed && 'said the copy a task rejects',
    !row.sentenceCount && `${row.sent.length} sentences`,
    !row.grounded && 'ungrounded sentence',
    !row.clean && 'banned word or em dash',
    !row.readable && 'long sentence',
    !row.plain && `flesch ${row.flesch.toFixed(0)}`,
    !row.stable && 'not stable',
  ].filter(Boolean);
  process.stdout.write(`  ${row.ok ? 'PASS' : 'FAIL'} "${row.q}"${why.length ? ` (${why.join('; ')})` : ''}\n    ${row.answer}\n`);
}
