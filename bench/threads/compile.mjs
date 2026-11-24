// Builds the benchmark page's data from the runs, the judge and the ledger.
//
//   node bench/threads/compile.mjs
//
// Nothing here invents a number: thread counts come from the two run files,
// judge scores from judged-memory.json, and the rung ladder from history.json,
// which was copied out of the loop ledger.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(here, 'results', name), 'utf8'));

const memory = read('threads-memory.json');
const stateless = read('threads-stateless.json');
const judged = fs.existsSync(path.join(here, 'results', 'judged-memory.json')) ? read('judged-memory.json') : null;
const judgedStateless = fs.existsSync(path.join(here, 'results', 'judged-stateless.json')) ? read('judged-stateless.json') : null;
const history = JSON.parse(fs.readFileSync(path.join(here, 'history.json'), 'utf8'));

const all = (run) => run.threads.flatMap((thread) => thread.turns);
const byKind = (run) => {
  const turns = all(run);
  const kinds = {};
  for (const kind of ['knowledge', 'context', 'tool']) {
    const subset = turns.filter((turn) => turn.kind === kind);
    kinds[kind] = { passed: subset.filter((turn) => turn.pass).length, total: subset.length };
  }
  return { passed: turns.filter((turn) => turn.pass).length, total: turns.length, kinds };
};

const threads = memory.threads.map((thread) => {
  const twin = stateless.threads.find((candidate) => candidate.id === thread.id);
  return {
    id: thread.id,
    title: thread.title,
    turns: thread.turns.map((turn, index) => ({
      ask: turn.ask,
      kind: turn.kind,
      pass: turn.pass,
      baseline: twin?.turns[index]?.pass ?? false,
      rewritten: turn.rewritten ?? false,
      routed: turn.routed ?? turn.ask,
      text: turn.text,
      baselineText: twin?.turns[index]?.text ?? '',
      calls: turn.calls.map((call) => call.id),
      flesch: turn.flesch,
      missing: turn.missing,
    })),
  };
});

const dims = ['knowledge', 'language', 'context', 'planning', 'tools'];
const ladder = history.rungs.map((rung) => ({ ...rung }));
const dimension = dims.map((id) => {
  const rows = ladder.filter((rung) => rung.dimension === id);
  const mean = (key) => Math.round((rows.reduce((sum, rung) => sum + rung[key], 0) / rows.length) * 10) / 10;
  return {
    id,
    suites: rows.length,
    before: mean('before'),
    after: mean('after'),
    at90: rows.filter((rung) => rung.after >= 90).length,
  };
});

// A thread is "carried by memory" when it passes now and the same turn failed
// with a fresh engine. Those are the examples worth quoting.
const carried = threads
  .flatMap((thread) =>
    thread.turns
      .map((turn, index) => ({ thread, turn, index }))
      .filter(({ turn }) => turn.pass && !turn.baseline && turn.kind === 'context'),
  )
  .slice(0, 4)
  .map(({ thread, turn, index }) => ({
    thread: thread.title,
    ask: turn.ask,
    routed: turn.routed,
    before: thread.turns[index].baselineText,
    after: turn.text,
  }));

const summarize = (run) =>
  run
    ? {
        judged: run.judged,
        model: run.model,
        turns: run.turns.length,
        answered: run.turns.filter((turn) => turn.answered).length,
        readability: Math.round((run.turns.reduce((sum, t) => sum + t.readability, 0) / run.turns.length) * 10) / 10,
      }
    : null;

const judge = judged
  ? {
      model: judged.model,
      judged: judged.judged,
      turns: judged.turns.length,
      answered: judged.turns.filter((turn) => turn.answered).length,
      grounded: Math.round((judged.turns.reduce((sum, t) => sum + t.grounded, 0) / (2 * judged.turns.length)) * 100),
      readability: Math.round((judged.turns.reduce((sum, t) => sum + t.readability, 0) / judged.turns.length) * 10) / 10,
      tools: (() => {
        const needed = judged.turns.filter((turn) => turn.tool_ok !== -1);
        return { ok: needed.filter((turn) => turn.tool_ok === 1).length, total: needed.length };
      })(),
      stateless: summarize(judgedStateless),
      examples: judged.turns
        .filter((turn) => turn.why && turn.why !== 'judge failed')
        .filter((turn) => !turn.answered || turn.answered)
        .slice(0, 4)
        .map((turn) => ({ ask: turn.ask, answered: turn.answered, readability: turn.readability, why: turn.why })),
    }
  : null;

const data = {
  generated: new Date().toISOString(),
  library: memory.library,
  threads: {
    memory: byKind(memory),
    stateless: byKind(stateless),
    threads,
    carried,
  },
  judge,
  dimension,
  ladder,
  releases: history.releases,
};

const target = path.join(here, '..', '..', 'labs', 'benchmarks', 'data.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(data, null, 2));

console.log(`threads   ${data.threads.memory.passed}/${data.threads.memory.total} vs ${data.threads.stateless.passed}/${data.threads.stateless.total} stateless`);
console.log(`judge     ${judge ? `${judge.answered}/${judge.turns} answered, ${judge.readability}/5 readable` : 'not run'}`);
console.log(`ladder    ${ladder.length} suites, ${dimension.map((d) => `${d.id} ${d.before}->${d.after}`).join(', ')}`);
console.log(`wrote labs/benchmarks/data.json`);
