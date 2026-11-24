#!/usr/bin/env node
/**
 * Failure recovery: a capability throws or returns nothing. Does the plan finish
 * by trying the runner-up the planner already ranked, and does the report say
 * which one it tried?
 *
 * Two systems on the same utterances, same host, same faults:
 *   shipped — `executePlan` with recovery off: that is the code the panel ran
 *             before this rung. The call throws, the plan ends, later steps never
 *             run, and the visitor gets one failure sentence.
 *   recover — recovery on, and the host supplies `runAlternate`, which is the
 *             panel's own direct-dispatch path (`runtime.runCapability`).
 *
 * The host here is a recorder: it records the capability ids it was asked to run
 * and throws or returns an empty value where the task says to. Usage:
 *   node bench/no-llm/recover.mjs [--suite recover.json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { executePlan, parseModelOutput, planRequest } from '@shobyde/boaz/core';
import { createEngine, capabilities } from '../agent-setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');

const suite = JSON.parse(
  await readFile(path.resolve(here, argValue('--suite') ?? 'recover.json'), 'utf8'),
);
const engine = createEngine();
const byId = new Map(capabilities.map((c) => [c.id, c]));

function recorder(faults) {
  const effects = [];
  let route = '/';
  const run = (step) => {
    const fault = faults[step.capabilityId];
    if (fault === 'throw') throw new Error('handler threw');
    if (fault === 'empty') return undefined;
    if (fault === 'empty-string') return '';
    effects.push(step.capabilityId);
    const capability = byId.get(step.capabilityId);
    if (capability?.kind === 'route') route = capability.route ?? '/';
    return { ran: step.capabilityId };
  };
  return {
    effects,
    host: {
      currentRoute: () => route,
      run,
      runAlternate: run,
    },
  };
}

/** The single call the panel makes when the sentence is not a plan. */
async function singleCall(q) {
  const completion = await engine.complete({ messages: [{ role: 'user', content: q }], tools: [] });
  const text = typeof completion.text === 'string' ? completion.text : String(completion.text ?? '');
  const parsed = parseModelOutput(text);
  return parsed.kind === 'tool' ? parsed.capabilityId ?? '' : '';
}

const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

async function runTask(task, recover) {
  const plan = planRequest(task.q, { capabilities });
  const rec = recorder(task.faults ?? {});
  const execution = plan.steps.length > 1
    ? await executePlan(plan, { ...rec.host, recover })
    : { steps: [], summary: '', ok: true };
  if (plan.steps.length <= 1) {
    const id = await singleCall(task.q);
    if (id) rec.effects.push(id);
  }
  const effectsOk = same(rec.effects, task.effects);
  const lower = execution.summary.toLowerCase();
  const reported = task.kind === 'recover'
    ? lower.includes('i tried')
    : task.kind === 'unrecoverable'
      ? lower.includes('failed') && rec.effects.length === 0
      : true;
  const noFalseRecovery = task.kind === 'control' ? !lower.includes('i tried') : true;
  return {
    effectsOk,
    reported,
    noFalseRecovery,
    ok: effectsOk && reported && noFalseRecovery,
    effects: rec.effects,
    execution,
  };
}

const rows = [];
for (const task of suite.tasks) {
  const before = await runTask(task, false);
  const after = await runTask(task, true);
  rows.push({ task, before, after });
  if (verbose) {
    console.log(`\n${task.kind}: ${task.q}`);
    console.log(`  faults: ${JSON.stringify(task.faults)}`);
    console.log(`  wanted: ${task.effects.join(' -> ') || '(none)'}`);
    console.log(`  shipped: ${before.effects.join(' -> ') || '(none)'} | ${before.execution.summary || '(silent)'}`);
    console.log(`  recover: ${after.effects.join(' -> ') || '(none)'} | ${after.execution.summary || '(silent)'}`);
  }
}

const group = (kind) => rows.filter((row) => row.task.kind === kind);
const rate = (list, side) => {
  const passed = list.filter((row) => row[side].ok).length;
  return `${passed}/${list.length} (${list.length ? ((passed / list.length) * 100).toFixed(1) : '0.0'}%)`;
};

const recoverable = group('recover');
const controls = group('control');
const unrecoverable = group('unrecoverable');
const boundaries = group('boundary');
const all = (side) => rows.filter((row) => row[side].ok).length;

console.log(`recover suite: ${suite.tasks.length} tasks`);
console.log(`  fault, runner-up must run   shipped ${rate(recoverable, 'before')}   recover ${rate(recoverable, 'after')}`);
console.log(`  no-fault controls           shipped ${rate(controls, 'before')}   recover ${rate(controls, 'after')}`);
console.log(`  every candidate fails       shipped ${rate(unrecoverable, 'before')}   recover ${rate(unrecoverable, 'after')}`);
console.log(`  boundaries (stay failing)    shipped ${rate(boundaries, 'before')}   recover ${rate(boundaries, 'after')}`);
for (const row of rows) {
  if (!row.after.ok) {
    console.log(`  miss: "${row.task.q}" ${JSON.stringify(row.task.faults)} -> ${row.after.effects.join(' -> ') || '(none)'} | ${row.after.execution.summary || '(no report)'}`);
  }
}
console.log(`\nscore: shipped ${all('before')}/${rows.length} (${((all('before') / rows.length) * 100).toFixed(1)}%) -> recover ${all('after')}/${rows.length} (${((all('after') / rows.length) * 100).toFixed(1)}%)`);

// Reference for the ledger: how many tasks have a runner-up at all.
const planned = suite.tasks.filter((task) => {
  const plan = planRequest(task.q, { capabilities });
  return plan.steps.some((step) => (step.alternates ?? []).length > 0);
});
console.log(`planner offers at least one runner-up on ${planned.length}/${suite.tasks.length} tasks`);
