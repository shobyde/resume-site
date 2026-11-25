// Does the library's matcher beat a plain token overlap, on two corpora?
//
//   node bench/matchlib/run.mjs
//
// Corpus A: the site's six project cards. Corpus B: the 520-fact handbook.
// Two scorers: plain overlap (shared words / question words, no weights, no
// gate) and boaz's weighted evidence (idf weights, head-noun gate, denial flag).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEntityResolver, createEvidenceIndex, contentWords } from '@shobyde/boaz/match';
import { DATA } from '../../src/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(fs.readFileSync(path.join(here, '..', 'kb', 'kb.json'), 'utf8'));

const flatten = (value) =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(flatten) : [];

const siteDocs = [];
for (const project of DATA.projects) {
  const name = String(project.title).split(':')[0].trim();
  const text = [String(project.summary ?? '').replace(/<[^>]+>/g, ''), ...flatten(project.details), (project.stack ?? []).join(', ')].join(' ');
  for (const sentence of text.split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter((s) => s.length > 20)) {
    siteDocs.push({ id: `${name}:${siteDocs.length}`, text: sentence, subject: name });
  }
}

const handbookDocs = kb.facts.map(([kind, subject, attribute, value], index) => ({
  id: `f${index}`,
  text: `${subject}: ${attribute} is ${value}.`,
  subject,
  value: String(value),
}));

/* ------------------------------------------------------------------ cases */

const siteCases = [
  { ask: 'does hobnob label speakers?', subject: 'Hobnob', want: 'speaker' },
  { ask: 'does hobnob transcribe audio?', subject: 'Hobnob', want: 'transcri' },
  { ask: 'does readback need a server?', subject: 'Readback', want: 'self-hosted' },
  { ask: 'does groundglass test generated interfaces?', subject: 'Groundglass', want: 'conformance' },
  { ask: 'does boaz need a model file?', subject: 'Boaz', want: 'no model' },
  { ask: 'does boaz use rules?', subject: 'Boaz', want: 'rules' },
  { ask: 'does hobnob support klingon?', subject: 'Hobnob', want: null },
  { ask: 'does readback print braille?', subject: 'Readback', want: null },
];

const handbookCases = kb.facts
  .filter(([kind, , attribute]) => ['sla', 'database', 'lead', 'headcount', 'severity', 'steps', 'direction'].includes(attribute))
  .slice(0, 16)
  .map(([kind, subject, attribute, value]) => ({
    ask: `what is the ${attribute} for ${subject}?`,
    subject,
    want: String(value).slice(0, 18),
  }));

/* ---------------------------------------------------------------- scorers */

function plainOverlap(docs, question, subject) {
  const asked = new Set(contentWords(question));
  let best = null;
  for (const doc of docs) {
    if (subject && doc.subject && doc.subject.toLowerCase() !== subject.toLowerCase()) continue;
    const words = new Set(contentWords(doc.text));
    const shared = [...asked].filter((word) => words.has(word)).length;
    const score = asked.size ? shared / asked.size : 0;
    if (shared && (!best || score > best.score)) best = { doc, score };
  }
  return best && best.score >= 0.3 ? best : null;
}

const siteIndex = createEvidenceIndex(siteDocs);
const handbookIndex = createEvidenceIndex(handbookDocs);

const results = { site: { plain: 0, weighted: 0, total: siteCases.length }, handbook: { plain: 0, weighted: 0, total: handbookCases.length }, falsePositives: { plain: 0, weighted: 0 } };

console.log('SITE');
for (const item of siteCases) {
  const plain = plainOverlap(siteDocs, item.ask, item.subject);
  const weighted = siteIndex.find(item.ask, { subject: item.subject });
  const ok = (hit, text) => (item.want === null ? !hit : Boolean(hit) && text.toLowerCase().includes(item.want));
  const plainOk = ok(plain, plain?.doc.text ?? '');
  const weightedOk = ok(weighted, weighted?.document.text ?? '');
  if (item.want === null) {
    if (plain) results.falsePositives.plain += 1;
    if (weighted) results.falsePositives.weighted += 1;
  }
  if (plainOk) results.site.plain += 1;
  if (weightedOk) results.site.weighted += 1;
  console.log(`  ${String(plainOk).padEnd(5)} ${String(weightedOk).padEnd(5)} ${item.ask}`);
  console.log(`        plain:    ${(plain?.doc.text ?? 'none').slice(0, 90)}`);
  console.log(`        weighted: ${(weighted?.document.text ?? 'none').slice(0, 90)}`);
}

console.log('HANDBOOK');
for (const item of handbookCases) {
  const plain = plainOverlap(handbookDocs, item.ask, item.subject);
  const weighted = handbookIndex.find(item.ask, { subject: item.subject });
  const good = (hit) => Boolean(hit) && hit.doc ? hit.doc.text.includes(item.want) : Boolean(hit) && hit.document.text.includes(item.want);
  const plainOk = plain ? plain.doc.text.includes(item.want) : false;
  const weightedOk = weighted ? weighted.document.text.includes(item.want) : false;
  if (plainOk) results.handbook.plain += 1;
  if (weightedOk) results.handbook.weighted += 1;
  if (!weightedOk) console.log(`  miss ${item.ask} -> ${(weighted?.document.text ?? 'none').slice(0, 70)}`);
}

/* ------------------------------------------------------------------ typo */

const resolver = createEntityResolver({ names: DATA.projects.map((project) => String(project.title).split(':')[0].trim()) });
const typos = ['hob knob', 'hobnobb', 'read back', 'ground glass', 'boas', 'sho byde'];
const typoHits = typos.filter((typo) => resolver.resolve(`what is ${typo}?`).matches.length > 0);

console.log(`\nSITE      plain ${results.site.plain}/${results.site.total}   weighted ${results.site.weighted}/${results.site.total}`);
console.log(`HANDBOOK  plain ${results.handbook.plain}/${results.handbook.total}   weighted ${results.handbook.weighted}/${results.handbook.total}`);
console.log(`FALSE +   plain ${results.falsePositives.plain}   weighted ${results.falsePositives.weighted}`);
console.log(`TYPOS     resolver ${typoHits.length}/${typos.length} (${typoHits.join(', ')})`);

fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', 'matchlib.json'), JSON.stringify({ results, typoHits, typos }, null, 2));
