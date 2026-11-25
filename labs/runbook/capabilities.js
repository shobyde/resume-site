/* ============================================================
   Runbook · what the assistant may do.

   `runbook.diagnose` is the orchestration: it asks the skill runner to
   walk the declared checks through `runbook.check`, which is a real
   capability with a schema, so each step passes the same validation a
   typed call would. The skill's stop condition is what turns thin
   evidence into an honest answer instead of a guess.
   ============================================================ */

import { defineCapability, defineKnowledge, runSkill } from '@shobyde/boaz/core';
import { CHECKS, FIXES, checksFor, outcomeFor } from './data.js';
import { skillForSymptom } from './skills.js';
import {
  appliedMessages,
  findingsMessages,
  intakeMessages,
  patchCheck,
  recapMessages,
  stopMessages,
} from './surfaces.js';

export const state = { symptom: null, run: null, applied: [], results: {} };

const SYMPTOM_IDS = ['build-fails', 'tests-flaky', 'site-500s', 'deploy-slow'];
const FIX_IDS = Object.keys(FIXES);

const statusWord = (status) => (status === 'pass' ? 'clean' : status === 'warn' ? 'warning' : 'fail');

/**
 * @param {{ getRuntime?: () => any, call?: (id: string, args: object) => Promise<any> }} deps
 */
export function createCapabilities({ getRuntime, call } = {}) {
  const invoke = async (id, args) => {
    if (call) return call(id, args);
    const runtime = getRuntime?.();
    if (!runtime) throw new Error('the runbook runtime is not mounted yet');
    return runtime.runCapability(id, args);
  };

  const intake = defineCapability({
    id: 'runbook.intake',
    kind: 'query',
    title: 'Open a symptom',
    description: 'Takes one symptom and lays out the checks the skill will run against it, before anything has run.',
    keywords: ['build is failing', 'deploys are slow', 'tests are flaky', 'site 500s', 'what is wrong', 'check the build'],
    route: '/labs/runbook/',
    paramsSchema: {
      type: 'object',
      properties: { symptom: { type: 'string', enum: SYMPTOM_IDS } },
      required: ['symptom'],
      additionalProperties: false,
    },
    handler: async ({ symptom }) => {
      state.symptom = symptom;
      state.results = {};
      state.run = null;
      return { surface: intakeMessages(symptom) };
    },
  });

  const check = defineCapability({
    id: 'runbook.check',
    kind: 'action',
    title: 'Run one check',
    description: 'Runs a single declared check for a symptom and patches its row in the checklist. It is the unit the skill runner calls.',
    keywords: ['run one check', 'the lockfile check', 'the image check'],
    route: '/labs/runbook/',
    paramsSchema: {
      type: 'object',
      properties: {
        check: { type: 'string', enum: CHECKS.map((entry) => entry.id) },
        symptom: { type: 'string', enum: SYMPTOM_IDS },
      },
      required: ['check', 'symptom'],
      additionalProperties: false,
    },
    handler: async ({ check: checkId, symptom }) => {
      const outcome = outcomeFor(checkId, symptom);
      if (!outcome) throw new Error(`no outcome is declared for ${checkId} on ${symptom}`);
      state.results[checkId] = outcome;
      const total = checksFor(symptom).length;
      const done = Object.keys(state.results).length;
      const values = Object.values(state.results);
      const fails = values.filter((entry) => entry.status === 'fail').length;
      const warns = values.filter((entry) => entry.status === 'warn').length;
      const progress = `${done} of ${total} checks run · ${fails} failing · ${warns} warning${warns === 1 ? '' : 's'}`;
      // The checks are record lookups and finish instantly. A short beat keeps
      // the checklist legible while the skill walks it; it is presentation, and
      // the trace still reports the order the checks actually ran in.
      await new Promise((resolve) => setTimeout(resolve, 160));
      return { surface: patchCheck(checkId, outcome, progress), ...outcome };
    },
  });

  const diagnose = defineCapability({
    id: 'runbook.diagnose',
    kind: 'action',
    title: 'Run the checks',
    description:
      'Runs the symptom’s skill step by step, updating the checklist as each check returns, then shows the findings or stops when the evidence is too thin.',
    keywords: ['run the checks', 'diagnose', 'investigate', 'go ahead', 'run it'],
    route: '/labs/runbook/',
    paramsSchema: {
      type: 'object',
      properties: { symptom: { type: 'string', enum: SYMPTOM_IDS } },
      additionalProperties: false,
    },
    handler: async ({ symptom }) => {
      const target = symptom ?? state.symptom;
      if (!target) throw new Error('pick a symptom first');
      state.symptom = target;
      state.results = {};
      // Put the checklist on the canvas first: every check below patches it.
      await invoke('runbook.intake', { symptom: target });
      const skill = skillForSymptom(target);
      const run = await runSkill(skill, {
        call: async (id, args) => {
          const result = await invoke(id, args);
          return result?.result ?? result;
        },
      });
      state.run = { symptom: target, run };
      return { surface: run.ok ? findingsMessages(target, run) : stopMessages(target, run) };
    },
  });

  const applyFix = defineCapability({
    id: 'runbook.apply_fix',
    kind: 'action',
    title: 'Apply a fix',
    description:
      'Records one fix as applied on this page and shows the real command it stands for. It never runs anything against CI.',
    keywords: ['apply the fix', 'apply it', 'run the fix', 'fix it'],
    route: '/labs/runbook/',
    requiresConfirmation: true,
    paramsSchema: {
      type: 'object',
      properties: { fix: { type: 'string', enum: FIX_IDS } },
      required: ['fix'],
      additionalProperties: false,
    },
    handler: async ({ fix }) => {
      if (!FIXES[fix]) throw new Error(`no fix called ${fix}`);
      if (!state.applied.includes(fix)) state.applied.push(fix);
      return { surface: appliedMessages(fix, state.applied) };
    },
  });

  const recap = defineCapability({
    id: 'runbook.recap',
    kind: 'query',
    title: 'Recap this session',
    description: 'Summarises the symptom, the checks that ran and the fixes recorded so far, without running anything.',
    keywords: ['what do we know', 'recap', 'where were we', 'what did we find', 'summarise this'],
    route: '/labs/runbook/',
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () =>
      ({ surface: recapMessages({ symptom: state.symptom, run: state.run?.run ?? null, applied: state.applied }) }),
  });

  const findings = defineCapability({
    id: 'runbook.findings',
    kind: 'query',
    title: 'Show the findings',
    description: 'Re-renders the result of the last run, whether it completed or stopped on a check.',
    keywords: ['show the findings', 'the result', 'what did the checks say'],
    route: '/labs/runbook/',
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      if (!state.run) return {
        surface: recapMessages({ symptom: state.symptom, run: null, applied: state.applied }),
      };
      return {
        surface: state.run.run.ok
          ? findingsMessages(state.run.symptom, state.run.run)
          : stopMessages(state.run.symptom, state.run.run),
      };
    },
  });

  const how = defineKnowledge({
    id: 'runbook.how',
    title: 'How the runbook works',
    description: 'Explains the skill runner, the checks and the stop condition.',
    keywords: ['how does this work', 'what is a skill', 'where do the checks come from'],
    route: '/labs/runbook/',
    knowledge:
      'A skill is declared data: a trigger, an ordered list of capability calls, checks between them, and a stop condition. The runner in boaz walks it, so every step is a declared capability with a schema. Checks are outcomes the app already knows: the lab is a record of what the pipeline reported, not a monitoring agent. When a check cannot supply enough evidence the skill stops rather than inventing a cause.',
  });

  return [intake, check, diagnose, applyFix, recap, findings, how];
}
