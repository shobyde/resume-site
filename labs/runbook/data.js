/* ============================================================
   Runbook · the incident, the checks, the fixes.

   A fictional checkout service with four symptoms and eight checks.
   Every check is data: the outcome it reports, the evidence it
   quotes, and the fix it points at. The skill runner walks them in
   order and can stop when the evidence is too thin to call.
   ============================================================ */

export const SERVICE = {
  name: 'checkout-web',
  repo: 'fieldnote/checkout',
  ci: 'Woodpecker',
  lastGreen: '2 days ago',
  owner: 'Platform',
};

export const SYMPTOMS = [
  {
    id: 'build-fails',
    title: 'The build is failing on CI',
    ask: 'The build is failing on CI',
    sub: 'checkout-web · main · last green 2 days ago',
    checks: ['lockfile', 'node-version', 'env-var'],
    skill: 'diagnose-build',
    fixOrder: ['lockfile', 'node-version', 'env-var'],
    collect: ['the install log from the failing job', 'the Node version the runner reports'],
  },
  {
    id: 'tests-flaky',
    title: 'The tests are flaky',
    ask: 'The tests are flaky',
    sub: 'checkout-web · payment suite · 4 failures this week, all green on retry',
    checks: ['test-retry', 'build-cache', 'test-order'],
    skill: 'diagnose-flaky',
    fixOrder: ['quarantine', 'cache'],
    collect: ['the trace id from a failing run', 'the three attempts before it', 'whether the cache was warm'],
  },
  {
    id: 'site-500s',
    title: 'The site 500s after deploy',
    ask: 'The site 500s after deploy',
    sub: 'checkout-web · production · 12% of checkout requests since 14:20',
    checks: ['env-var', 'migration', 'asset-paths'],
    skill: 'diagnose-500s',
    fixOrder: ['env-var', 'migrate', 'assets'],
    collect: ['the first 500 from the edge log', 'the deploy diff the release cut'],
  },
  {
    id: 'deploy-slow',
    title: 'Deploys got slow',
    ask: 'Deploys got slow',
    sub: 'checkout-web · pipeline · p50 4m10s → 11m40s since 14 Nov',
    checks: ['image-size', 'build-cache', 'node-version'],
    skill: 'diagnose-deploy',
    fixOrder: ['slim', 'cache'],
    collect: ['the p50 per pipeline step', 'the cache key the runner printed'],
  },
];

export const symptomById = new Map(SYMPTOMS.map((symptom) => [symptom.id, symptom]));

export const FIXES = {
  lockfile: {
    title: 'Regenerate the lockfile',
    command: 'pnpm install --lockfile-only && git commit pnpm-lock.yaml',
    why: 'CI installs from the lockfile; a manifest three commits ahead installs a tree nobody tested.',
  },
  'node-version': {
    title: 'Pin the runner to .nvmrc',
    command: 'mise install && mise exec -- node -v',
    why: 'The runner is on 18.19 while the repo pins 20.11; the lockfile was resolved under 20.',
  },
  'env-var': {
    title: 'Add CHECKOUT_API_URL to the preview environment',
    command: 'woodpecker env add CHECKOUT_API_URL --context preview',
    why: 'The preview job reads a variable that only exists in production.',
  },
  quarantine: {
    title: 'Quarantine payment.spec.ts',
    command: 'pnpm test --filter payment --repeat 20 --quarantine',
    why: 'One test fails first and passes on retry; quarantine it while the race is found.',
  },
  cache: {
    title: 'Repair the CI cache key',
    command: 'woodpecker cache purge checkout-web',
    why: 'The restore key misses on 6 of 7 jobs, so every job installs from scratch.',
  },
  slim: {
    title: 'Slim the runtime image',
    command: 'docker build --target runtime --squash .',
    why: 'The image grew from 418 MB to 1.1 GB when the test toolchain moved into the runtime layer.',
  },
  migrate: {
    title: 'Run migration 0042',
    command: 'pnpm db:migrate --to 0042_add_idempotency_key',
    why: 'The new code writes an idempotency key the schema does not have yet.',
  },
  assets: {
    title: 'Republish the asset manifest',
    command: 'pnpm build && wrangler pages deploy dist',
    why: 'index.html points at a hashed file the last deploy never uploaded.',
  },
};

/**
 * One entry per check. `outcomes` is keyed by symptom, so the same check can
 * fail for one incident and pass for another without a branch in the UI.
 */
