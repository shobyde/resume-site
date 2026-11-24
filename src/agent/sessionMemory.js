// Session memory for the site panel (rung 14).
//
// The engine keeps one turn: the rule that answered and the entities it bound.
// That is enough for "and?" and for "its stack" when the previous answer was
// about the thing. It is not enough for a conversation, because a visitor who
// changes subject and comes back expects the pointer to still work, and expects
// "what did we cover" to name what happened rather than reciting the last
// answer. The arithmetic lives in `boaz` (0.7.10 `createWorkingMemory`); this
// file supplies the site's vocabulary and writes the sentence in the panel's
// voice.
import { analyzeQuestion, createWorkingMemory, isCoverageQuery } from 'boaz';
import { DATA } from '../data.js';

/**
 * A card title carries its pitch ("Hobnob: private meeting notes, no cloud").
 * The visitor types the name, so the vocabulary is the name: matching against
 * the whole title matches nothing.
 */
const shortTitle = (project) => String(project.title).split(':')[0].trim();

/** Everything the site can be about, in the words the visitor would type. */
export const SITE_SUBJECTS = [
  ...DATA.projects.map(shortTitle),
  ...new Set(DATA.projects.flatMap((project) => project.stack ?? [])),
  'shobyde.com',
  'TypeScript',
  'Cobol',
];

export function createSessionMemory(options = {}) {
  return createWorkingMemory({ subjects: SITE_SUBJECTS, ...options });
}

/** Project titles an answer names, so a turn is remembered by what it produced. */
export function entitiesIn(text) {
  const body = String(text ?? '');
  return DATA.projects.map(shortTitle).filter((name) => body.includes(name));
}

/**
 * A pointer-only follow-up ("and its stack") names no subject, so routing it
 * literally answers about whatever the last sentence happened to mention. The
 * rewrite turns it into the question it means, using the most salient subject
 * and the attribute the question already labelled. When there is no attribute
 * or nothing salient, nothing is rewritten and the visitor gets the old
 * behaviour, which is the honest fallback rather than a guess.
 */
export function resolvePointer(memory, query) {
  const text = String(query ?? '').trim();
  const context = memory.context();
  const subject = context.subject;
  if (!subject) return { query: text, subject: null, rewritten: false };
  const analysis = analyzeQuestion(text, { subjects: SITE_SUBJECTS, context });
  // `slots.subject` is set by the reference itself, so only an explicit name
  // counts as naming something here.
  const namesSomething = analysis.slots.entities.length > 0;
  const pointsBack = Boolean(analysis.slots.reference) || /\b(its|their|that one|the same)\b/i.test(text) || /^and\b/i.test(text);
  if (namesSomething || !pointsBack || !analysis.slots.attribute) {
    return { query: text, subject, rewritten: false };
  }
  return {
    query: `what is ${subject}'s ${analysis.slots.attribute}?`,
    subject,
    rewritten: true,
  };
}

/**
 * The recap. `terse` is the sentence, `normal` adds the newest subject, and
 * `explanatory` adds the count, the same three lengths the register control
 * asks for everywhere else in the panel.
 */
export function coverageAnswer(memory, register = 'normal') {
  const coverage = memory.covered();
  if (coverage.empty) return { text: coverage.sentence, line: 'Checked this session for anything to recap: nothing yet' };
  const turns = memory.turns.length;
  const base = coverage.sentence;
  const newest = memory.salient()[0];
  const text =
    register === 'terse'
      ? base
      : register === 'explanatory'
        ? `${base} That is ${coverage.entities.length} subjects over ${turns} turns, and ${newest ? `${newest.name} is the one still in play` : 'none of them is still in play'}.`
        : `${base}${newest ? ` ${newest.name} is the one still in play.` : ''}`;
  return { text, line: `Read ${turns} turns of this session and ranked what they were about` };
}

export { isCoverageQuery };
