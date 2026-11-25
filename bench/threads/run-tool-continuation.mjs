// Tool continuation experiment.
//
// Replays a thread where the previous turn ran a capability. Four strategies:
//
//   stateless    fresh engine every turn, no session
//   pointer      the site's existing session pointer only
//   tool          the new working-memory tool continuation only
//   tool+pointer  tool continuation first, then the existing pointer
//
// The primitive rewrites the previous effective question with the new subject;
// the engine still decides the capability and its arguments. This keeps the
// experiment honest: no subject-to-repo map lives in the library or the runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModelOutput } from '@shobyde/boaz';
import { createEngine, runCapability } from '../agent-setup.mjs';
import { entitiesIn, resolvePointer, SITE_SUBJECTS } from '../../src/agent/sessionMemory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const suiteName = option('suite', 'tool-threads.json');
const suite = JSON.parse(fs.readFileSync(path.join(here, suiteName), 'utf8'));
const strategies = option('strategy', 'stateless,pointer,tool,tool+pointer').split(',');
const localCore = process.env.BOAZ_MEMORY
  ?? new URL('../../../../boaz/packages/boaz/dist/core/index.js', import.meta.url).href;
const { createWorkingMemory } = await import(localCore);
const engineVersion = JSON.parse(
  fs.readFileSync(new URL('../../node_modules/@shobyde/boaz/package.json', import.meta.url), 'utf8'),
).version;
let memoryVersion = engineVersion;
try {
  memoryVersion = JSON.parse(
    fs.readFileSync(new URL('../../../../boaz/packages/boaz/package.json', import.meta.url), 'utf8'),
  ).version;
} catch (error) {
  // A custom BOAZ_MEMORY entry point is enough; the version is only a label.
}

const norm = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');

// The production panel has a host-side direct-tool resolver for GitHub. Mirror
// it here; the new primitive only rewrites the question, this resolver maps the
// rewritten words to the capability arguments.
function resolveGithub(question) {
  const text = String(question ?? '');
  if (!/\b(github|commits?|releases?|stars?|forks?|repos?)\b/i.test(text)) return null;
  let repo = 'all';
  if (/\bboaz\b/i.test(text)) repo = 'boaz';
  else if (/hobnob/i.test(text)) repo = 'hobnob';
  else if (/readback/i.test(text)) repo = 'readback';
  else if (/groundglass/i.test(text)) repo = 'groundglass';
  else if (/shobyde|resume-site|this site/i.test(text)) repo = 'shobyde';
  else if (!/\b(all|compare|projects|repos)\b/i.test(text)) repo = 'boaz';
  return { id: 'github.activity', args: { repo } };
}

async function turn(engine, ask) {
  const direct = resolveGithub(ask);
  if (direct) {
    const result = await runCapability(direct.id, direct.args);
    return { text: result.answer || '', calls: [direct], plannedBy: null, steps: [] };
  }
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
    const callArgs = parsed.args ?? {};
    calls.push({ id, args: callArgs });
    const result = await runCapability(id, callArgs);
    observations = { ...(observations ?? {}), [id]: result };
  }
  return { text, calls, plannedBy, steps };
}

const DECLINE = /(not sure about that|can only help with the screens|no project on this page|i can help with:)/i;

function check(turnResult, spec) {
  const text = norm(turnResult.text);
  const declined = DECLINE.test(text);
  const expect = spec.expect ?? {};
  const missing = (expect.include ?? []).filter((word) => !text.includes(norm(word)));
  const leaked = (expect.exclude ?? []).filter((word) => text.includes(norm(word)));
  const toolOk = !expect.tool || (turnResult.calls ?? []).some((call) => call.id === expect.tool);
  const argsOk = !expect.args || (turnResult.calls ?? []).some((call) => {
    if (call.id !== expect.tool) return false;
    return Object.entries(expect.args).every(([key, value]) => String(call.args?.[key] ?? '') === String(value));
  });
  return {
    pass: !declined && missing.length === 0 && leaked.length === 0 && toolOk && argsOk,
    declined,
    missing,
    leaked,
    toolOk,
    argsOk,
  };
}

const results = {};
for (const strategy of strategies) {
  const threads = [];
  for (const thread of suite.threads) {
    const engine = strategy === 'stateless' ? null : createEngine();
    const memory = strategy === 'stateless' ? null : createWorkingMemory({ subjects: SITE_SUBJECTS });
    const turns = [];
    for (const spec of thread.turns) {
      let effective = spec.ask;
      let follow = null;
      let pointer = null;
      if (memory) {
        if (strategy === 'tool' || strategy === 'tool+pointer') {
          follow = memory.followUpTool(spec.ask);
          if (follow) effective = follow.query;
        }
        if (!follow && (strategy === 'pointer' || strategy === 'tool+pointer')) {
          pointer = resolvePointer(memory, spec.ask);
          effective = pointer.query;
        }
      }
      const active = strategy === 'stateless' ? createEngine() : engine;
      const result = await turn(active, effective);
      if (memory) {
        const call = result.calls[0] ?? null;
        memory.observe(spec.ask, {
          capabilityId: call?.id ?? null,
          query: effective,
          args: call?.args ?? null,
          entities: entitiesIn(result.text),
        });
      }
      const verdict = check(result, spec);
      turns.push({
        ask: spec.ask,
        routed: effective,
        follow,
        pointer,
        kind: spec.kind,
        expect: spec.expect ?? {},
        text: result.text.trim(),
        calls: result.calls,
        plannedBy: result.plannedBy ?? null,
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
  results[strategy] = threads;
  const all = threads.flatMap((thread) => thread.turns);
  const rate = `${all.filter((t) => t.pass).length}/${all.length}`;
  const context = all.filter((t) => t.kind === 'context');
  console.log(`${strategy.padEnd(12)} ${rate}   context ${context.filter((t) => t.pass).length}/${context.length}`);
  fs.writeFileSync(path.join(here, 'results', `tool-${strategy.replace('+', '-')}.json`), JSON.stringify({
    generated: new Date().toISOString(),
    strategy,
    engine: engineVersion,
    memory: memoryVersion,
    threads,
  }, null, 2));
}
console.log(`\nsuite ${suiteName} · engine ${engineVersion} · memory ${memoryVersion}`);
console.log(`wrote results/tool-*.json`);