export const CHECKS = [
  {
    id: 'lockfile',
    label: 'Lockfile matches the manifest',
    outcomes: {
      'build-fails': {
        status: 'fail',
        headline: 'pnpm-lock.yaml is 3 commits behind package.json',
        evidence: '4 packages differ; CI installs from the lockfile, so the build runs a tree nobody tested.',
        items: ['3 commits behind', '4 packages differ'],
        fix: 'lockfile',
      },
    },
  },
  {
    id: 'node-version',
    label: 'Runner matches .nvmrc',
    outcomes: {
      'build-fails': {
        status: 'warn',
        headline: '.nvmrc pins 20.11; the runner is on 18.19',
        evidence: 'The lockfile was resolved under 20, which explains at least one of the install failures.',
        items: ['runner 18.19', 'repo 20.11'],
        fix: 'node-version',
      },
      'deploy-slow': {
        status: 'pass',
        headline: '.nvmrc and the runner agree on 20.11',
        evidence: 'No version drift on this pipeline.',
        items: ['20.11 on both'],
      },
    },
  },
  {
    id: 'env-var',
    label: 'Environment is complete',
    outcomes: {
      'build-fails': {
        status: 'warn',
        headline: 'CHECKOUT_API_URL is set for production but not for preview',
        evidence: 'The preview build falls back to the mock URL, which is why the smoke step is skipped.',
        items: ['1 missing variable'],
        fix: 'env-var',
      },
      'site-500s': {
        status: 'fail',
        headline: 'CHECKOUT_API_URL is missing after the 14:20 deploy',
        evidence: 'The checkout route reads the variable at boot; unset means the handler throws on the first request.',
        items: ['1 missing variable', 'error rate 12%'],
        fix: 'env-var',
      },
    },
  },
  {
    id: 'image-size',
    label: 'Runtime image size',
    outcomes: {
      'deploy-slow': {
        status: 'fail',
        headline: 'Runtime image grew 418 MB → 1.1 GB since 14 Nov',
        evidence: 'The test toolchain moved into the runtime layer; every rollout pulls the extra 682 MB.',
        items: ['418 MB → 1.1 GB', '682 MB extra per pull'],
        fix: 'slim',
      },
    },
  },
  {
    id: 'build-cache',
    label: 'CI cache is restoring',
    outcomes: {
      'deploy-slow': {
        status: 'warn',
        headline: 'Cache restore missed in 6 of 7 jobs',
        evidence: 'The key includes the runner image tag, which changes nightly, so the cache never hits.',
        items: ['6 of 7 misses'],
        fix: 'cache',
      },
      'tests-flaky': {
        status: 'warn',
        headline: 'Cache restore missed in 6 of 7 jobs',
        evidence: 'A cold install changes timing, which makes a race in the payment suite more likely.',
        items: ['6 of 7 misses'],
        fix: 'cache',
      },
    },
  },
  {
    id: 'test-retry',
    label: 'Failure is reproducible',
    outcomes: {
      'tests-flaky': {
        status: 'warn',
        headline: 'payment.spec.ts failed on attempt 1, passed on retry',
        evidence: 'The failure rate is 4 in 40 runs, all on the first attempt after a cold cache.',
        items: ['4 failures in 40 runs'],
        fix: 'quarantine',
      },
    },
  },
  {
    id: 'test-order',
    label: 'Suite is order-independent',
    outcomes: {
      'tests-flaky': {
        status: 'pass',
        headline: 'The suite passes in reverse order',
        evidence: 'No shared state leak found; the race is timing, not ordering.',
        items: ['reverse order green'],
      },
    },
  },
  {
    id: 'migration',
    label: 'Schema is current',
    outcomes: {
      'site-500s': {
        status: 'fail',
        headline: 'Migration 0042_add_idempotency_key has not run',
        evidence: 'The new code writes a column the schema does not have; every checkout insert fails.',
        items: ['0042 pending'],
        fix: 'migrate',
      },
    },
  },
  {
    id: 'asset-paths',
    label: 'Referenced assets exist',
    outcomes: {
      'site-500s': {
        status: 'fail',
        headline: 'index.html references /assets/app-8f2c.js, which 404s',
        evidence: 'The last deploy uploaded the new HTML but not the hashed asset it names.',
        items: ['1 missing asset'],
        fix: 'assets',
      },
    },
  },
];

export const checksById = new Map(CHECKS.map((check) => [check.id, check]));

export const checksFor = (symptomId) =>
  (symptomById.get(symptomId)?.checks ?? []).map((id) => checksById.get(id)).filter(Boolean);

export function outcomeFor(checkId, symptomId) {
  return checksById.get(checkId)?.outcomes?.[symptomId] ?? null;
}

export const statusGlyph = { queued: '○', pass: '✓', warn: '!', fail: '✕' };

export const summarise = (symptomId, results) => {
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return { counts, total: results.length };
};
