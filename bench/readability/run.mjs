// Three rewriting approaches, aimed at how a person reads, not at an n-gram.
//
//   node bench/readability/run.mjs
//
// Each approach is fact-preserving by construction: it only splits, reorders or
// swaps words. The harness drops any rewrite that loses a number, a quoted
// string or a capitalised name, so a "more readable" answer can never be a less
// accurate one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { parseModelOutput } from '@shobyde/boaz';
import { createHybrid } from '../kb/systems.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(fs.readFileSync(path.join(here, '..', 'kb', 'kb.json'), 'utf8'));

const SITE_QUESTIONS = [
  'compare hobnob and readback',
  'what stack does hobnob use?',
  'which projects use python?',
  'which projects run locally?',
  'what can you do?',
  'which projects use typescript?',
];

const HANDBOOK_QUESTIONS = [
  'what is the incident severity policy?',
  'what is the data retention policy?',
  'what is the payment retries policy?',
  'what is the secrets rotation policy?',
  'what is the customer escalation policy?',
  'what are the steps for Atlas ingest backlog?',
  'what are the steps for Ledger reconciliation?',
  'who is on call for search?',
];

async function askSite(question) {
  const engine = createEngine();
  let observations;
  let text = '';
  for (let step = 0; step < 3; step += 1) {
    const completion = await engine.complete({ messages: [{ role: 'user', content: question }], tools: [], ...(observations ? { observations } : {}) });
    text = String(completion.text ?? '');
    const parsed = parseModelOutput(text);
    if (parsed.kind !== 'tool') break;
    observations = { ...(observations ?? {}), [parsed.capabilityId]: await runCapability(parsed.capabilityId, parsed.args ?? {}) };
  }
  return text.trim();
}

/* ------------------------------------------------------------- approaches */

const splitSentences = (text) => text.split(/(?<=[.!?])\s+/).filter(Boolean);
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A. Short sentences. A 30-word sentence with three clauses is harder to read
 * than three sentences, and splitting adds no words. Only splits at a safe
 * boundary: a semicolon, or ", and" / ", but" / ", so" after a full clause.
 */
function shortSentences(text) {
  const out = [];
  for (const sentence of splitSentences(text)) {
    if (wordCount(sentence) <= 22) {
      out.push(sentence);
      continue;
    }
    // Split at a semicolon, or before "but / so / while". Never before "and":
    // that produces a sentence that opens with the conjunction ("And the log…"),
    // which is the one thing a reader notices immediately.
    const parts = sentence
      .split(/;\s+|,\s+(?=(?:but|so|while)\s)/i)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 1) {
      out.push(sentence);
      continue;
    }
    parts.forEach((part, index) => {
      const closed = /[.!?]$/.test(part) ? part : `${part}${index === parts.length - 1 ? '.' : '.'}`;
      out.push(index === 0 ? capitalize(closed) : capitalize(closed));
    });
  }
  return out.join(' ');
}

/**
 * B. Answer first. The panel often opens with the context ("Hobnob: why the
 * problem exists") and puts the fact the visitor asked for second ("It runs on
 * Whisper"). This moves the concrete fact to the front.
 */
function answerFirst(text) {
  const sentences = splitSentences(text);
  const out = [];
  for (let index = 0; index < sentences.length; index += 1) {
    const label = sentences[index].match(/^([^:]{2,40}):\s*(.+)$/);
    const next = sentences[index + 1]?.match(/^It runs on (.+?)(?:\.)?$/i);
    if (label && next) {
      const pitch = label[2].replace(/\.$/, '');
      out.push(`${label[1].trim()} runs on ${next[1].replace(/\.$/, '')}.`);
      out.push(`${pitch}.`);
      index += 1;
      continue;
    }
    out.push(sentences[index]);
  }
  return out.join(' ');
}

/**
 * C. Plain words. A lexicon swap, not a paraphrase: the meaning of every
 * sentence is fixed by the words that carry facts, and those are left alone.
 */
const PLAIN = [
  [/\butili[sz]e(s|d)?\b/gi, (m, suffix) => (suffix ? 'uses' : 'use')],
  [/\bapproximately\b/gi, 'about'],
  [/\bprior to\b/gi, 'before'],
  [/\bin order to\b/gi, 'to'],
  [/\bis built with\b/gi, 'uses'],
  [/\bare built with\b/gi, 'use'],
  [/\ba number of\b/gi, 'several'],
  [/\bleverages?\b/gi, 'use'],
  [/\bsubsequently\b/gi, 'then'],
  [/\bcommence(s|d)?\b/gi, (m, suffix) => (suffix ? 'start' : 'start')],
  [/\bterminate(s|d)?\b/gi, (m, suffix) => (suffix ? 'stop' : 'stop')],
  [/\bassists?\b/gi, 'helps'],
  [/\bprovides?\b/gi, 'gives'],
];

