#!/usr/bin/env node
/**
 * Rung 7: extractive summarisation.
 *
 * "What does he write about" is a summary question, not a lookup: the honest
 * answer is three sentences from the blog, each cited to the post it came from.
 * Both systems below share the same retrieval step (rank posts against the
 * question, read those posts' own markdown), so the number measures the
 * summariser and nothing else:
 *
 *   baseline — flatten the retrieved prose into sentences, rank them by keyword
 *              relevance, keep the top three. That is a retriever doing its
 *              best: three sentences that usually argue the same point from the
 *              same post.
 *   library  — `summarise()` from boaz (MMR over tf-idf, one sentence per post).
 *
 * A task passes only when all of these hold:
 *   grounded  every pick is a whole sentence that appears in the post it cites
 *   cited     every pick names its post
 *   spread    the picks are not near-copies of each other (mean pairwise cosine
 *             under the ceiling)
 *   topical   when the question names a subject the posts cover, at least two of
 *             the three picks carry it
 *
 * A question about a subject no post covers is reported as unanswerable and kept
 * out of the pass rate: the corpus is the ceiling, not the summariser.
 *
 * Usage: node bench/no-llm/summarise.mjs [--suite summarise.json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tokenize } from '@shobyde/boaz/core';
import {
  contentTerms,
  corpusFrom,
  rankPosts,
  summariseDocuments,
  thesesFrom,
} from '../../src/agent/summarise.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const flag = (name) => process.argv.includes(name);

const K = 3;
const SPREAD_CEILING = 0.35;

const suite = JSON.parse(
  await readFile(argValue('--suite') || path.join(here, 'summarise.json'), 'utf8'),
);
const posts = JSON.parse(await readFile(path.join(root, suite.corpus), 'utf8'));

const documents = await Promise.all(
  posts.map(async (post) => ({
    slug: post.slug,
    title: post.title,
    tag: post.tag,
    markdown: await readFile(path.join(root, 'content/posts', `${post.slug}.md`), 'utf8'),
  })),
);
const bySlug = new Map(documents.map((document) => [document.slug, document]));
const corpus = corpusFrom(documents);

function vectorsFor(sentences) {
  const tokens = sentences.map((sentence) => tokenize(sentence.text));
  const documentFrequency = new Map();
  for (const words of tokens) {
    for (const word of new Set(words)) {
      documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
    }
  }
  const idf = (term) => Math.log(1 + sentences.length / (1 + (documentFrequency.get(term) || 0)));
  const units = tokens.map((words) => {
    const counts = new Map();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    const vector = {};
    let length = 0;
    for (const [term, count] of counts) {
      const weight = count * idf(term);
      vector[term] = weight;
      length += weight * weight;
    }
    const norm = Math.sqrt(length) || 1;
    for (const term of Object.keys(vector)) vector[term] /= norm;
    return vector;
  });
  return { units, idf };
}

const cosine = (a, b) => {
  let dot = 0;
  for (const [term, weight] of Object.entries(a)) dot += weight * (b[term] || 0);
  return dot;
};

function baseline(query, sentences) {
  const { units, idf } = vectorsFor(sentences);
  const queryVector = {};
  let length = 0;
  for (const term of tokenize(query)) {
    const weight = idf(term);
    queryVector[term] = weight;
    length += weight * weight;
  }
  const norm = Math.sqrt(length) || 1;
  for (const term of Object.keys(queryVector)) queryVector[term] /= norm;
  return sentences
    .map((sentence, index) => ({ ...sentence, relevance: cosine(queryVector, units[index]) }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, K);
}

function score(picks, task, sentenceSet) {
  const grounded = picks.every((pick) => {
    const document = bySlug.get(pick.source);
    if (!document) return false;
    const prose = sentenceSet
      .filter((sentence) => sentence.source === pick.source)
      .map((sentence) => sentence.text);
    return prose.includes(pick.text) && pick.text.split(/\s+/).length >= 5;
  });
  const cited = picks.every((pick) => Boolean(pick.source && pick.sourceTitle));

  const { units } = vectorsFor(picks.map((pick) => ({ text: pick.text })));
  let similarity = 0;
  let pairs = 0;
  for (let i = 0; i < picks.length; i += 1) {
    for (let j = i + 1; j < picks.length; j += 1) {
      similarity += cosine(units[i], units[j]);
      pairs += 1;
    }
  }
  // One pick has nothing to be redundant with: a short summary is not a clone.
  const meanSimilarity = pairs ? similarity / pairs : 0;
  const spread = meanSimilarity < SPREAD_CEILING;

  let topical = true;
  let coverage = 0;
  let needed = 0;
  if (task.topic?.length) {
    const has = (text) => {
      const words = new Set(tokenize(text));
      return task.topic.some((term) => words.has(term));
    };
    const covering = new Set(
      sentenceSet.filter((sentence) => has(sentence.text)).map((sentence) => sentence.source),
    );
    coverage = covering.size;
    // One sentence per post is the rule, so the answer can name the subject at
    // most once per post that covers it. Asking for two when only one post
    // mentions the subject would score the corpus, not the summariser.
    needed = Math.min(2, coverage);
  }

  let precision = 1;
  if (task.topic?.length && coverage >= 1) {
    const hits = picks.filter((pick) => {
      const words = new Set(tokenize(pick.text));
      return task.topic.some((term) => words.has(term));
    }).length;
    precision = picks.length ? hits / picks.length : 0;
    topical = hits >= needed;
  }

  return {
    grounded,
    precision,
    cited,
    spread,
    topical,
    answerable: !task.topic?.length || coverage >= 1,
    coverage,
    needed,
    meanSimilarity: Math.round(meanSimilarity * 1000) / 1000,
    pass: grounded && cited && spread && topical,
  };
}

const rows = [];
for (const task of suite.tasks) {
  const terms = contentTerms(task.query);
  const guided = tokenize(terms).length > 0;
  const chosen = rankPosts(posts, guided ? terms : task.query, suite.docs ?? 8);
  const retrieved = chosen.map((post) => bySlug.get(post.slug));
  const sentences = guided ? corpusFrom(retrieved) : thesesFrom(retrieved);
  if (sentences.length === 0) continue;

  // Same sentences, same terms: the only difference is the picker.
  const before = baseline(guided ? terms : '', sentences);
  const afterResult = summariseDocuments(task.query, retrieved);
  const after = afterResult.picks;
  rows.push({
    task,
    before: score(before, task, sentences),
    after: score(after, task, sentences),
    beforePicks: before,
    afterPicks: after,
    sentences: sentences.length,
    read: retrieved.length,
  });

  if (flag('--verbose')) {
    console.log(`\n${task.id}: ${task.query}`);
    console.log(`  before ${rows.at(-1).before.pass ? 'PASS' : 'FAIL'} sim=${rows.at(-1).before.meanSimilarity}`);
    for (const pick of before) console.log(`    - [${pick.sourceTitle}] ${pick.text}`);
    console.log(`  after  ${rows.at(-1).after.pass ? 'PASS' : 'FAIL'} sim=${rows.at(-1).after.meanSimilarity}`);
    for (const pick of after) console.log(`    - [${pick.sourceTitle}] ${pick.text}`);
  }
}

const scored = rows.filter((row) => row.after.answerable);
const unanswerable = rows.filter((row) => !row.after.answerable);
const rate = (which) => (scored.filter((row) => row[which].pass).length / scored.length) * 100;
const component = (key, which) =>
  (scored.filter((row) => row[which][key]).length / scored.length) * 100;

console.log(`\nsummarise: ${suite.tasks.length} tasks, ${scored.length} scored, ${unanswerable.length} unanswerable`);
console.log(`  corpus ${corpus.length} sentences from ${documents.length} posts, ${rows[0]?.sentences ?? 0} read per question`);
console.log(`  pass      ${rate('before').toFixed(1)}% -> ${rate('after').toFixed(1)}%`);
console.log(`  precision ${(scored.reduce((sum, row) => sum + row.after.precision, 0) / scored.length).toFixed(2)} after vs ${(scored.reduce((sum, row) => sum + row.before.precision, 0) / scored.length).toFixed(2)} before (share of quoted sentences carrying the subject)`);
for (const key of ['grounded', 'cited', 'spread', 'topical']) {
  console.log(`  ${key.padEnd(9)} ${component(key, 'before').toFixed(1)}% -> ${component(key, 'after').toFixed(1)}%`);
}
if (unanswerable.length) {
  console.log(`  no post covers: ${unanswerable.map((row) => row.task.topic.join('/')).join(', ')}`);
}

const failures = scored.filter((row) => !row.after.pass);
if (failures.length) {
  console.log('\n  still failing after the change:');
  for (const row of failures) {
    console.log(`    ${row.task.id} (${row.task.query}) sim=${row.after.meanSimilarity} coverage=${row.after.coverage}`);
    for (const pick of row.afterPicks) console.log(`      - [${pick.sourceTitle}] ${pick.text}`);
  }
}

process.exitCode = rate('after') >= 70 && rate('after') > rate('before') ? 0 : 1;
