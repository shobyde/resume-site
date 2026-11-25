// Matching a question to the right record when the words are not quite the words.
//
//   node bench/matching/run.mjs
//
// Two mechanisms, measured separately:
//   1. canonicalise: a near-miss name ("hob knob", "hobnobb", "read back") is
//      rewritten to the entity the visitor meant, before routing. Every answer
//      rule downstream then works unchanged.
//   2. evidence: a feature question ("does hobnob label speakers") is answered
//      from the card's own prose by quoting the clause that carries the words,
//      or declined when no clause does.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { parseModelOutput } from '@shobyde/boaz';
import { DATA } from '../../src/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const norm = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (text) => norm(text).replace(/\s+/g, '');

/** Damerau-Levenshtein distance, bounded: enough for one or two typos. */
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const rows = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j += 1) rows[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + cost);
      }
    }
  }
  return rows[m][n];
}

const flatten = (value) =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(flatten)
      : [];

const ENTITIES = DATA.projects.map((project) => ({
  name: String(project.title).split(':')[0].trim(),
  title: project.title,
  summary: String(project.summary ?? '').replace(/<[^>]+>/g, ''),
  // The card's details carry the feature text ("real-time captions with speaker
  // labels"); without them a feature question has nothing to read.
  details: flatten(project.details).join(' ').replace(/<[^>]+>/g, ''),
  stack: project.stack ?? [],
}));

/** A cheap phonetic key: enough to catch "boas" for "boaz" and "hob knob". */
function soundex(word) {
  const key = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!key) return '';
  const map = { B: 1, F: 1, P: 1, V: 1, C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2, D: 3, T: 3, L: 4, M: 5, N: 5, R: 6 };
  const first = key[0];
  let tail = '';
  let last = map[first] ?? 0;
  for (const char of key.slice(1)) {
    const code = map[char] ?? 0;
    if (code && code !== last) tail += code;
    last = code || last;
  }
  return `${first}${tail.padEnd(3, '0').slice(0, 3)}`;
}

/**
 * Rewrites near-miss names to the canonical one. Two signals must agree for a
 * fuzzy match: the spelling is within one edit (two for long names) and the
 * phonetic key matches. One signal alone matches too much: "boas" is one edit
 * from "boaz" but also from "bias".
 */
export function canonicalise(question) {
  const text = String(question);
  const words = norm(text.replace(/\bdot\b/gi, ' ')).split(' ').filter(Boolean);
  const hits = [];
  for (const entity of ENTITIES) {
    const target = compact(entity.name);
    // Try one word, then two, then three: "hob knob" is two.
    for (let span = 1; span <= 3; span += 1) {
      for (let start = 0; start + span <= words.length; start += 1) {
        const candidate = words.slice(start, start + span).join('');
        if (candidate.length < 4) continue;
        const allowed = target.length >= 8 ? 2 : 1;
        const spelling = distance(candidate, target);
        const phonetic = soundex(candidate) === soundex(target);
        const prefix = candidate.slice(0, 3) === target.slice(0, 3);
        const exact = candidate === target;
        if (exact || (spelling <= allowed && (phonetic || prefix)) || (spelling <= 2 && candidate.length >= 6 && prefix)) {
          hits.push({ entity: entity.name, from: words.slice(start, start + span).join(' '), start, span, spelling: exact ? 0 : spelling });
        }
      }
    }
  }
  if (!hits.length) return { question: text, matched: null };
  hits.sort((a, b) => a.spelling - b.spelling || b.span - a.span);
  // Keep the best hit per starting word, then rewrite all of them: a sentence
  // can carry two near-miss names ("compare hob knob and read back").
  const chosen = [];
  for (const hit of hits) {
    if (chosen.some((other) => hit.start < other.start + other.span && other.start < hit.start + hit.span)) continue;
    chosen.push(hit);
  }
  chosen.sort((a, b) => b.start - a.start);
  let rewritten = String(text);
  for (const hit of chosen) {
    const words = rewritten.split(/(\s+)/);
    let index = -1;
    let consumed = 0;
    const out = [];
    for (const piece of words) {
      if (/^\s+$/.test(piece)) {
        out.push(piece);
        continue;
      }
      index += 1;
      if (index < hit.start) {
        out.push(piece);
        continue;
      }
      if (index === hit.start) {
        out.push(hit.entity);
        consumed = hit.span;
        continue;
      }
      if (consumed > 1) {
        consumed -= 1;
        continue;
      }
      out.push(piece);
    }
    rewritten = out.join('');
  }
  const best = { entity: chosen[0].entity, from: chosen[0].from, spelling: chosen[0].spelling };
  return { question: rewritten.replace(/\s{2,}/g, ' ').trim(), matched: best, replaced: chosen.length };
  // eslint-disable-next-line no-unreachable
  const unused = 0;
  // Rebuild the sentence with the canonical name in place of the near miss.
  const original = text.split(/(\s+)/);
  const tokens = [];
  let wordIndex = 0;
  for (const piece of original) {
    if (/^\s+$/.test(piece)) {
      tokens.push({ space: true, text: piece });
    } else {
      tokens.push({ space: false, text: piece, index: wordIndex });
      wordIndex += 1;
    }
  }
  let replaced = 0;
  const rebuilt = tokens
    .map((token) => {
      if (token.space) return token.text;
      if (token.index === best.start) {
        replaced = 1;
        return best.entity;
      }
      if (token.index > best.start && token.index < best.start + best.span) {
        replaced += 1;
        return '';
      }
      return token.text;
    })
    .join('')
    .replace(/\s{2,}/g, ' ');
  return { question: rebuilt.trim(), matched: { entity: best.entity, from: best.from, spelling: best.spelling } };
}

