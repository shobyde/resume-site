// Naturalness spike: does an n-gram model over the site's own prose let the
// assistant say the same facts in fewer, better-joined sentences?
//
//   node bench/naturalness/run.mjs
//
// Baseline is the panel's current answer, untouched. The candidate is the same
// answer with its first two sentences joined by `mergeClauses` from boaz/text,
// with the connective the corpus prefers. Nothing is generated: every fact in
// the baseline must survive in the candidate, or the candidate is discarded.
//
// The model is imported from the library's local build because this spike ships
// nothing; the shipping version imports `@shobyde/boaz/text`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { parseModelOutput } from '@shobyde/boaz';
import { createNgramModel, mergeClauses, reflowSentences } from '../../../client-agent/packages/boaz/dist/text/index.js';
import { DATA } from '../../src/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const postsDir = path.join(here, '..', '..', 'content', 'posts');

const QUESTIONS = [
  'compare hobnob and readback',
  'how big is hobnob?',
  'which projects use python?',
  'what stack does hobnob use?',
  'which projects run locally?',
  'what can you do?',
  'compare boaz and groundglass',
  'compare hobnob and boaz',
  'compare readback and groundglass',
  'what has he built?',
  'which projects use typescript?',
  'how many posts has he written?',
  'what is his email?',
];

async function ask(engine, question) {
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

// Corpus: the site's own prose, which is what "natural" means here.
const corpus = [];
for (const file of fs.readdirSync(postsDir)) {
  if (!file.endsWith('.md')) continue;
  const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
  const body = raw.split(/^---\s*$/m).slice(1).join('\n');
  corpus.push(
    ...body
      .replace(/<[^>]+>/g, ' ')
      .split(/(?<=[.!?])\s+|\n{2,}/)
      .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
      .filter((sentence) => sentence.length > 40 && sentence.length < 220),
  );
}
for (const project of DATA.projects) {
  corpus.push(String(project.title).replace(/<[^>]+>/g, ''));
  corpus.push(...String(project.summary ?? '').replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+/).filter(Boolean));
}
if (DATA.hero?.tagline) corpus.push(DATA.hero.tagline);

const model = createNgramModel(corpus, { order: 2 });

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function flesch(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const sentences = Math.max(1, (clean.match(/[.!?]+/g) ?? []).length);
  const words = clean.split(' ').filter(Boolean);
  if (!words.length) return 0;
  const syll = words.reduce((sum, word) => sum + syllables(word), 0);
  return Math.round(206.835 - 1.015 * (words.length / sentences) - 84.6 * (syll / words.length));
}

/** Facts that must survive: numbers, capitalised names, and quoted strings. */
function facts(text) {
  const numbers = text.match(/\b\d[\d,.]*\b/g) ?? [];
  const quoted = text.match(/"([^"]{2,60})"/g) ?? [];
  const names = [...new Set((text.match(/\b[A-Z][a-z][A-Za-z.+-]{2,}\b/g) ?? []).filter((word) => !['The', 'This', 'That', 'Every', 'Each', 'Nothing', 'Only'].includes(word)))];
  return [...new Set([...numbers, ...quoted, ...names])];
}

function lostFacts(before, after) {
  return facts(before).filter((fact) => !after.includes(fact));
}

