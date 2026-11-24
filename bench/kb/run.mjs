// Runs the handbook suite against five approaches and scores each turn.
//   node bench/kb/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEMS } from './systems.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(fs.readFileSync(path.join(here, 'kb.json'), 'utf8'));
const heldout2 = process.argv.includes('--heldout2');
const heldout = process.argv.includes('--heldout') || heldout2;
const suite = JSON.parse(fs.readFileSync(path.join(here, heldout2 ? 'heldout2.json' : heldout ? 'heldout.json' : 'threads.json'), 'utf8'));

const DECLINE = /(not sure|nothing on the page|i can't help|i can only)/i;
const norm = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

async function runTool(call) {
  // The handbook has no real side effects. Each tool returns the shape its
  // answer rule would read, so a planning turn can finish.
  switch (call.id) {
    case 'page_oncall': return { paged: call.args.team ?? null };
    case 'create_ticket': return { ticket: `OPS-${100 + Math.floor(Math.random() * 800)}`, title: call.args.title ?? null };
    case 'deploy': return { deployed: call.args.service ?? null, status: 'started' };
    case 'rollback': return { rolledBack: call.args.service ?? null, status: 'started' };
    case 'schedule_review': return { scheduled: call.args.product ?? null };
    default: return { note: 'unknown tool' };
  }
}

function check(turn, answer) {
  const text = norm(answer.text);
  const exp = turn.expect ?? {};
  const missing = (exp.include ?? []).filter((token) => !text.includes(norm(token)));
  const leaked = (exp.exclude ?? []).filter((token) => text.includes(norm(token)));
  const toolOk = !exp.tool || answer.calls.some((call) => call.id === exp.tool);
  const declined = DECLINE.test(text);
  // A turn can ask for a refusal: "who reports to Maya" has no answer, and
  // declining is the correct behaviour rather than a miss.
  const wantsDecline = exp.decline === true;
  const pass = wantsDecline
    ? declined
    : !declined && missing.length === 0 && leaked.length === 0 && toolOk;
  return { pass, missing, leaked, toolOk, declined, wantsDecline };
}

const results = [];
for (const [name, create] of SYSTEMS) {
  const rows = [];
  for (const thread of suite.threads) {
    const system = create(kb);
    for (const turn of thread.turns) {
      const answer = system.ask(turn.ask);
      const calls = [];
      for (const call of answer.tools ?? []) {
        calls.push(call);
        await runTool(call);
      }
      const verdict = check(turn, { ...answer, calls });
      rows.push({ thread: thread.id, ask: turn.ask, kind: turn.kind, text: answer.text, calls: calls.map((c) => c.id), ...verdict });
    }
  }
  const byKind = {};
  for (const kind of ['knowledge', 'context', 'tool', 'planning', 'readability']) {
    const subset = rows.filter((row) => row.kind === kind);
    byKind[kind] = { passed: subset.filter((row) => row.pass).length, total: subset.length };
  }
  results.push({ system: name, passed: rows.filter((row) => row.pass).length, total: rows.length, byKind, turns: rows });
}

fs.mkdirSync(path.join(here, 'results'), { recursive: true });
for (const result of results) {
  fs.writeFileSync(
    path.join(here, 'results', `kb-${result.system.replace('+', '-')}${heldout2 ? '-heldout2' : heldout ? '-heldout' : ''}.json`),
    JSON.stringify(result, null, 2),
  );
}

const header = ['system', ...['knowledge', 'context', 'tool', 'planning', 'readability'], 'all'].map((h) => h.padEnd(13)).join('');
console.log(header);
for (const result of results) {
  const cells = [result.system.padEnd(13)];
  for (const kind of ['knowledge', 'context', 'tool', 'planning', 'readability']) {
    const { passed, total } = result.byKind[kind];
    cells.push(`${passed}/${total}`.padEnd(13));
  }
  cells.push(`${result.passed}/${result.total}`);
  console.log(cells.join(''));
}
console.log(`\n${suite.threads.length} threads, ${results[0].total} turns, ${kb.facts.length} facts${heldout2 ? ' (held out, second set)' : heldout ? ' (held out)' : ''}`);
