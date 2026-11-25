/* ============================================================
   Rota · what the assistant may do.

   Two reads and two writes. `rota.propose` is deliberately a dry run:
   it is the only way to ask "what happens if…" without changing the
   week, and its answer carries the reason when the answer is no.
   ============================================================ */

import { defineCapability, defineKnowledge } from '@shobyde/boaz/core';
import { fact } from '@shobyde/boaz/rules';
import { PEOPLE, REST_HOURS, assign, eligibility, gapShifts, shiftsById } from './data.js';
import { knowledge } from './rules.js';
import { coverMessages, dayOf, gridMessages, proposalMessages, refusalMessages } from './surfaces.js';

export const state = { view: 'week' };

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SLOTS = ['day', 'night'];
const PEOPLE_IDS = PEOPLE.map((person) => person.id);

const shiftIdOf = (day, slot) => `${dayOf(day)}-${slot}`;

export const grid = defineCapability({
  id: 'rota.grid',
  kind: 'query',
  title: 'Show the week',
  description: 'Shows every shift this week, who is on it, and which shifts still have nobody, with a Find cover button on each hole.',
  keywords: ['show the week', 'the rota', 'the schedule', 'coverage grid', 'week view'],
  route: '/labs/rota/',
  paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async () => {
    state.view = 'week';
    return { surface: gridMessages() };
  },
});

export const findCover = defineCapability({
  id: 'rota.find_cover',
  kind: 'query',
  title: 'Find cover for a shift',
  description: 'Lists everyone on the roster against one shift, with the eligible people first and the exact rule that stops the others.',
  keywords: ['who can cover', 'find cover', 'cover a shift', 'who is eligible', 'eligible for', 'who can cover the shift'],
  route: '/labs/rota/',
  paramsSchema: {
    type: 'object',
    properties: {
      day: { type: 'string', enum: DAYS },
      slot: { type: 'string', enum: SLOTS },
    },
    required: ['day', 'slot'],
    additionalProperties: false,
  },
  handler: async ({ day, slot }) => {
    state.view = 'cover';
    return { surface: coverMessages(day, slot) };
  },
});

export const propose = defineCapability({
  id: 'rota.propose',
  kind: 'action',
  title: 'Propose a cover',
  description:
    'Checks one person against one shift and returns either a proposal with the change it would make, or a refusal naming the rule that failed. It never changes the week.',
  keywords: ['propose a cover', 'propose cover', 'what if', 'can priya take', 'would it work', 'dry run', 'propose for'],
  route: '/labs/rota/',
  paramsSchema: {
    type: 'object',
    properties: {
      day: { type: 'string', enum: DAYS },
      slot: { type: 'string', enum: SLOTS },
      person: { type: 'string', enum: PEOPLE_IDS },
    },
    required: ['day', 'slot', 'person'],
    additionalProperties: false,
  },
  handler: async ({ day, slot, person }) => {
    const shiftId = shiftIdOf(day, slot);
    const check = eligibility(shiftId, person);
    state.view = 'proposal';
    if (!check.ok) return { surface: refusalMessages(day, slot, person, check.reasons) };
    return { surface: proposalMessages(day, slot, person) };
  },
});

export const assignCover = defineCapability({
  id: 'rota.assign',
  kind: 'action',
  title: 'Assign the cover',
  description:
    'Commits the proposed cover and updates the week. The eligibility check runs again, and the assignment is appended as a fact so later questions see it.',
  keywords: ['assign', 'commit the cover', 'put them on', 'confirm the cover'],
  route: '/labs/rota/',
  requiresConfirmation: true,
  paramsSchema: {
    type: 'object',
    properties: {
      day: { type: 'string', enum: DAYS },
      slot: { type: 'string', enum: SLOTS },
      person: { type: 'string', enum: PEOPLE_IDS },
    },
    required: ['day', 'slot', 'person'],
    additionalProperties: false,
  },
  handler: async ({ day, slot, person }) => {
    const shiftId = shiftIdOf(day, slot);
    const { person: assigned } = assign(shiftId, person);
    knowledge.add(fact('assigned', shiftId, assigned.id));
    state.view = 'week';
    const left = gapShifts().length;
    return {
      surface: gridMessages(
        `${assigned.name} is on ${shiftsById.get(shiftId).label}. Open shifts: ${left}. The week above is the new row set, not a re-run of the old one.`,
      ),
    };
  },
});

export const restRule = defineKnowledge({
  id: 'rota.rest_rule',
  title: 'The rest rule',
  description: 'Explains the 11-hour minimum between shifts.',
  keywords: ['rest rule', 'how much rest', 'the rules', 'eligibility'],
  route: '/labs/rota/',
  knowledge: `The rest rule is ${REST_HOURS} hours between the end of a shift a person already holds and the start of the next one. Skill, availability and the weekly cap are checked before it, and a refusal names the first two that fail.`,
});

export const capabilities = [grid, findCover, propose, assignCover, restRule];