const STOP = new Set(['the', 'a', 'an', 'does', 'do', 'is', 'are', 'can', 'it', 'its', 'with', 'for', 'and', 'or', 'to', 'in', 'on', 'of', 'that', 'this', 'support', 'supports', 'have', 'has', 'any']);
const tokens = (text) => norm(text).split(' ').filter((word) => word.length > 2 && !STOP.has(word));

/**
 * Feature evidence: find the clause of the card that carries the question's
 * words. Returns null when no clause does, which is the answer "the card does
 * not say", not a guess.
 */
export function evidenceFor(entity, question) {
  const wanted = tokens(question).filter((word) => !norm(entity.name).split(' ').includes(word));
  if (!wanted.length) return null;
  // Whole sentences only: a comma fragment ("transcribes") is not evidence, and
  // the first sentence of most cards is the problem the project rejects, so it
  // cannot be quoted as a feature either.
  const sentences = `${entity.summary} ${entity.details} ${entity.stack.join('. ')}`
    .split(/(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  // The site's cards open with the problem the project rejects ("Meeting
  // note-takers ship your conversations to someone else's server"). That is a
  // pitch, not a feature, so it is ranked down rather than quoted as evidence.
  const framing = /(someone else's|closed systems|nobody can check|agents now|most "ai)/i;
  let best = null;
  for (const clause of sentences) {
    const have = new Set(tokens(clause));
    const shared = wanted.filter((word) => have.has(word));
    if (!shared.length) continue;
    const score = shared.length / wanted.length - (framing.test(clause) ? 0.35 : 0);
    const denial = /\b(no|not|never|without|nobody)\b/i.test(clause);
    if (score >= 0.5 && (!best || score > best.score)) best = { clause, score: Math.max(0, score), shared, denial };
  }
  return best;
}

/* ------------------------------------------------------------------ cases */

const CASES = [
  // near-miss names
  { id: 't1', kind: 'typo', ask: 'what stack does hob knob use?' },
  { id: 't2', kind: 'typo', ask: 'tell me about hobnobb' },
  { id: 't3', kind: 'typo', ask: 'how big is read back?' },
  { id: 't4', kind: 'typo', ask: 'what is ground glass?' },
  { id: 't5', kind: 'typo', ask: 'what is boas?' },
  { id: 't6', kind: 'typo', ask: 'compare hob knob and read back' },
  { id: 't7', kind: 'typo', ask: 'does sho byde dot com have a blog?' },
  { id: 't8', kind: 'typo', ask: 'who built hobnob?' },
  // feature questions
  { id: 'f1', kind: 'feature', ask: 'does hobnob transcribe audio?' },
  { id: 'f2', kind: 'feature', ask: 'does hobnob work offline?' },
  { id: 'f3', kind: 'feature', ask: 'does readback need a server?' },
  { id: 'f4', kind: 'feature', ask: 'does groundglass test generated interfaces?' },
  { id: 'f5', kind: 'feature', ask: 'does boaz need a model file?' },
  { id: 'f6', kind: 'feature', ask: 'does hobnob label speakers?' },
  { id: 'f7', kind: 'feature', ask: 'does readback have quizzes for kids?' },
  { id: 'f8', kind: 'feature', ask: 'does boaz use rules?' },
  // controls: the card does not say, so the only honest answer is a decline
  { id: 'c1', kind: 'control', ask: 'does hobnob support klingon?' },
  { id: 'c2', kind: 'control', ask: 'does boaz train a model?' },
  { id: 'c3', kind: 'control', ask: 'what is the price of hobnob?' },
  { id: 'c4', kind: 'control', ask: 'does readback print braille?' },
];

async function askEngine(question) {
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

const DECLINE = /(not sure|i can only|couldn't|no project|nothing on the page|^```json)/i;
const rows = [];
for (const item of CASES) {
  const before = await askEngine(item.ask);
  const canon = canonicalise(item.ask);
  const afterName = canon.matched ? await askEngine(canon.question) : before;
  // A feature question may name the entity exactly; that needs no rewrite, only
  // the evidence step.
  const named = ENTITIES.find((candidate) => norm(item.ask).includes(norm(candidate.name).replace(/\./g, ' ')) || compact(item.ask).includes(compact(candidate.name)));
  const entity = canon.matched ? ENTITIES.find((candidate) => candidate.name === canon.matched.entity) : named ?? null;
  const evidence = entity ? evidenceFor(entity, canon.question) : null;
  const featureAnswer = evidence
    ? evidence.denial
      ? `${entity.name} says the opposite: “${evidence.clause.replace(/\.$/, '')}”.`
      : `${entity.name}: “${evidence.clause.replace(/\.$/, '')}”.`
    : `${entity?.name ?? 'That'} is not described as doing that on this page.`;
  rows.push({
    id: item.id,
    kind: item.kind,
    ask: item.ask,
    canonical: canon.question,
    matched: canon.matched,
    before,
    // The comparison the report makes: the engine as it ships, then the
    // canonicalised (typo) or evidenced (feature) answer the spike proposes.
    proposed: item.kind === 'feature' || item.kind === 'control' ? featureAnswer : afterName,
    afterName,
    evidence: evidence ? { clause: evidence.clause, score: Number(evidence.score.toFixed(2)), shared: evidence.shared } : null,
    featureAnswer,
  });
}

const answered = (text) => !DECLINE.test(text) && text.length > 0;
const summary = { cases: rows.length, typo: 0, typoFixed: 0, feature: 0, featureEvidenced: 0, control: 0, controlDeclined: 0, beforeAnswered: 0, afterAnswered: 0, passed: 0, baselinePassed: 0 };
for (const row of rows) {
  // A pass is per kind: a typo needs the entity resolved and an answer, a
  // feature needs a quotable clause, a control needs the absence of one.
  const pass = row.kind === 'typo' ? Boolean(row.matched) && answered(row.proposed) : row.kind === 'feature' ? Boolean(row.evidence) : !row.evidence;
  row.pass = pass;
  if (pass) summary.passed += 1;
  const baseline = row.kind === 'typo' ? answered(row.before) && Boolean(row.matched) : row.kind === 'feature' ? answered(row.before) && /"/.test(row.before) : !answered(row.before);
  row.baselinePass = baseline;
  if (baseline) summary.baselinePassed += 1;
}
for (const row of rows) {
  if (row.kind === 'typo') {
    summary.typo += 1;
    if (row.matched && answered(row.afterName) && !answered(row.before)) summary.typoFixed += 1;
  }
  if (row.kind === 'feature') {
    summary.feature += 1;
    if (row.evidence) summary.featureEvidenced += 1;
  }
  if (row.kind === 'control') {
    summary.control += 1;
    if (!row.evidence) summary.controlDeclined += 1;
  }
  if (answered(row.before)) summary.beforeAnswered += 1;
  if (answered(row.proposed)) summary.afterAnswered += 1;
}

fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', 'matching.json'), JSON.stringify({ generated: new Date().toISOString(), summary, rows }, null, 2));

console.log(`cases ${summary.cases}: typos ${summary.typo}, features ${summary.feature}, controls ${summary.control}`);
console.log(`typos recovered ${summary.typoFixed}/${summary.typo} | features with evidence ${summary.featureEvidenced}/${summary.feature} | controls declined ${summary.controlDeclined}/${summary.control}`);
console.log(`answered before ${summary.beforeAnswered}/${summary.cases}, after ${summary.afterAnswered}/${summary.cases}`);
for (const row of rows) {
  console.log(`\n${row.kind.toUpperCase()} ${row.id} ${row.ask}`);
  if (row.matched) console.log(`  canonical: ${row.canonical}  (${row.matched.from} -> ${row.matched.entity})`);
  console.log(`  before: ${row.before.slice(0, 130)}`);
  if (row.matched) console.log(`  after : ${row.afterName.slice(0, 130)}`);
  if (row.evidence) console.log(`  evidence: ${row.evidence.clause.slice(0, 120)}`);
}
