// Benchmark for the composition spikes.
//
// Every system answers the same 24 questions (6 intents × 4 paraphrases) and is
// scored on the things that make text feel written rather than filled in:
//
//   fidelity  – every required fact is present (a stylish wrong answer scores 0)
//   variety   – mean similarity between the four answers to the same intent
//               (low = the phrasing follows the question, not the template)
//   openers   – distinct first three words across all 24 answers
//   spread    – standard deviation of answer length in words
//   ttr       – mean type-token ratio (lexical range inside an answer)
//   stable    – identical text when the same question is asked twice
//   corpus    – distance from the site's own prose (sentence length, commas,
//               contractions, em dashes); only the corpus spike is scored on it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
import { loadFacts, PROBES } from './facts.mjs';
import { baseline } from './systems/baseline.mjs';
import { poolSystem } from './systems/a-pools.mjs';
import { grammarSystem } from './systems/b-grammar.mjs';
import { voiceSystem } from './systems/c-voice.mjs';
import { hybridSystem } from './systems/d-hybrid.mjs';
import { legacySystem } from './systems/legacy.mjs';

const facts = await loadFacts();

const NUMBER_WORDS = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
};

const norm = (text) =>
  text
    .toLowerCase()
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, (w) => NUMBER_WORDS[w])
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const words = (text) => norm(text).split(/[^a-z0-9@.+/-]+/).filter(Boolean);

function trigrams(text) {
  const clean = norm(text).replace(/[^a-z0-9 ]/g, '');
  const set = new Set();
  for (let i = 0; i < clean.length - 2; i += 1) set.add(clean.slice(i, i + 3));
  return set;
}

function jaccard(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const gram of A) if (B.has(gram)) shared += 1;
  return shared / (A.size + B.size - shared);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** How close a text sits to the site's blog prose. Lower is closer. */
