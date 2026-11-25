/* ============================================================
   Runbook · surfaces.

   Three screens the checks write into: the checklist that fills in
   one row per check, the findings with a guarded Apply button per
   fix, and the honest stop when the evidence is too thin.
   ============================================================ */

import {
  Button,
  Bound,
  Card,
  Column,
  Divider,
  Row,
  Text,
  createSurface,
  updateComponents,
  updateDataModel,
} from '../shared/a2ui-builders.js';
import { FIXES, SERVICE, checksFor, statusGlyph, symptomById } from './data.js';

// One canvas: each screen replaces the last, so a run never stacks a stale
// checklist under a new result.
export const CHECKLIST = 'runbook_canvas';
export const FINDINGS = CHECKLIST;

const statusWord = (status) => (status === 'pass' ? 'pass' : status === 'warn' ? 'warning' : status === 'fail' ? 'fail' : 'queued');

/** UAX #31 for component ids: check ids carry dashes, A2UI ids cannot. */
const key = (id) => String(id).replace(/[^A-Za-z0-9_]/g, '_');

function checkRow(check) {
  const id = key(check.id);
  return Column(`chk_${id}`, [
    Row(`chk_${id}_row`, [
      Text(`chk_${id}_glyph`, statusGlyph.queued, { variant: 'caption' }),
      Text(`chk_${id}_label`, check.label),
      Text(`chk_${id}_state`, 'queued', { variant: 'caption' }),
    ]),
    Text(`chk_${id}_evidence`, ''),
  ]);
}

/** The symptom, and the checks it is about to run. */
export function intakeMessages(symptomId) {
  const symptom = symptomById.get(symptomId);
  const checks = checksFor(symptomId);
  const components = [
    Column('root', ['head', 'checklist', 'actions', 'note']),
    Column('head', [
      Text('title', symptom.title, { variant: 'h2' }),
      Text('sub', symptom.sub),
      Bound('progress', '/meta/progress', { variant: 'caption' }),
    ]),
    Card('checklist', 'checklist_body'),
    Column('checklist_body', [
      Text('checklist_kicker', `What the skill will check · ${checks.length} steps`, { variant: 'caption' }),
      ...checks.map(checkRow),
    ]),
    Row('actions', [
      Button('run', 'Run the checks', 'runbook.diagnose', { symptom: symptomId }),
      Button('recap', 'What do we know?', 'runbook.recap', {}),
    ]),
    Text('note', 'Each check is a declared capability with a schema; the skill decides the order and can stop when a check fails.', { variant: 'caption' }),
  ];
  return [
    createSurface(CHECKLIST, components, {
      meta: { progress: `0 of ${checks.length} checks run` },
    }),
  ];
}

/** One step of the skill: a row changes, nothing repaints. */
export function patchCheck(checkId, outcome, progressText) {
  const id = key(checkId);
  return [
    updateComponents(CHECKLIST, [
      Text(`chk_${id}_glyph`, statusGlyph[outcome.status] ?? '·', { variant: 'caption' }),
      Text(`chk_${id}_state`, statusWord(outcome.status), { variant: 'caption' }),
      Text(`chk_${id}_evidence`, outcome.evidence),
    ]),
    updateDataModel(CHECKLIST, '/meta/progress', progressText),
  ];
}

/** The findings: failing checks first, each with the fix it points at. */
export function findingsMessages(symptomId, run) {
  const symptom = symptomById.get(symptomId);
  const results = run.steps
    .filter((step) => step.status === 'ran' && step.result)
    .map((step) => step.result);
  const failing = results.filter((result) => result.status !== 'pass');
  const passing = results.filter((result) => result.status === 'pass');
  const fixIds = [...new Set(failing.map((result) => result.fix).filter((fix) => fix && FIXES[fix]))];
  const ordered = [
    ...symptom.fixOrder.filter((fix) => fixIds.includes(fix)),
    ...fixIds.filter((fix) => !symptom.fixOrder.includes(fix)),
  ];

  const components = [
    Column('root', ['head', 'fixes', 'passed', 'note']),
    Column('head', [
      Text('title', 'What the checks found', { variant: 'h2' }),
      Text('sub', `${results.length} checks · ${failing.length} need attention · ${passing.length} clean`),
    ]),
    Column('fixes', ordered.length ? ordered.map((_, index) => `fix_${index}`) : ['fix_none']),
    ...ordered.map((fixId, index) => Card(`fix_${index}`, `fix_body_${index}`)),
    ...ordered.map((fixId, index) => {
      const fix = FIXES[fixId];
      const source = failing.find((result) => result.fix === fixId);
      return Column(`fix_body_${index}`, [
        Row(`fix_row_${index}`, [
          Text(`fix_title_${index}`, fix.title, { variant: 'h4' }),
          Text(`fix_severity_${index}`, source ? statusWord(source.status) : 'fix', { variant: 'caption' }),
        ]),
        Text(`fix_why_${index}`, fix.why),
        Text(`fix_cmd_${index}`, fix.command, { variant: 'caption' }),
        Button(`fix_apply_${index}`, 'Apply this fix', 'runbook.apply_fix', { fix: fixId }),
      ]);
    }),
    ...(ordered.length ? [] : [Text('fix_none', 'No fix is needed: every check came back clean.')]),
    Card('passed', 'passed_body'),
    Column('passed_body', [
      Text('passed_kicker', 'Checks that came back clean', { variant: 'caption' }),
      ...(passing.length
        ? passing.map((result, index) => Text(`passed_${index}`, `${result.headline} — ${result.evidence}`, { variant: 'caption' }))
        : [Text('passed_0', 'None: every check found something.', { variant: 'caption' })]),
    ]),
    Text('note', 'Applying a fix asks first and records it on this page. The command is quoted so it can be run for real.', { variant: 'caption' }),
  ];

  return [createSurface(FINDINGS, components, {})];
}

