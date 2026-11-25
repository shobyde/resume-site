/* ============================================================
   Rota · surfaces.

   The grid, the candidate list and the proposal are pure A2UI: the
   buttons name capabilities, and the host runs them through the same
   validation and confirmation gate as a typed question.
   ============================================================ */

import {
  Button,
  Card,
  Column,
  Divider,
  Row,
  Text,
  createSurface,
} from '../shared/a2ui-builders.js';
import {
  DAYS,
  PEOPLE,
  SLOTS,
  REST_HOURS,
  assigneeOf,
  candidatesFor,
  gapShifts,
  hoursFor,
  peopleById,
  shiftsById,
  summary,
} from './data.js';

export const ROTA_BOARD = 'rota_board';

const dayName = (id) => DAYS.find((day) => day.id === id)?.label ?? id;

/** UAX #31 for component ids: the roster's ids carry dashes, A2UI ids cannot. */
const key = (id) => String(id).replace(/[^A-Za-z0-9_]/g, '_');

const FULL_DAY = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
};

function shiftCell(shift) {
  const person = assigneeOf(shift.id);
  const id = key(shift.id);
  const children = [
    Text(`cell_${id}_slot`, `${SLOTS[shift.slot].label} · ${SLOTS[shift.slot].hours}`, { variant: 'caption' }),
    Text(`cell_${id}_who`, person ? person.name : 'UNCOVERED', { variant: 'h5' }),
    Text(`cell_${id}_need`, `${shift.skill}${shift.nights ? ' · night rota' : ''}`, { variant: 'caption' }),
  ];
  if (!person) {
    children.push(Button(`cell_${id}_cover`, 'Find cover', 'rota.find_cover', { day: FULL_DAY[shift.day], slot: shift.slot }));
  }
  return Column(`cell_${id}`, children);
}

/** The week, with the holes named. */
export function gridMessages(note = '') {
  const totals = summary();
  const left = DAYS.slice(0, 4);
  const right = DAYS.slice(4);

  const dayCard = (day) => Card(`day_${day.id}`, `day_${day.id}_body`);
  const dayBody = (day) => {
    const shifts = ['day', 'night'].map((slot) => shiftsById.get(`${day.id}-${slot}`));
    return Column(`day_${day.id}_body`, [
      Text(`day_${day.id}_label`, `${day.label} ${day.date}`, { variant: 'h4' }),
      Row(`day_${day.id}_shifts`, shifts.map(shiftCell)),
    ]);
  };

  const components = [
    Column('root', ['head', 'week', 'legend', 'note']),
    Column('head', [
      Text('title', 'The week, as it stands', { variant: 'h2' }),
      Text('sub', `${totals.shifts - totals.gaps} of ${totals.shifts} shifts covered · ${totals.gaps} open · ${totals.hours}h scheduled of ${PEOPLE.reduce((sum, person) => sum + person.cap, 0)}h available`),
    ]),
    Row('week', ['left', 'right']),
    Column('left', left.map((day) => `day_${day.id}`)),
    Column('right', right.map((day) => `day_${day.id}`)),
    ...DAYS.map(dayCard),
    ...DAYS.map((day) => dayBody(day)),
    Row('legend', [
      Text('legend_gap', 'UNCOVERED · ask who can take it', { variant: 'caption' }),
      Text('legend_rule', `Rest rule · ${REST_HOURS}h between shifts`, { variant: 'caption' }),
    ]),
    Text('note', note || 'Buttons run through the same capability path as a typed question.', { variant: 'caption' }),
  ];

  return [createSurface(ROTA_BOARD, components, {})];
}

/** Who could take one shift, and the rule that stops the rest. */
export function coverMessages(day, slot) {
  const shiftId = `${dayOf(day)}-${slot}`;
  const shift = shiftsById.get(shiftId);
  if (!shift) return gridMessages('That shift is not on the roster.');
  const candidates = candidatesFor(shiftId);
  const eligible = candidates.filter((candidate) => candidate.ok);

  const components = [
    Column('root', ['head', 'shift', 'list', 'note']),
    Column('head', [
      Text('title', `Who can cover ${dayName(dayOf(day))} ${slot}`, { variant: 'h2' }),
      Text('sub', `${shift.skill}${shift.nights ? ' · night rota' : ''} · ${SLOTS[slot].hours} · ${eligible.length} of ${candidates.length} eligible`),
    ]),
    Card('shift', 'shift_body'),
    Column('shift_body', [
      Text('shift_kicker', 'The shift', { variant: 'caption' }),
      Text('shift_line', `${dayName(dayOf(day))} ${slot} · ${shift.skill}${shift.nights ? ' · night rota' : ''}`, { variant: 'h4' }),
      Text('shift_hours', `${SLOTS[slot].hours} · 8 hours · ${assigneeOf(shiftId) ? `currently ${assigneeOf(shiftId).name}` : 'currently uncovered'}`, { variant: 'caption' }),
    ]),
    Column('list', candidates.map((_, index) => `cand_${index}`)),
    ...candidates.map((candidate, index) => Card(`cand_${index}`, `cand_body_${index}`)),
    ...candidates.map((candidate, index) =>
      Column(`cand_body_${index}`, [
        Row(`cand_row_${index}`, [
          Text(`cand_name_${index}`, `${candidate.person.name} · ${candidate.person.level}`),
          Text(`cand_verdict_${index}`, candidate.ok ? '✓ eligible' : '✕ cannot'),
        ]),
        Text(`cand_meta_${index}`, `${candidate.person.skills.join(', ')} · ${candidate.hours}/${candidate.person.cap}h this week`, { variant: 'caption' }),
        ...(candidate.ok
          ? [Button(`cand_go_${index}`, `Propose ${candidate.person.name.split(' ')[0]}`, 'rota.propose', { day, slot, person: candidate.person.id })]
          : candidate.reasons.slice(0, 2).map((reason, reasonIndex) => Text(`cand_why_${index}_${reasonIndex}`, reason))),
      ]),
    ),
    Text('note', 'Proposing is a dry run: it re-checks the rules and shows the change before anything is written.', { variant: 'caption' }),
  ];

  return [createSurface(ROTA_BOARD, components, {})];
}