const corpus = await (async () => {
  const dir = path.resolve(HERE, '../../content/posts');
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .slice(0, 24);
  const sentences = [];
  for (const file of files) {
    const body = fs
      .readFileSync(`${dir}/${file}`, 'utf8')
      .replace(/^---[\s\S]*?---/, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_`]/g, ' ');
    for (const sentence of body.split(/(?<=[.!?])\s+/)) {
      const clean = sentence.trim();
      if (clean.split(/\s+/).length >= 4) sentences.push(clean);
    }
  }
  const profile = (texts) => ({
    sentence: mean(texts.map((s) => s.split(/\s+/).length)),
    comma: mean(texts.map((s) => (s.match(/,/g) ?? []).length)),
    contraction: texts.filter((s) => /['\u2019](s|t|re|ve|ll|d|m)\b/.test(s)).length / texts.length,
    dash: texts.filter((s) => /[\u2014\u2013]/.test(s)).length / texts.length,
  });
  return { profile: profile(sentences), sentences: sentences.length };
})();

// Harvesting sentence openers from prose drags their subject along: "The
// synthesis: Readback and Groundglass." A frame that makes no claim is fine; a
// frame that introduces a topic the answer never mentions is a non-sequitur.
const NEUTRAL_FRAME =
  /^(the short version|short version|short answer|quick answer|in short|in one line|one line|bottom line|the upshot|the gist|worth saying|to be clear|for context|cutting to it|that is|that's|the list|everything|he has|she has|they are|it is|there are|here is|his |her |five |four |three |two |one |\d)/i;

function frameFit(text) {
  const opener = text.match(/^([^:\u2014\u2013]{2,42})[:\u2014\u2013]/);
  if (!opener) return 1; // no opener: nothing off-topic was introduced
  return NEUTRAL_FRAME.test(opener[1].trim()) ? 1 : 0;
}

function styleDistance(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
  if (sentences.length === 0) return 1;
  const p = {
    sentence: mean(sentences.map((s) => s.split(/\s+/).length)),
    comma: mean(sentences.map((s) => (s.match(/,/g) ?? []).length)),
    contraction: sentences.filter((s) => /['\u2019](s|t|re|ve|ll|d|m)\b/.test(s)).length / sentences.length,
    dash: sentences.filter((s) => /[\u2014\u2013]/.test(s)).length / sentences.length,
  };
  const c = corpus.profile;
  return (
    Math.abs(p.sentence - c.sentence) / 12 +
    Math.abs(p.comma - c.comma) / 2 +
    Math.abs(p.contraction - c.contraction) +
    Math.abs(p.dash - c.dash)
  );
}

async function run(system) {
  const rows = [];
  const started = process.hrtime.bigint();
  for (const probe of PROBES) {
    const must = probe.must(facts);
    const answers = [];
    for (const question of probe.questions) {
      const raw = await system.answer({ question, intent: probe.intent, facts });
      const tool = /^```json\s*\{\s*"tool"/.test(raw);
      const text = tool ? raw.match(/"tool"\s*:\s*"([^"]+)"/)?.[1] ? `[action: ${raw.match(/"tool"\s*:\s*"([^"]+)"/)[1]}]` : '[action]' : raw;
      answers.push({ question, text, action: tool });
    }
    // same question twice: a real system must not wobble
    const again = await system.answer({ question: probe.questions[0], intent: probe.intent, facts });
    const fidelityHits = answers.filter(({ text }) => must.every((needle) => norm(text).includes(norm(needle))));
    // Mask the facts themselves: two answers sharing "shobyde@gmail.com" are not
    // templated, they are correct. What is compared is the words around them.
    const mask = (text) => must.reduce((out, needle) => out.split(needle).join('{fact}'), text);
    const sims = [];
    for (let i = 0; i < answers.length; i += 1) {
      for (let j = i + 1; j < answers.length; j += 1) {
        sims.push(jaccard(mask(answers[i].text), mask(answers[j].text)));
      }
    }
    rows.push({
      intent: probe.intent,
      answers,
      fidelity: fidelityHits.length / answers.length,
      missing: answers
        .filter(({ text }) => !must.every((needle) => norm(text).includes(norm(needle))))
        .map(({ text }) => text.slice(0, 70)),
      similarity: mean(sims),
      stable: again === answers[0].text,
      lengths: answers.map(({ text }) => words(text).length),
      ttr: mean(answers.map(({ text }) => new Set(words(text)).size / Math.max(words(text).length, 1))),
      style: mean(answers.map(({ text }) => styleDistance(text))),
      offTopic: mean(answers.map(({ text }) => frameFit(text))),
    });
  }
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  const all = rows.flatMap((row) => row.answers.map((a) => a.text));
  const prefixes = all.map((text) => words(text).slice(0, 3).join(' '));
  return {
    rows,
    fidelity: mean(rows.map((row) => row.fidelity)),
    similarity: mean(rows.map((row) => row.similarity)),
    openers: new Set(prefixes).size / all.length,
    spread: stdev(all.map((text) => words(text).length)),
    ttr: mean(rows.map((row) => row.ttr)),
    stable: mean(rows.map((row) => (row.stable ? 1 : 0))),
    style: mean(rows.map((row) => row.style)),
    offTopic: mean(rows.map((row) => row.offTopic)),
    ms: elapsed,
    answers: all,
  };
}

const systems = [
  ['legacy', legacySystem(facts)],
  ['shipped', await baseline(facts)],
  ['A pools', poolSystem(facts)],
  ['B grammar', grammarSystem(facts)],
  ['C voice', voiceSystem(facts)],
  ['D hybrid', hybridSystem(facts)],
];

// Follow-up: "both?" after a question that named two things must refer back.
async function followUp(system) {
  await system.answer({ question: 'which projects use python?', intent: 'using_python', facts });
  const text = await system.answer({ question: 'both?', intent: 'using_python', facts });
  return /^(both|those two|the two)/i.test(text.trim()) ? 1 : 0;
}

const results = [];
for (const [name, system] of systems) {
  const result = await run(system);
  result.follow = await followUp(system);
  results.push([name, result]);
  console.log(`\n=== ${name}`);
  for (const row of result.rows) {
    console.log(
      `  ${row.intent.padEnd(13)} fidelity ${(row.fidelity * 100).toFixed(0).padStart(3)}%  sim ${row.similarity.toFixed(2)}  len σ ${stdev(row.lengths).toFixed(1)}  ttr ${row.ttr.toFixed(2)}`,
    );
    if (row.missing.length) console.log('    missing:', row.missing);
  }
}

console.log('\n\nsystem        fidelity  similarity  openers  spread  ttr   stable  corpus  frames  follow  ms');
for (const [name, r] of results) {
  console.log(
    `${name.padEnd(13)} ${(r.fidelity * 100).toFixed(0).padStart(6)}%  ${r.similarity.toFixed(2).padStart(10)}  ${r.openers.toFixed(2).padStart(7)}  ${r.spread.toFixed(1).padStart(6)}  ${r.ttr.toFixed(2)}  ${(r.stable * 100).toFixed(0).padStart(5)}%  ${r.style.toFixed(2).padStart(6)}  ${(r.offTopic * 100).toFixed(0).padStart(6)}%  ${String(r.follow).padStart(6)}  ${r.ms.toFixed(0)}`,
  );
}

// Samples, for reading rather than scoring.
const samples = ['using_python', 'posts_newest', 'list_titles'];
for (const [name, r] of results) {
  console.log(`\n--- ${name}`);
  for (const intent of samples) {
    const row = r.rows.find((x) => x.intent === intent);
    console.log(`  [${intent}]`);
    for (const a of row.answers) console.log(`   "${a.text}"`);
  }
}

fs.writeFileSync(
  path.join(HERE, 'results.json'),
  JSON.stringify(
    results.map(([name, r]) => ({
      name,
      fidelity: r.fidelity,
      similarity: r.similarity,
      openers: r.openers,
      spread: r.spread,
      ttr: r.ttr,
      stable: r.stable,
      style: r.style,
      offTopic: r.offTopic,
      ms: r.ms,
      rows: r.rows,
    })),
    null,
    2,
  ),
);
console.log(`\ncorpus: ${corpus.sentences} sentences, mean ${corpus.profile.sentence.toFixed(1)} words, contractions ${(corpus.profile.contraction * 100).toFixed(0)}%, dashes ${(corpus.profile.dash * 100).toFixed(0)}%`);