function plainWords(text) {
  let out = text;
  for (const [pattern, replacement] of PLAIN) out = out.replace(pattern, replacement);
  // The label form "X: y." reads better as a sentence when y is a short noun
  // phrase. When the tail already contains a verb ("service is ingest-api"),
  // turning the label into a sentence produces "X is service is …".
  out = out.replace(/^([A-Z][A-Za-z .()'+-]{2,40}):\s+([a-z][^.]{0,60})\.$/g, (match, subject, rest) => {
    if (/\b(is|are|was|were|runs|uses|lists|keeps)\b/.test(rest)) return match;
    return `${subject} is ${rest}.`;
  });
  return out;
}

/* --------------------------------------------------------------- measures */

const factsIn = (text) => {
  const numbers = text.match(/\b\d[\d,.]*\b/g) ?? [];
  const quoted = text.match(/"([^"]{2,60})"/g) ?? [];
  const names = (text.match(/\b[A-Z][a-z][A-Za-z.+-]{2,}\b/g) ?? []).filter(
    (word) => !['The', 'This', 'That', 'Every', 'Each', 'Nothing', 'Only', 'Two', 'Just'].includes(word),
  );
  return [...new Set([...numbers, ...quoted, ...names])];
};
const lost = (before, after) => factsIn(before).filter((fact) => !after.includes(fact));

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function readability(text) {
  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter(Boolean);
  const total = Math.max(1, sentences.length);
  const syll = words.reduce((sum, word) => sum + syllables(word), 0);
  const flesch = words.length ? 206.835 - 1.015 * (words.length / total) - 84.6 * (syll / words.length) : 0;
  return {
    sentences: sentences.length,
    words: words.length,
    wordsPerSentence: Math.round((words.length / total) * 10) / 10,
    longestSentence: Math.max(...sentences.map((sentence) => wordCount(sentence)), 0),
    flesch: Math.round(flesch),
  };
}

/* ------------------------------------------------------------------ run */

const cases = [];
for (const question of SITE_QUESTIONS) cases.push({ source: 'site', question, answer: await askSite(question) });
for (const question of HANDBOOK_QUESTIONS) cases.push({ source: 'handbook', question, answer: createHybrid(kb).ask(question).text });

const APPROACHES = { shortSentences, answerFirst, plainWords };
const rows = [];
for (const item of cases) {
  const row = { source: item.source, question: item.question, answer: item.answer, before: readability(item.answer), variants: {} };
  for (const [name, apply] of Object.entries(APPROACHES)) {
    const candidate = apply(item.answer);
    const dropped = lost(item.answer, candidate);
    row.variants[name] = {
      text: candidate,
      changed: candidate !== item.answer,
      lost: dropped,
      metrics: readability(candidate),
      eligible: dropped.length === 0,
    };
  }
  rows.push(row);
}

const summary = {};
for (const name of Object.keys(APPROACHES)) {
  const applied = rows.filter((row) => row.variants[name].changed && row.variants[name].eligible);
  const mean = (key) => (applied.length ? Math.round((applied.reduce((sum, row) => sum + row.variants[name].metrics[key], 0) / applied.length) * 10) / 10 : null);
  summary[name] = {
    changed: applied.length,
    factsLost: rows.reduce((sum, row) => sum + row.variants[name].lost.length, 0),
    flesch: mean('flesch'),
    wordsPerSentence: mean('wordsPerSentence'),
    longestSentence: Math.max(0, ...applied.map((row) => row.variants[name].metrics.longestSentence)),
  };
}
summary.baseline = {
  flesch: Math.round(rows.reduce((sum, row) => sum + row.before.flesch, 0) / rows.length),
  wordsPerSentence: Math.round((rows.reduce((sum, row) => sum + row.before.wordsPerSentence, 0) / rows.length) * 10) / 10,
  longestSentence: Math.max(...rows.map((row) => row.before.longestSentence)),
};

fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', 'readability.json'), JSON.stringify({ generated: new Date().toISOString(), summary, rows }, null, 2));

console.log(`cases ${rows.length} (${rows.filter((row) => row.source === 'site').length} site, ${rows.filter((row) => row.source === 'handbook').length} handbook)`);
console.log(`baseline: flesch ${summary.baseline.flesch}, ${summary.baseline.wordsPerSentence} words/sentence, longest ${summary.baseline.longestSentence}`);
for (const [name, value] of Object.entries(summary)) {
  if (name === 'baseline') continue;
  console.log(`${name.padEnd(15)} applied ${value.changed}/${rows.length}, facts lost ${value.factsLost}, flesch ${value.flesch}, ${value.wordsPerSentence} words/sentence, longest ${value.longestSentence}`);
}
for (const row of rows) {
  for (const [name, variant] of Object.entries(row.variants)) {
    if (!variant.changed) continue;
    console.log(`\n[${name}] ${row.question}\n  before: ${row.answer.slice(0, 160)}\n  after : ${variant.text.slice(0, 160)}`);
  }
}
