// Thread runner: replays a conversation against the site's real engine.
//
//   node bench/threads/run.mjs            -> results/threads-memory.json
//   node bench/threads/run.mjs --baseline -> results/threads-stateless.json
//
// Memory mode keeps one engine for the whole thread (what the panel does).
// Baseline mode builds a fresh engine per turn and passes only that turn, so
// the same assistant has no referent to resolve: that is the control.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModelOutput } from '@shobyde/boaz';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { createSessionMemory, entitiesIn, exclusionAnswer, rememberSetAnswer, resolvePointer } from '../../src/agent/sessionMemory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = process.argv.includes('--baseline');
const suite = JSON.parse(fs.readFileSync(path.join(here, 'threads.json'), 'utf8'));
const version = JSON.parse(
  fs.readFileSync(new URL('../../node_modules/@shobyde/boaz/package.json', import.meta.url), 'utf8'),
).version;

const norm = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');

async function turn(engine, ask) {
  // The panel sends one user message and lets the engine's memory carry context;
  // this loop does the same, and plays the UI's part when a tool is called.
  const messages = [{ role: 'user', content: ask }];
  let observations;
  let text = '';
  const calls = [];
  const steps = [];
  let plannedBy;
  for (let step = 0; step < 3; step += 1) {
    const completion = await engine.complete({
      messages,
      tools: [],
      ...(observations ? { observations } : {}),
    });
    steps.push(...(completion.steps ?? []));
    text = typeof completion.text === 'string' ? completion.text : String(completion.text ?? '');
    if (engine.memory?.planned?.ruleId) plannedBy = engine.memory.planned.ruleId;
    const parsed = parseModelOutput(text);
    if (parsed.kind !== 'tool') break;
    const id = parsed.capabilityId ?? '';
    const args = parsed.args ?? {};
    calls.push({ id, args });
    const result = await runCapability(id, args);
    observations = { ...(observations ?? {}), [id]: result };
  }
  return { text, calls, plannedBy, steps };
}

const DECLINE = /(not sure about that|can only help with the screens|no project on this page|i can help with:)/i;

function check(t, kind) {
  const text = norm(t.text);
  // A refusal is not a pass. Single-turn suites score routing and miss this:
  // the right capability can answer "I'm not sure" and still look correct.
  const declined = DECLINE.test(text);
  const exp = t.expect ?? {};
  const missing = (exp.include ?? []).filter((word) => !text.includes(norm(word)));
  const present = (exp.exclude ?? []).filter((word) => text.includes(norm(word)));
  const toolOk = !exp.tool || (t.calls ?? []).some((call) => call.id === exp.tool);
  const argsOk = !exp.args || (t.calls ?? []).some((call) => {
    if (call.id !== exp.tool) return false;
    return Object.entries(exp.args).every(([key, value]) => String(call.args?.[key] ?? '') === String(value));
  });
  const pass = !declined && missing.length === 0 && present.length === 0 && toolOk && argsOk;
  return { pass, declined, missing, leaked: present, toolOk, argsOk };
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function flesch(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  const sentences = Math.max(1, (clean.match(/[.!?]+/g) ?? []).length);
  const words = clean.split(' ').filter(Boolean);
  if (!words.length) return 0;
  const syl = words.reduce((sum, word) => sum + syllables(word), 0);
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
}

const threads = [];
for (const thread of suite.threads) {
  const engine = baseline ? null : createEngine();
  const session = baseline ? null : createSessionMemory();
  const turns = [];
  for (const spec of thread.turns) {
    // Baseline: a fresh engine every turn, so there is no session to point back
    // into and no rewrite. That is the control, not a weaker implementation.
    const active = baseline ? createEngine() : engine;
    const pointer = session ? resolvePointer(session, spec.ask) : { query: spec.ask, rewritten: false };
    // The panel answers "why not both?" from the split the last set answer
    // kept, without routing: mirror that here or the harness grades a panel
    // that does not exist.
    const exclusion = session ? exclusionAnswer(session, spec.ask) : null;
    const result = exclusion
      ? { text: exclusion.text, calls: [], plannedBy: null, steps: [] }
      : await turn(active, pointer.query);
    if (session) {
      rememberSetAnswer(session, result.steps, pointer.query);
      session.observe(spec.ask, { entities: entitiesIn(result.text) });
    }
    const verdict = check({ ...spec, ...result }, spec.kind);
    turns.push({
      ask: spec.ask,
      routed: pointer.query,
      rewritten: Boolean(pointer.rewritten),
      kind: spec.kind,
      expect: spec.expect ?? {},
      text: result.text.trim(),
      calls: result.calls,
      plannedBy: result.plannedBy ?? null,
      flesch: Math.round(flesch(result.text)),
      pass: verdict.pass,
      declined: verdict.declined,
      missing: verdict.missing,
      leaked: verdict.leaked,
      toolOk: verdict.toolOk,
      argsOk: verdict.argsOk,
    });
  }
  threads.push({ id: thread.id, title: thread.title, turns });
}

const out = {
  generated: new Date().toISOString(),
  mode: baseline ? 'stateless' : 'memory',
  library: version,
  threads,
};
const file = path.join(here, 'results', `threads-${baseline ? 'stateless' : 'memory'}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 2));

const all = threads.flatMap((thread) => thread.turns);
const by = (kind) => {
  const subset = all.filter((t) => t.kind === kind);
  return subset.length ? `${subset.filter((t) => t.pass).length}/${subset.length}` : '-';
};
console.log(`${out.mode} · boaz ${version}`);
console.log(`  turns   ${all.filter((t) => t.pass).length}/${all.length}`);
console.log(`  knowledge ${by('knowledge')}   context ${by('context')}   tool ${by('tool')}`);
console.log(`  wrote ${path.relative(process.cwd(), file)}`);
