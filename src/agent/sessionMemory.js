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
import { analyzeQuestion, createWorkingMemory, isCoverageQuery } from '@shobyde/boaz';
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
  // The lead sentence names what the answer is about; later ones mention things
  // only to contrast with them ("Boaz takes the other route"), and counting
  // those as the answer's subjects is how "the other one" lost its referent.
  const body = String(text ?? '').split(/(?<=[.!?])\s+/)[0];
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
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, last: -1 };

/** The last recorded turn, which is what a pointer resolves against. */
function summaryLast(memory) {
  const turns = memory.turns ?? [];
  return turns[turns.length - 1];
}

/** Descriptions a visitor uses instead of a name, matched to the project they mean. */
const DESCRIPTIONS = [
  [/reading|books|kid/, 'Readback'],
  [/meeting|notes|record/, 'Hobnob'],
  [/generated|interface|conformance/, 'Groundglass'],
  [/no.model|browser assistant/, 'Boaz'],
];

export function resolvePointer(memory, query) {
  const text = String(query ?? '').trim();
  const context = memory.context();
  const subject = context.subject;
  const analysis = analyzeQuestion(text, { subjects: SITE_SUBJECTS, context });
  const listed = Array.isArray(summaryLast(memory)?.entities) ? summaryLast(memory).entities : [];

  // "The reading one" names a description, not a subject. The description map
  // turns it into the project it means, so the attribute question lands there.
  // Only a question that points ("the reading one", "that project") is a
  // description; a normal question that happens to contain a description word
  // ("a web interface") is about its own subject, not this one.
  const pointsAtAThing = /\b(the one|the\s+.+?\s+one|that one|the .+ project)\b/i.test(text);
  const described = pointsAtAThing
    ? DESCRIPTIONS.find(([pattern]) => pattern.test(String(text).toLowerCase()))?.[1]
    : undefined;
  if (described) {
    return {
      query: analysis.slots.attribute ? `what is ${described}'s ${analysis.slots.attribute}?` : `tell me about ${described}`,
      subject: described,
      rewritten: true,
    };
  }

  // A pointer into the list the last answer produced. "The third one" is not a
  // question about the page; it is a question about the sentence above it, and
  // only the session can answer it.
  const ordinal = String(text).toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth|last)\b/)?.[1];
  if (ordinal && listed.length > 1) {
    const index = ordinal === 'last' ? listed.length - 1 : ORDINALS[ordinal] - 1;
    const target = listed[index];
    if (target) {
      return {
        query: analysis.slots.attribute ? `what is ${target}'s ${analysis.slots.attribute}?` : `tell me about ${target}`,
        subject: target,
        rewritten: true,
      };
    }
  }

  // "Not readback, the other one": the exclusion names what to drop, and the
  // answer above names what is left. One candidate is a pointer; two is a guess,
  // so the rewrite stays out of it.
  if (/\b(the other one|the other|the rest)\b/i.test(text)) {
    const named = (analysis.slots.entities ?? []).map((name) => String(name).toLowerCase());
    const negated = SITE_SUBJECTS.filter((name) =>
      new RegExp(`\\bnot\\s+${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text),
    ).map((name) => name.toLowerCase());
    const excluded = [...new Set([...(analysis.slots.exclude ?? []).map((name) => String(name).toLowerCase()), ...negated, ...named])];
    // Only projects are candidates: the memory also records stack constants the
    // answer named ("Python 3.10+"), and those are not things you can point at.
    const projects = DATA.projects.map((project) => shortTitle(project).toLowerCase());
    const remaining = listed.filter(
      (name) => projects.includes(String(name).toLowerCase()) && !excluded.includes(String(name).toLowerCase()),
    );
    if (excluded.length && remaining.length === 1) {
      return {
        query: analysis.slots.attribute ? `what is ${remaining[0]}'s ${analysis.slots.attribute}?` : `tell me about ${remaining[0]}`,
        subject: remaining[0],
        rewritten: true,
      };
    }
  }

  // Navigation is a place, and "now the blog" is a place too. A nav turn makes
  // the next bare destination readable as one.
  const bareNav = String(text).trim().match(/^(?:and\s+|now\s+|then\s+)?the\s+(blog|projects|contact|about|archive|resume|top)\b/i)?.[1];
  if (bareNav) {
    return { query: `take me to the ${bareNav.toLowerCase()}`, subject: null, rewritten: true };
  }

  // A privacy follow-up names no attribute and no subject: "does it send
  // anything to a server". The subject is the thing still in play.
  if (subject && /\b(send|upload|server|cloud)\b/i.test(text)) {
    return { query: `does ${subject} send data to a server?`, subject, rewritten: true };
  }

  if (!subject) return { query: text, subject: null, rewritten: false };
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