/** A dry run that passed: what changes, and the button that commits it. */
export function proposalMessages(day, slot, personId) {
  const shiftId = `${dayOf(day)}-${slot}`;
  const person = peopleById.get(personId);
  const shift = shiftsById.get(shiftId);
  if (!person || !shift) return gridMessages('That proposal did not resolve to a shift and a person.');
  const hours = hoursFor(person.id);
  const gaps = gapShifts().length;
  const components = [
    Column('root', ['head', 'card', 'actions', 'note']),
    Column('head', [
      Text('title', `Proposed: ${person.name} → ${dayName(dayOf(day))} ${slot}`, { variant: 'h2' }),
      Text('sub', 'Dry run · nothing has changed yet'),
    ]),
    Card('card', 'card_body'),
    Column('card_body', [
      Text('k1', 'The change', { variant: 'caption' }),
      Text('line1', `${person.name} takes ${dayName(dayOf(day))} ${slot}, ${SLOTS[slot].hours}.`),
      Divider('divider'),
      Text('k2', 'What it does to the week', { variant: 'caption' }),
      Text('line2', `Their hours go ${hours}h → ${hours + shift.hours}h of a ${person.cap}h week.`),
      Text('line3', `Open shifts go ${gaps} → ${gaps - 1}.`),
      Text('line4', `The ${REST_HOURS}h rest rule passes: no other shift is within ${REST_HOURS} hours.`),
    ]),
    Row('actions', [
      Button('commit', 'Assign this cover', 'rota.assign', { day, slot, person: person.id }),
      Button('back', 'Back to the week', 'rota.grid', {}),
    ]),
    Text('note', 'Assigning asks for confirmation, then appends the assignment row the rest of the page reads.', { variant: 'caption' }),
  ];
  return [createSurface(ROTA_BOARD, components, {})];
}

/** A dry run that failed: the rule, the numbers, and the alternative. */
export function refusalMessages(day, slot, personId, reasons) {
  const shiftId = `${dayOf(day)}-${slot}`;
  const person = peopleById.get(personId);
  const candidates = candidatesFor(shiftId).filter((candidate) => candidate.ok);
  const alternative = candidates[0];
  const components = [
    Column('root', ['head', 'card', 'actions', 'note']),
    Column('head', [
      Text('title', `I can’t put ${person ? person.name.split(' ')[0] : 'them'} on ${dayName(dayOf(day))} ${slot}.`, { variant: 'h2' }),
      Text('sub', 'The rule fires before anything is written'),
    ]),
    Card('card', 'card_body'),
    Column('card_body', [
      Text('k1', 'Why not', { variant: 'caption' }),
      ...reasons.map((reason, index) => Text(`reason_${index}`, `• ${reason}`)),
      Divider('divider'),
      Text('k2', 'What would work', { variant: 'caption' }),
      Text(
        'line',
        alternative
          ? `${alternative.person.name} is eligible: ${alternative.person.skills.join(', ')}, ${alternative.hours}h this week.`
          : 'Nobody on the roster passes every rule for this shift; it needs a contractor or a swap.',
      ),
    ]),
    Row('actions', [
      Button('who', 'Who can cover it', 'rota.find_cover', { day, slot }),
      Button('back', 'Back to the week', 'rota.grid', {}),
    ]),
    Text('note', 'A refusal here is a query result, not an apology: the same eligibility check that would have run the assignment produced it.', { variant: 'caption' }),
  ];
  return [createSurface(ROTA_BOARD, components, {})];
}

/** Full day name → the three-letter id the roster uses. */
export function dayOf(day) {
  return String(day).slice(0, 3).toLowerCase();
}
