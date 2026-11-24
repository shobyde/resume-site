#!/usr/bin/env node
/**
 * Plan execution: does a two-request sentence produce two effects, and does the
 * system say what it did?
 *
 * `plan.mjs` scores the plan text. This scores the effects. The host here is a
 * recorder, not a browser: it records the capability ids it was asked to run in
 * order, moves its own route on a route capability, and throws when told to.
 * That is the same `executePlan` the panel calls, so a pass means the shipped
 * path would have run both steps.
 *
 * Two systems on the same utterances:
 *   engine — the panel before this rung: one completion, one capability, one effect.
 *   plan   — planRequest() + executePlan(): every stated request runs, in order,
 *            unstated arguments are refused by name, and the report says both.
 *
 * Usage: node bench/no-llm/execute.mjs [--suite execute.json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { executePlan, parseModelOutput, planRequest } from '@shobyde/boaz';
import { createEngine, capabilities } from '../agent-setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');

const suite = JSON.parse(
  await readFile(path.resolve(here, argValue('--suite') ?? 'execute.json'), 'utf8'),
);
const engine = createEngine();
const byId = new Map(capabilities.map((c) => [c.id, c]));

/** The engine's own one-call decision, read the way the panel reads it. */
async function engineCall(q) {
  const completion = await engine.complete({ messages: [{ role: 'user', content: q }], tools: [] });
  const text = typeof completion.text === 'string' ? completion.text : String(completion.text ?? '');
  const parsed = parseModelOutput(text);
  return parsed.kind === 'tool' ? parsed.capabilityId ?? '' : '';
}

/** A host that records effects and moves its route like the page does. */
function recorder(q, throwOn) {
  const effects = [];
  let route = '/';
  return {
    effects,
    host: {
      currentRoute: () => route,
      run: async (step) => {
        if (step.capabilityId === throwOn) throw new Error('handler threw');
        effects.push(step.capabilityId);
        const capability = byId.get(step.capabilityId);
        if (capability?.kind === 'route') route = capability.route ?? '/';
        return { ran: step.capabilityId, asked: q };
      },
    },
  };
}

const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

const rows = [];
for (const task of suite.tasks) {
  const call = await engineCall(task.q);
  const plan = planRequest(task.q, { capabilities });
  const rec = recorder(task.q);
  // The shipping path: a plan with more than one request executes; anything else
  // is the single call the panel has always made.
  const execution = plan.steps.length > 1
    ? await executePlan(plan, rec.host)
    : { steps: [], summary: '', ok: true };
  if (plan.steps.length <= 1 && call) rec.effects.push(call);
  const effects = rec.effects;
  const effectsOk = same(effects, task.effects);
  const planRuns = task.kind === 'single' ? plan.steps.length === 0 && effectsOk && execution.summary === '' : effectsOk;
  const reports = task.kind === 'plan'
    ? execution.steps
      .filter((step) => step.status === 'ran')
      .every((step) => execution.summary.toLowerCase().includes(step.title.toLowerCase().split(' ').slice(-1)[0]))
      || execution.summary.toLowerCase().includes('two things')
    : task.kind === 'refusal'
      ? typeof task.refused === 'string' && execution.summary.toLowerCase().includes(task.refused)
      : true;
  // The engine makes one call, so on a two-request sentence it can only produce
  // the first effect; that is the number the plan has to beat.
  const engineOk = same(call ? [call] : [], task.effects);
  const engineFirst = task.kind === 'plan' ? call === task.effects[0] : null;
  const planOk = planRuns && reports;
  rows.push({ task, call, plan, execution, effects, effectsOk, reports, engineOk, engineFirst, planOk });
  if (verbose) {
    console.log(`\n${task.kind}: ${task.q}`);
    console.log(`  engine: ${call || '(no call)'} -> ${engineOk ? 'ok' : 'miss'}`);
    console.log(`  effects: ${effects.join(' -> ') || '(none)'} ${effectsOk ? 'ok' : `wanted ${task.effects.join(' -> ')}`}`);
    execution.steps.forEach((step) => console.log(`    ${step.status.padEnd(7)} ${step.capabilityId}${step.reason ? ` (${step.reason})` : ''}`));
    console.log(`  report: ${execution.summary || '(empty)'} ${reports ? 'ok' : 'miss'}`);
  }
}

const group = (kind) => rows.filter((row) => row.task.kind === kind);
const rate = (list, key) => {
  const passed = list.filter((row) => row[key]).length;
  return { passed, total: list.length, pct: list.length ? (passed / list.length) * 100 : 0 };
};
const fmt = (r) => `${r.passed}/${r.total} (${r.pct.toFixed(1)}%)`;

const plans = group('plan');
const singles = group('single');
const refusals = group('refusal');

const enginePlan = rate(plans, 'engineOk');
const engineFirst = rate(plans, 'engineFirst');
const planPlan = rate(plans, 'planOk');
const engineSingle = rate(singles, 'engineOk');
const planSingle = rate(singles, 'planOk');
const planRefusal = rate(refusals, 'planOk');

console.log(`execute suite: ${suite.tasks.length} tasks`);
console.log(`  two-request effects  engine ${fmt(enginePlan)}   plan+execute ${fmt(planPlan)}`);
console.log(`  first effect only    engine ${fmt(engineFirst)}`);
console.log(`  one-request controls engine ${fmt(engineSingle)}   plan+execute ${fmt(planSingle)}`);
console.log(`  refusal by name      plan+execute ${fmt(planRefusal)}`);
for (const row of refusals) console.log(`    "${row.task.q}" -> ${row.effects.join(' -> ')} | ${row.execution.summary}`);
for (const row of rows) {
  if (!row.planOk) {
    console.log(`  miss: "${row.task.q}" effects ${row.effects.join(' -> ') || '(none)'} | ${row.execution.summary || '(no report)'}`);
  }
}
const totalEngine = enginePlan.passed + engineSingle.passed;
const totalPlan = planPlan.passed + planSingle.passed + planRefusal.passed;
const measurable = plans.length + singles.length + refusals.length;
console.log(`\nscore: engine ${totalEngine}/${measurable} (${((totalEngine / measurable) * 100).toFixed(1)}%) -> plan+execute ${totalPlan}/${measurable} (${((totalPlan / measurable) * 100).toFixed(1)}%)`);
