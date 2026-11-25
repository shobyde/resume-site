/* ============================================================
   Rota · the reasoning.

   The static roster is facts: who can do which skill, who is
   unavailable, which shift needs what. The live assignments are
   rows the actions append. The answers below join the roster and
   then read the live rows, so a question after an assignment sees
   the week as it stands.

   `eligibility()` in data.js is the only place that decides who can
   take a shift. A refusal calls the same function, which is why it
   can name the rule it failed instead of apologising.
   ============================================================ */

import { KnowledgeBase, createRulesEngine, fact } from '@shobyde/boaz/rules';
import {
  PEOPLE,
  SHIFTS,
  assigneeOf,
  assignedShifts,
  gapShifts,
  hoursFor,
  peopleById,
  shiftsById,
  short,
} from './data.js';

export const knowledge = new KnowledgeBase({
  facts: [
    ...PEOPLE.flatMap((person) => [
      fact('person', person.id, person.name, person.level, String(person.cap)),
      ...person.skills.map((skill) => fact('can', person.id, skill)),
      ...person.unavailable.map((day) => fact('unavailable', person.id, day)),
    ]),
    ...SHIFTS.map((shift) =>
      fact('shift', shift.id, shift.day, shift.slot, shift.skill, shift.nights ? 'nights' : 'day'),
    ),
    ...[...assigneeOfEntries()].map(([shiftId, personId]) => fact('assigned', shiftId, personId)),
  ],
  rules: [
    'qualified(?P, ?S, ?D, ?T, ?K, ?N) :- can(?P, ?K), shift(?S, ?D, ?T, ?K, ?N).',
    'on_shift(?P, ?S) :- assigned(?S, ?P).',
    'rota_shift(?S, ?D, ?T, ?K, ?N) :- shift(?S, ?D, ?T, ?K, ?N).',
  ],
});

function assigneeOfEntries() {
  const entries = [];
  for (const shift of SHIFTS) {
    const person = assigneeOf(shift.id);
    if (person) entries.push([shift.id, person.id]);
  }
  return entries;
}

export const ROTA_CONSTANTS = [
  ...PEOPLE.map((person) => person.id),
  ...PEOPLE.map((person) => person.name),
  ...PEOPLE.flatMap((person) => person.skills),
  ...SHIFTS.map((shift) => shift.id),
];

const bindingsOf = (solution) => solution.bindings ?? solution;
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const dayName = (dayId) => {
  const names = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  return names[dayId] ?? dayId;
};

export const answers = [
  {
    id: 'rota.gaps',
    title: 'Where the week has holes',
    keywords: ['who is short', 'which shifts are uncovered', 'gaps this week', 'nobody on', 'uncovered shifts', 'holes in the week'],
    goal: 'rota_shift(?S, ?D, ?T, ?K, ?N)',
    requiresSubject: false,
    threshold: 6,
    match: (query) => /\b(short|gap|gaps|uncovered|no cover|nobody|missing|holes?)\b/i.test(query),
    explain: ({ solutions }) => `Joined ${solutions.length} shifts to their required skill, then read the live assignment rows.`,
    compose: ({ solutions }) => {
      const known = new Set(solutions.map((solution) => bindingsOf(solution)['?S']));
      const gaps = gapShifts().filter((shift) => known.has(shift.id));
      if (gaps.length === 0) return 'Every shift this week has someone on it.';
      const listed = gaps
        .map((shift) => `${dayName(shift.day)} ${shift.slot} (${shift.skill}${shift.nights ? ', night rota' : ''})`)
        .join('; ');
      const soonest = gaps[0];
      return `${plural(gaps.length, 'shift')} ${gaps.length === 1 ? 'has' : 'have'} no one on ${gaps.length === 1 ? 'it' : 'them'}: ${listed}. The next is ${short(soonest)}; ask who can cover it.`;
    },
  },
  {
    id: 'rota.hours',
    title: 'Who is carrying the week',
    keywords: ['how many hours', 'overworked', 'busiest', 'capacity left', 'load this week'],
    goal: 'person(?P, ?N, ?L, ?C)',
    requiresSubject: false,
    threshold: 6,
    match: (query) => /\b(hours?|load|capacity|overworked|busiest|carrying)\b/i.test(query),
    explain: ({ solutions }) => `Read ${solutions.length} people and counted the shifts each one owns.`,
    compose: ({ solutions }) => {
      const rows = solutions
        .map((solution) => bindingsOf(solution))
        .map((bindings) => {
          const person = peopleById.get(bindings['?P']);
          return person ? { person, hours: hoursFor(person.id), cap: person.cap } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.hours - a.hours);
      if (rows.length === 0) return '';
      const leader = rows[0];
      const headroom = rows
        .map((row) => `${row.person.name} ${row.hours}/${row.cap}h`)
        .join(', ');
      return `${leader.person.name} is carrying the most: ${leader.hours}h of a ${leader.cap}h week. The board: ${headroom}.`;
    },
  },
  {
    id: 'rota.week_shape',
    title: 'How much of the week is covered',
    keywords: ['how much of the week is covered', 'coverage', 'how many shifts are filled', 'is the week staffed'],
    goal: 'rota_shift(?S, ?D, ?T, ?K, ?N)',
    requiresSubject: false,
    threshold: 6,
    match: (query) => /\b(covered|coverage|staffed|filled|how many shifts)\b/i.test(query),
    explain: ({ solutions }) => `Counted ${solutions.length} shifts and compared them with the live assignment rows.`,
    compose: ({ solutions }) => {
      const total = solutions.length;
      const covered = solutions.filter((solution) => assigneeOf(bindingsOf(solution)['?S'])).length;
      return `${covered} of ${total} shifts are covered; ${total - covered} still need someone.`;
    },
  },
];

export const createRotaEngine = (capabilities) =>
  createRulesEngine({
    knowledge,
    answers,
    capabilities,
    constants: ROTA_CONSTANTS,
    threshold: 6,
  });

export const demos = [
  { label: 'Where is the week short?', ask: 'Where is the week short?' },
  { label: 'Who can cover Saturday night?', ask: 'Who can cover Saturday night?' },
  { label: 'Propose Priya for Saturday night', ask: 'Propose Priya for Saturday night' },
  { label: 'Who is carrying the week?', ask: 'Who is carrying the week?' },
  { label: 'How much of the week is covered?', ask: 'How much of the week is covered?' },
  { label: 'What is the rest rule?', ask: 'What is the rest rule?' },
];
