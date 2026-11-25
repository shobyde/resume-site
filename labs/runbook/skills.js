/* ============================================================
   Runbook · the skills.

   A skill is data: a trigger, steps that name capabilities, checks
   between them, and a stop condition. The runner in boaz decides the
   shape; the lab only writes the prose. `tests-flaky` is the honest
   one: one flaky test is a signal, so the skill stops rather than
   building a diagnosis out of it.
   ============================================================ */

import { CHECKS, SYMPTOMS, checksFor, symptomById } from './data.js';

const stepFor = (check, symptomId) => ({
  id: `check_${check.id}`,
  capabilityId: 'runbook.check',
  title: check.label,
  args: { check: check.id, symptom: symptomId },
});

const stepsFor = (symptomId) => checksFor(symptomId).map((check) => stepFor(check, symptomId));

const counts = (run) => {
  const results = run.steps.filter((step) => step.status === 'ran').map((step) => step.result).filter(Boolean);
  return results.reduce(
    (acc, result) => ({ ...acc, [result.status]: (acc[result.status] ?? 0) + 1 }),
    { fail: 0, warn: 0, pass: 0 },
  );
};

const summary = (run) => {
  const { fail, warn, pass } = counts(run);
  const bits = [];
  if (fail) bits.push(`${fail} failing`);
  if (warn) bits.push(`${warn} warning${warn === 1 ? '' : 's'}`);
  if (pass) bits.push(`${pass} passing`);
  return bits.join(' · ');
};

const explainer = (run) => {
  if (run.stopped) return run.stopped.message;
  return summary(run);
};

const skill = (id, title, phrases, symptomId, options = {}) => ({
  id,
  title,
  trigger: { phrases, ...(options.require ? { require: options.require } : {}) },
  steps: stepsFor(symptomId),
  checks: options.checks ?? [
    {
      id: 'observed',
      after: `check_${checksFor(symptomId)[0]?.id ?? 'lockfile'}`,
      kind: 'non-empty',
      path: 'headline',
      message: 'The first check returned an observation rather than silence.',
    },
  ],
  stop: { onCheckFail: 'stop', maxSteps: 3 },
  compose: (run) => (run.ok ? `I ran ${run.steps.length} checks: ${summary(run)}.` : run.stopped?.message ?? 'The checks stopped early.'),
  explain: explainer,
});

export const SKILLS = [
  skill(
    'diagnose-build',
    'Diagnose a failing CI build',
    ['build fails', 'build is failing', 'build broken', 'ci fails', 'ci is red', 'pipeline fails'],
    'build-fails',
  ),
  skill(
    'diagnose-flaky',
    'Diagnose flaky tests',
    ['tests are flaky', 'tests flaky', 'flaky test', 'test fails on retry', 'payment suite fails'],
    'tests-flaky',
    {
      checks: [
        {
          id: 'enough-signal',
          after: 'check_test-retry',
          kind: 'min-items',
          path: 'items',
          value: 2,
          message: 'One flaky test is a signal, not a diagnosis: the skill stops before it invents a cause.',
        },
      ],
    },
  ),
  skill(
    'diagnose-500s',
    'Diagnose a 500 after deploy',
    ['site 500s', '500s after deploy', 'checkout is erroring', 'production is down', 'errors after deploy'],
    'site-500s',
  ),
  skill(
    'diagnose-deploy',
    'Diagnose slow deploys',
    ['deploys got slow', 'deploy is slow', 'pipeline is slow', 'rollouts are slow'],
    'deploy-slow',
    {
      checks: [
        {
          id: 'observed',
          after: 'check_image-size',
          kind: 'non-empty',
          path: 'headline',
          message: 'The image check returned an observation.',
        },
      ],
    },
  ),
];

export const skillById = new Map(SKILLS.map((entry) => [entry.id, entry]));
export const skillForSymptom = (symptomId) => skillById.get(symptomById.get(symptomId)?.skill);

export { CHECKS, SYMPTOMS };
