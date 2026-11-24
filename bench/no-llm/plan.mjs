#!/usr/bin/env node
/**
 * Two-step plans: does one sentence asking for two things become two calls?
 *
 * `run.mjs` scores slot extraction and the other suites score answers. This one
 * scores the plan. Two systems are measured on the same utterances:
 *   engine — what the panel does today: one sentence in, one capability out.
 *   plan   — `planRequest()` from boaz: the sentence is cut at its own
 *            connectives, each clause routed, and a precondition recorded.
 *
 * Three kinds of task, because a planner that splits everything is not better
 * than one that splits nothing:
 *   plan    — two requests joined; both capabilities, in order.
 *   single  — one request, or one request with two objects; the engine's call
 *             must be right and the planner must NOT produce two steps.
 *   ceiling — a request this site cannot serve; the planner must decline rather
 *             than map the unknown half onto a neighbouring capability.
 *
 * Usage: node bench/no-llm/plan.mjs [--suite plan.json] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseModelOutput, planRequest } from 'boaz';
import { createEngine, capabilities } from '../agent-setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');

const suite = JSON.parse(
  await readFile(path.resolve(here, argValue('--suite') ?? 'plan.json'), 'utf8'),
);
const engine = createEngine();

/** One turn: the engine's own decision, read the way the panel reads it. */
async function engineCall(q) {
  const completion = await engine.complete({ messages: [{ role: 'user', content: q }], tools: [] });
  const text = typeof completion.text === 'string' ? completion.text : String(completion.text ?? '');
  const parsed = parseModelOutput(text);
  if (parsed.kind === 'tool') return { id: parsed.capabilityId ?? '', text };
  return { id: '', text };
}

const rows = [];
for (const task of suite.tasks) {
  const call = await engineCall(task.q);
  const plan = planRequest(task.q, { capabilities });
  const ids = plan.steps.map((step) => step.capabilityId);
  const wants = task.steps ?? [];
  const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
  const engineOk = same([call.id], wants);
  const planOk = task.kind === 'plan' ? same(ids, wants) : ids.length === 0;
  const ceilingOk = task.kind === 'ceiling' ? ids.length === 0 || plan.declined === 'unmapped-clause' : null;
  const firstStepOk = wants.length > 0 ? call.id === wants[0] : null;
  rows.push({ task, call, plan, ids, engineOk, planOk, ceilingOk, firstStepOk });
  if (verbose) {
    console.log(`\n${task.kind}: ${task.q}`);
    console.log(`  engine: ${call.id || '(no call)'} ${engineOk ? 'ok' : ''}`);
    console.log(`  plan:   ${ids.join(' -> ') || (plan.declined ?? '(none)')} ${planOk ? 'ok' : ''}`);
    plan.steps.forEach((step) => console.log(`    [${step.verb ?? '-'}] ${step.capabilityId} needs=${step.needs} args=${JSON.stringify(step.args)}`));
  }
}

const group = (kind) => rows.filter((row) => row.task.kind === kind);
const rate = (list, key) => {
  const scored = list.filter((row) => row[key] !== null);
  const passed = scored.filter((row) => row[key]).length;
  return { passed, total: scored.length, pct: scored.length ? (passed / scored.length) * 100 : 0 };
};

const planTasks = group('plan');
const singleTasks = group('single');
const ceilingTasks = group('ceiling');

const engineBoth = rate(planTasks, 'engineOk');
const planBoth = rate(planTasks, 'planOk');
const engineFirst = rate(planTasks, 'firstStepOk');
const engineSingle = rate(singleTasks, 'engineOk');
const planNoFalse = rate(singleTasks, 'planOk');
const ceiling = rate(ceilingTasks, 'ceilingOk');

const fmt = (r) => `${r.passed}/${r.total} (${r.pct.toFixed(1)}%)`;
console.log(`plan suite: ${suite.tasks.length} tasks`);
console.log(`  two-step requests   engine ${fmt(engineBoth)}   plan ${fmt(planBoth)}`);
console.log(`  first step only     engine ${fmt(engineFirst)}`);
console.log(`  one-step controls   engine ${fmt(engineSingle)}   plan declines ${fmt(planNoFalse)}`);
console.log(`  unservable request  plan declines ${fmt(ceiling)}`);
for (const row of ceilingTasks) {
  console.log(`    "${row.task.q}" -> ${row.ids.join(' -> ') || row.plan.declined}${row.plan.failed ? ` (failed: ${row.plan.failed})` : ''}`);
}
for (const row of rows) {
  if (row.task.kind === 'plan' && !row.planOk) {
    console.log(`  miss: "${row.task.q}" wanted ${row.task.steps.join(' -> ')}, got ${row.ids.join(' -> ') || row.plan.declined}`);
  }
}
console.log(`\nscore: engine ${engineBoth.passed}/${planTasks.length} two-step, plan ${planBoth.passed}/${planTasks.length} two-step; controls engine ${engineSingle.passed}/${singleTasks.length}, plan ${planNoFalse.passed}/${singleTasks.length}`);
