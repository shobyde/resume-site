// Compiles the handbook arena into the page's data file.
//   node bench/kb/compile.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(here, 'results', name), 'utf8'));
const exists = (name) => fs.existsSync(path.join(here, 'results', name));

const kb = JSON.parse(fs.readFileSync(path.join(here, 'kb.json'), 'utf8'));
const suite = JSON.parse(fs.readFileSync(path.join(here, 'threads.json'), 'utf8'));
const heldout = JSON.parse(fs.readFileSync(path.join(here, 'heldout.json'), 'utf8'));
const heldout2 = JSON.parse(fs.readFileSync(path.join(here, 'heldout2.json'), 'utf8'));
const heldout3 = JSON.parse(fs.readFileSync(path.join(here, 'heldout3.json'), 'utf8'));

const systems = ['templates', 'bm25', 'rules', 'rules-memory', 'hybrid'];
const labels = {
  templates: 'Phrase table',
  bm25: 'BM25 retrieval',
  rules: 'Rules',
  'rules-memory': 'Rules + session',
  hybrid: 'Rules + session + retrieval',
};
const blurb = {
  templates: 'A regex per question shape, a flat lookup, no reasoning over facts.',
  bm25: 'Retrieve the best fact sentence and quote it. No rules, no memory.',
  rules: 'Join the question to the fact table by entity and attribute.',
  'rules-memory': 'Rules plus a session that carries the subject, the list and the last action.',
  hybrid: 'Rules + session, with retrieval as the fallback when the rules decline.',
};

const aggregate = (run) => ({
  passed: run.passed,
  total: run.total,
  byKind: run.byKind,
});

const arena = systems.map((id) => {
  const fitted = read(`kb-${id}.json`);
  const dev = exists(`kb-${id}-heldout.json`) ? read(`kb-${id}-heldout.json`) : null;
  const fresh = exists(`kb-${id}-heldout2.json`) ? read(`kb-${id}-heldout2.json`) : null;
  const fresh2 = exists(`kb-${id}-heldout3.json`) ? read(`kb-${id}-heldout3.json`) : null;
  return {
    id,
    label: labels[id],
    blurb: blurb[id],
    fitted: aggregate(fitted),
    dev: dev ? aggregate(dev) : null,
    fresh: fresh ? aggregate(fresh) : null,
    fresh2: fresh2 ? aggregate(fresh2) : null,
    // The first run of the paraphrase set, recorded before the vocabulary pass:
    // 15/23 for the hybrid. Kept so the page can show both sides of iteration.
    devFirst: id === 'hybrid' ? 15 : null,
  };
});

// One honest example of the gap: a question the rules could not place.
const freshMiss = (() => {
  const run = read('kb-hybrid-heldout3.json');
  const miss = run.turns.find((turn) => !turn.pass && turn.kind === 'knowledge');
  return miss ? { ask: miss.ask, text: miss.text } : null;
})();

const judgedFile = 'judged-kb-hybrid-heldout3.json';
const judged = exists(judgedFile) ? read(judgedFile) : null;
const judgedBaseline = exists('judged-kb-templates-heldout3.json') ? read('judged-kb-templates-heldout3.json') : null;

const data = {
  generated: new Date().toISOString(),
  facts: kb.facts.length,
  documents: kb.docs.length,
  threads: suite.threads.length,
  turns: suite.threads.flatMap((thread) => thread.turns).length,
  heldoutTurns: heldout.threads.flatMap((thread) => thread.turns).length,
  freshTurns: heldout2.threads.flatMap((thread) => thread.turns).length,
  fresh2Turns: heldout3.threads.flatMap((thread) => thread.turns).length,
  systems: arena,
  freshMiss,
  judge: judged
    ? {
        model: judged.model,
        system: judged.system,
        turns: judged.turns.length,
        answered: judged.turns.filter((turn) => turn.answered).length,
        readability:
          Math.round((judged.turns.reduce((sum, turn) => sum + turn.readability, 0) / judged.turns.length) * 10) / 10,
        baseline: judgedBaseline
          ? {
              system: judgedBaseline.system,
              answered: judgedBaseline.turns.filter((turn) => turn.answered).length,
              turns: judgedBaseline.turns.length,
              readability:
                Math.round((judgedBaseline.turns.reduce((sum, turn) => sum + turn.readability, 0) / judgedBaseline.turns.length) * 10) / 10,
            }
          : null,
        examples: judged.turns
          .filter((turn) => turn.why && turn.why !== 'judge failed')
          .slice(0, 3)
          .map((turn) => ({ ask: turn.ask, answered: turn.answered, readability: turn.readability, why: turn.why })),
      }
    : null,
};

const target = path.join(here, '..', '..', 'labs', 'benchmarks', 'data.json');
const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
existing.kb = data;
fs.writeFileSync(target, JSON.stringify(existing, null, 2));

console.log(`arena: ${data.systems.map((s) => `${s.id} ${s.fitted.passed}/${s.fitted.total} fitted, ${s.fresh?.passed ?? '-'}/${s.fresh?.total ?? '-'} fresh`).join(' | ')}`);
console.log(`judge: ${data.judge ? `${data.judge.answered}/${data.judge.turns} answered` : 'pending'}`);
