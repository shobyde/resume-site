// A/B/C on alias derivation: names only, mechanical aliases, learned aliases.
//
//   node bench/matchlib/ab.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aliasMap, createEntityResolver, createEvidenceIndex, deriveAliases, mechanicalAliases } from '@shobyde/boaz/match';
import { DATA } from '../../src/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const words = (text) => String(text).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const flatten = (value) =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(flatten) : [];

const entities = DATA.projects.map((project) => {
  const name = String(project.title).split(':')[0].trim();
  const text = [
    String(project.summary ?? '').replace(/<[^>]+>/g, ''),
    ...flatten(project.details),
    (project.stack ?? []).join(', '),
  ].join(' ');
  return { name, documents: text.split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter((s) => s.length > 20) };
});

const documents = [];
for (const entity of entities) for (const text of entity.documents) documents.push({ id: `${entity.name}:${documents.length}`, text, subject: entity.name });

const index = createEvidenceIndex(documents);
const derived = deriveAliases(entities.map((entity) => ({ name: entity.name, documents: entity.documents })), {
  minEntityShare: 0.34,
  maxGlobalShare: 0.2,
});
const learned = aliasMap(derived.filter((alias) => alias.kind === 'learned'));
const mechanical = Object.fromEntries(
  entities.map((entity) => [entity.name.toLowerCase(), mechanicalAliases(entity.name)]),
);

/** Arm A: the entity name, exactly as printed. */
const compact = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');

function resolveEntity(question, arm) {
  if (arm === 'A') return entityByName(question, 'A');
  const resolved = resolvers[arm].resolve(question);
  const match = resolved.matches[0];
  if (!match) return entityByName(question, 'A');
  // An alias resolves to the entity it was derived for.
  const byAlias = entities.find((entity) => (mechanical[entity.name.toLowerCase()] ?? []).includes(match.to.toLowerCase()));
  if (arm !== 'B' && byAlias) return byAlias.name;
  const named = entities.find((entity) => entity.name === match.to);
  if (named) return named.name;
  const target = Object.entries(learned).find(([alias]) => alias === match.to.toLowerCase());
  return target ? target[1][0] : match.to;
}

function entityByName(question, arm) {
  const q = words(question).join(' ');
  const flat = compact(question);
  for (const entity of entities) {
    if (q.includes(words(entity.name).join(' ')) || flat.includes(compact(entity.name))) return entity.name;
    if (arm !== 'A') {
      for (const alias of mechanical[entity.name.toLowerCase()] ?? []) {
        if (compact(alias).length >= 4 && flat.includes(compact(alias))) return entity.name;
      }
    }
    if (arm === 'C') {
      for (const [alias, names] of Object.entries(learned)) {
        if (!names.includes(entity.name)) continue;
        if (compact(alias).length >= 5 && flat.includes(compact(alias))) return entity.name;
        if (words(question).includes(alias)) return entity.name;
      }
    }
  }
  return null;
}

const NAME_CASES = [
  { ask: 'what stack does ground glass use?', want: 'Groundglass' },
  { ask: 'tell me about groundglass', want: 'Groundglass' },
  { ask: 'is type script used here?', want: 'Boaz' },
  { ask: 'what is sho byde dot com?', want: 'shobyde.com' },
  { ask: 'how big is read back?', want: 'Readback' },
  { ask: 'what is hob knob?', want: 'Hobnob' },
];

const FEATURE_CASES = [
  { ask: 'which project runs conformance checks?', want: 'Groundglass', token: 'conformance' },
  { ask: 'which project produces speaker labels?', want: 'Hobnob', token: 'speaker' },
  { ask: 'which project is self-hosted reading?', want: 'Readback', token: 'self-hosted' },
  { ask: 'which project ships no model?', want: 'Boaz', token: 'model' },
];

const CONTROLS = [
  { ask: 'does hobnob support klingon?' },
  { ask: 'does readback print braille?' },
];

// Four arms: exact names; boaz's fuzzy resolver; fuzzy plus mechanical aliases;
// fuzzy plus mechanical plus the learned aliases.
const namesOnly = entities.map((entity) => entity.name);
const mechanicalNames = [...namesOnly, ...Object.values(mechanical).flat()];
const learnedNames = [...mechanicalNames, ...Object.keys(learned)];
const resolvers = {
  A: null,
  B: createEntityResolver({ names: namesOnly }),
  C: createEntityResolver({ names: mechanicalNames }),
  D: createEntityResolver({ names: learnedNames }),
};

const score = { A: 0, B: 0, C: 0, D: 0 };
const controlHits = { A: 0, B: 0, C: 0, D: 0 };
const total = NAME_CASES.length + FEATURE_CASES.length;

for (const arm of ['A', 'B', 'C', 'D']) {
  for (const item of NAME_CASES) {
    if (resolveEntity(item.ask, arm) === item.want) score[arm] += 1;
  }
  for (const item of FEATURE_CASES) {
    const entity = resolveEntity(item.ask, arm);
    if (!entity || entity !== item.want) continue;
    const hit = index.find(item.ask, { subject: entity });
    if (hit?.document.text.toLowerCase().includes(item.token)) score[arm] += 1;
  }
  for (const item of CONTROLS) {
    const entity = resolveEntity(item.ask, arm) ?? 'Hobnob';
    if (index.find(item.ask, { subject: entity })) controlHits[arm] += 1;
  }
}

const learnedSample = derived.filter((alias) => alias.kind === 'learned').slice(0, 12);
console.log(`mechanism: ${derived.length} aliases (${derived.filter((a) => a.kind === 'learned').length} learned)`);
console.log(`A exact names        ${score.A}/${total}  controls hit ${controlHits.A}`);
console.log(`B fuzzy resolver     ${score.B}/${total}  controls hit ${controlHits.B}`);
console.log(`C + mechanical alias ${score.C}/${total}  controls hit ${controlHits.C}`);
console.log(`D + learned alias    ${score.D}/${total}  controls hit ${controlHits.D}`);
console.log('\nlearned sample:');
for (const alias of learnedSample) console.log(`  ${alias.alias.padEnd(18)} -> ${alias.entity} (${alias.score})`);

fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', 'ab.json'), JSON.stringify({ total, score, controlHits, derived }, null, 2));
