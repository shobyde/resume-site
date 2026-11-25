/* ============================================================
   Every surface the playable labs can emit, as fixture cases.

   `scripts/build_surface_fixtures.mjs` writes one JSONL per case and
   `groundglass check` runs over the result in CI, so a surface the
   labs can draw is a surface that has passed the same conformance
   checks as the site's own cards.
   ============================================================ */

import { briefMessages, debtorMessages, solutionMessages, tableMessages } from './ledger/surfaces.js';
import { gridMessages, coverMessages, proposalMessages, refusalMessages } from './rota/surfaces.js';
import { eligibility } from './rota/data.js';
import { appliedMessages, findingsMessages, intakeMessages, patchCheck, recapMessages, stopMessages } from './runbook/surfaces.js';
import { checksFor, outcomeFor } from './runbook/data.js';

const ledgerSolutions = [
  { '?I': 'INV-2032', '?C': 'Vesper Audio', '?A': '560', '?D': '53' },
  { '?I': 'INV-2031', '?C': 'Meridian Health', '?A': '9600', '?D': '43' },
];

const runbookRun = (ok) => ({
  skillId: ok ? 'diagnose-build' : 'diagnose-flaky',
  title: ok ? 'Diagnose a failing CI build' : 'Diagnose flaky tests',
  ok,
  steps: checksFor(ok ? 'build-fails' : 'tests-flaky')
    .slice(0, ok ? 3 : 1)
    .map((check) => ({
      id: `check_${check.id}`,
      capabilityId: 'runbook.check',
      title: check.label,
      status: 'ran',
      result: outcomeFor(check.id, ok ? 'build-fails' : 'tests-flaky'),
    })),
  checks: [],
  ...(ok
    ? {}
    : {
        stopped: {
          check: 'enough-signal',
          message: 'One flaky test is a signal, not a diagnosis: the skill stops before it invents a cause.',
        },
      }),
});

const refusal = eligibility('sat-night', 'priya');

export const LAB_SURFACE_CASES = [
  { name: 'lab_ledger_brief', build: briefMessages },
  { name: 'lab_ledger_overdue', build: () => tableMessages({ status: 'overdue' }) },
  { name: 'lab_ledger_all', build: () => tableMessages({ status: 'all' }) },
  { name: 'lab_ledger_debtors', build: () => debtorMessages('Open balance by customer · live') },
  { name: 'lab_ledger_bound', build: () => solutionMessages('ledger.oldest_overdue', ledgerSolutions) },
  { name: 'lab_rota_week', build: () => gridMessages() },
  { name: 'lab_rota_cover', build: () => coverMessages('saturday', 'night') },
  { name: 'lab_rota_proposal', build: () => proposalMessages('saturday', 'night', 'ana') },
  { name: 'lab_rota_refusal', build: () => refusalMessages('saturday', 'night', 'priya', refusal.reasons) },
  { name: 'lab_runbook_intake', build: () => intakeMessages('build-fails') },
  {
    name: 'lab_runbook_patched',
    build: () => [
      ...intakeMessages('build-fails'),
      ...patchCheck('lockfile', outcomeFor('lockfile', 'build-fails'), '1 of 3 checks run · 1 failing · latest: fail'),
    ],
  },
  { name: 'lab_runbook_findings', build: () => findingsMessages('build-fails', runbookRun(true)) },
  { name: 'lab_runbook_stop', build: () => stopMessages('tests-flaky', runbookRun(false)) },
  { name: 'lab_runbook_applied', build: () => appliedMessages('lockfile', ['lockfile']) },
  {
    name: 'lab_runbook_recap',
    build: () => recapMessages({ symptom: 'build-fails', run: runbookRun(true), applied: ['lockfile'] }),
  },
];