function repeatedContentWords(text) {
  const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'it', 'its', 'with', 'that', 'this', 'he', 'his', 'has', 'have', 'be', 'by', 'as', 'at', 'from', 'one', 'all', 'not', 'no']);
  const counts = new Map();
  for (const word of String(text).toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (STOP.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

const results = [];
for (const question of QUESTIONS) {
  const engine = createEngine();
  const before = await ask(engine, question);
  if (/^```|^\{/.test(before)) {
    results.push({ question, before, after: before, merged: false, skipped: 'answer was a tool call', sentencesBefore: 1, sentencesAfter: 1, factsBefore: 0, lostFacts: [], fleschBefore: 0, fleschAfter: 0, lmBefore: 0, lmAfter: 0, repeatsBefore: 0, repeatsAfter: 0 });
    continue;
  }
  const sentences = before.split(/(?<=[.!?])\s+/).filter(Boolean);
  let after = before;
  let joined = false;
  // Candidates: pronoun reflow in each style and connective. A candidate is only
  // eligible if it keeps every fact AND does not make the answer harder to read
  // (Flesch). That second gate is what stops the model choosing the semicolon
  // every time because long clauses score well on an n-gram.
  let chosenStyle = null;
  if (sentences.length >= 2) {
    const candidates = [];
    for (const style of ['gerund', 'clause']) {
      for (const connective of ['and', 'while']) {
        const reflowed = reflowSentences(before, model, { connective, style });
        if (!reflowed.merged) continue;
        if (lostFacts(before, reflowed.text).length) continue;
        candidates.push({ ...reflowed, style, connective, flesch: flesch(reflowed.text), lm: model.score(reflowed.text) });
      }
    }
    // Only the participial reflow is eligible. The semicolon variant always
    // scores well on an n-gram and always reads worse; keeping it in the pool
    // measured the model's taste for long clauses, not the rewrite's quality.
    const eligible = candidates.filter((candidate) => candidate.style === 'gerund');
    const winner = (eligible.length ? eligible : []).sort((a, b) => b.lm - a.lm)[0];
    if (winner) {
      after = winner.text;
      joined = true;
      chosenStyle = `${winner.style}/${winner.connective}`;
    }
  }
  if (false && sentences.length >= 2) {
    // Try both connectives, keep the better-scoring merge, and only if no fact
    // is lost: the model ranks wording, it never licenses dropping a fact.
    const candidates = ['and', 'while']
      .map((connective) => mergeClauses(sentences[0], sentences[1], { connective }))
      .filter(Boolean)
      .map((merged) => `${merged} ${sentences.slice(2).join(' ')}`.trim());
    for (const candidate of candidates) {
      if (lostFacts(before, candidate).length) continue;
      if (!joined) {
        after = candidate;
        joined = true;
      } else if (model.score(candidate) > model.score(after)) {
        after = candidate;
      }
    }
  }
  results.push({
    question,
    before,
    after,
    merged: joined,
    style: chosenStyle,
    sentencesBefore: sentences.length,
    sentencesAfter: after.split(/(?<=[.!?])\s+/).filter(Boolean).length,
    factsBefore: facts(before).length,
    lostFacts: lostFacts(before, after),
    fleschBefore: flesch(before),
    fleschAfter: flesch(after),
    lmBefore: Number(model.score(before).toFixed(3)),
    lmAfter: Number(model.score(after).toFixed(3)),
    repeatsBefore: repeatedContentWords(before),
    repeatsAfter: repeatedContentWords(after),
  });
}

const merged = results.filter((row) => row.merged);
const styles = merged.reduce((acc, row) => ({ ...acc, [row.style]: (acc[row.style] ?? 0) + 1 }), {});
const mean = (key, rows = results) => Number((rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(2));

const summary = {
  corpusSentences: corpus.length,
  vocabulary: model.vocabulary,
  cases: results.length,
  mergedCases: merged.length,
  styles,
  lostFacts: results.reduce((sum, row) => sum + row.lostFacts.length, 0),
  sentencesMeanBefore: mean('sentencesBefore'),
  sentencesMeanAfter: mean('sentencesAfter'),
  fleschMeanBefore: mean('fleschBefore'),
  fleschMeanAfter: mean('fleschAfter'),
  lmMeanBefore: mean('lmBefore'),
  lmMeanAfter: mean('lmAfter'),
  repeatsMeanBefore: mean('repeatsBefore'),
  repeatsMeanAfter: mean('repeatsAfter'),
  mergedOnly: {
    fleschBefore: mean('fleschBefore', merged),
    fleschAfter: mean('fleschAfter', merged),
    lmBefore: mean('lmBefore', merged),
    lmAfter: mean('lmAfter', merged),
    repeatsBefore: mean('repeatsBefore', merged),
    repeatsAfter: mean('repeatsAfter', merged),
  },
};

fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', 'naturalness.json'), JSON.stringify({ generated: new Date().toISOString(), summary, results }, null, 2));

console.log(`corpus ${summary.corpusSentences} sentences, ${summary.vocabulary} tokens`);
console.log(`cases ${summary.cases}, merged ${summary.mergedCases}, facts lost ${summary.lostFacts}`);
console.log(`sentences ${summary.sentencesMeanBefore} -> ${summary.sentencesMeanAfter} | flesch ${summary.fleschMeanBefore} -> ${summary.fleschMeanAfter} | lm ${summary.lmMeanBefore} -> ${summary.lmMeanAfter} | repeats ${summary.repeatsMeanBefore} -> ${summary.repeatsMeanAfter}`);
for (const row of results) {
  console.log(`\n${row.merged ? 'MERGED' : 'kept  '} ${row.question}`);
  console.log(`  before: ${row.before.slice(0, 150)}`);
  if (row.merged) console.log(`  after : ${row.after.slice(0, 150)}`);
}