/** The stop: what it saw, what it will not guess, what to collect. */
export function stopMessages(symptomId, run) {
  const symptom = symptomById.get(symptomId);
  const results = run.steps
    .filter((step) => step.status === 'ran' && step.result)
    .map((step) => step.result);
  const stopped = run.stopped;
  const components = [
    Column('root', ['head', 'stop', 'collect', 'actions', 'note']),
    Column('head', [
      Text('title', 'I’m not calling this one yet.', { variant: 'h2' }),
      Text('sub', `The skill stopped at “${stopped?.check ?? 'a check'}”`),
    ]),
    Card('stop', 'stop_body'),
    Column('stop_body', [
      Text('stop_kicker', 'Why it stopped', { variant: 'caption' }),
      Text('stop_line', stopped?.message ?? 'The evidence did not clear the check.'),
      Divider('divider'),
      Text('saw_kicker', 'What it saw', { variant: 'caption' }),
      ...results.map((result, index) => Text(`saw_${index}`, `${statusWord(result.status)} · ${result.headline}`, { variant: 'caption' })),
    ]),
    Card('collect', 'collect_body'),
    Column('collect_body', [
      Text('collect_kicker', 'What would make this diagnosable', { variant: 'caption' }),
      ...(symptom.collect ?? []).map((item, index) => Text(`collect_${index}`, `• ${item}`)),
    ]),
    Row('actions', [
      Button('again', 'Run the checks again', 'runbook.diagnose', { symptom: symptomId }),
      Button('checklist', 'Back to the checklist', 'runbook.intake', { symptom: symptomId }),
    ]),
    Text('note', 'A stop is a result: the skill had a check for “enough evidence”, and it failed before the last step could pad.', { variant: 'caption' }),
  ];
  return [createSurface(FINDINGS, components, {})];
}

/** Applying a fix is a guarded write; this is what it records. */
export function appliedMessages(fixId, applied) {
  const fix = FIXES[fixId];
  const components = [
    Column('root', ['head', 'card', 'note']),
    Column('head', [
      Text('title', 'Applied in the demo.', { variant: 'h2' }),
      Text('sub', `${SERVICE.name} · ${SERVICE.ci} · nothing left this tab`),
    ]),
    Card('card', 'card_body'),
    Column('card_body', [
      Text('k1', 'The fix', { variant: 'caption' }),
      Text('fix_title', fix.title, { variant: 'h4' }),
      Text('fix_why', fix.why),
      Text('fix_cmd', fix.command, { variant: 'caption' }),
      Divider('divider'),
      Text('k2', 'Recorded this session', { variant: 'caption' }),
      Text('applied', applied.length ? applied.map((id) => FIXES[id]?.title ?? id).join(' · ') : 'none'),
    ]),
    Text('note', 'The command is the real one; the page only records that you pressed Apply.', { variant: 'caption' }),
  ];
  return [createSurface(FINDINGS, components, {})];
}

/** A recap over the run the page is holding. */
export function recapMessages(state) {
  if (!state.run) {
    const components = [
      Column('root', ['head', 'card']),
      Column('head', [
        Text('title', 'Nothing has run yet.', { variant: 'h2' }),
        Text('sub', 'Pick a symptom and the skill will walk its checks.'),
      ]),
      Card('card', 'card_body'),
      Column('card_body', [
        Text('k1', 'What this lab keeps', { variant: 'caption' }),
        Text('line', 'The symptom, the checks that ran, the result of each, and any fix you applied. Nothing is stored beyond this page.'),
        Button('start', 'Start with the build', 'runbook.intake', { symptom: 'build-fails' }),
      ]),
    ];
    return [createSurface(FINDINGS, components, {})];
  }
  const symptom = symptomById.get(state.symptom);
  const results = state.run.steps.filter((step) => step.status === 'ran' && step.result).map((step) => step.result);
  const components = [
    Column('root', ['head', 'card', 'actions']),
    Column('head', [
      Text('title', 'This session', { variant: 'h2' }),
      Text('sub', `${symptom.title} · ${state.run.ok ? 'completed' : 'stopped'} · kept for this session`),
    ]),
    Card('card', 'card_body'),
    Column('card_body', [
      Text('k1', 'Checks', { variant: 'caption' }),
      ...results.map((result, index) => Text(`r_${index}`, `${statusWord(result.status)} · ${result.headline}`)),
      Divider('divider'),
      Text('k2', 'Applied', { variant: 'caption' }),
      Text('applied', state.applied.length ? state.applied.map((id) => FIXES[id]?.title ?? id).join(' · ') : 'nothing yet'),
    ]),
    Row('actions', [
      Button('checklist', 'Back to the checklist', 'runbook.intake', { symptom: state.symptom }),
      Button('findings', 'Show the findings', 'runbook.findings', {}),
    ]),
  ];
  return [createSurface(FINDINGS, components, {})];
}
