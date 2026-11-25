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
import { isStackValue, unresolvedCondition } from './conditions.js';

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
  const memory = createWorkingMemory({ subjects: SITE_SUBJECTS, ...options });
  // What only the host knows about a turn: the split behind a set answer. The
  // library record keeps entities and items; the reason a set was narrowed has
  // no place in the engine, so it lives here, on the session that produced it.
  let notes = [];
  memory.note = (entry) => {
    notes = [...notes.slice(-8), entry];
    return entry;
  };
  memory.lastNote = () => notes[notes.length - 1] ?? null;
  return memory;
}

/** The slug a project is bound by in an inference solution. */
const slugOfTitle = (title) =>
  String(title)
    .split(':')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "a, b and c" for the names a sentence lists. */
function joinNames(names) {
  const list = (names ?? []).filter(Boolean).map(String);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
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

/** Project names keyed by the lowercase form a pointer arrives in. */
const projectsByName = new Map(DATA.projects.map((project) => [shortTitle(project).toLowerCase(), shortTitle(project)]));

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

  // "Which one is bigger?" after a comparison is a question about the two
  // things the previous answer put side by side, not about the page. The page
  // holds a measured code count for each project, so the rewrite names both and
  // the size rule reports the numbers. Two candidates only: with a longer list
  // "which one" has no referent, and answering anyway would be a guess.
  const asksSize =
    /\b(which (one|of them|project)?\s*(is )?(bigger|larger|smaller)|which is (bigger|larger|smaller)|which one has more code|how (big|large) is it)\b/i.test(
      text,
    );
  if (asksSize) {
    const last = summaryLast(memory);
    const byLower = new Map();
    for (const name of [...(last?.items ?? []), ...listed]) {
      const key = String(name).toLowerCase();
      if (!byLower.has(key) && projectsByName.has(key)) byLower.set(key, projectsByName.get(key));
    }
    const candidates = [...byLower.values()];
    if (candidates.length === 2) {
      return {
        query: `compare ${candidates[0]} and ${candidates[1]} by size`,
        subject: candidates[0],
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
 * The reason a set answer was narrowed, kept with the turn (rung 23).
 *
 * "Which projects use python and sqlite" is answered from two conditions, and
 * "why not both?" is a question the engine cannot see: the page has no fact
 * about why, only which project lists what. The note records the split (each
 * condition and the projects that held it) at the turn it was computed, so the
 * follow-up explains the exclusion instead of routing the words somewhere else.
 */
export function rememberSetAnswer(memory, steps, question = '') {
  if (typeof memory?.note !== 'function') return null;
  const inference = (steps ?? []).find(
    (step) =>
      step?.type === 'inference' &&
      (step.solutions ?? []).some((solution) => (solution.bindings ?? solution)?.['?1_T']),
  );
  if (!inference) return null;
  const bySlug = new Map(DATA.projects.map((project) => [slugOfTitle(project.title), shortTitle(project)]));
  const groups = new Map();
  for (const solution of inference.solutions ?? []) {
    // A step event carries the bindings flat; a compose receives them under
    // `bindings`. Accept both, so the note reads the same step either way.
    const bindings = solution.bindings ?? solution;
    const term = bindings['?1_T'];
    const slug = bindings['?P'];
    if (!term || !slug) continue;
    const name = bySlug.get(slug);
    if (!name) continue;
    if (!groups.has(term)) groups.set(term, { term, names: [] });
    const group = groups.get(term);
    if (!group.names.includes(name)) group.names.push(name);
  }
  const turn = memory.turns.length;
  if (groups.size >= 2) return memory.note({ groups: [...groups.values()], turn });
  // One condition resolved and the visitor named a second one: "which projects
  // use python and have a web interface". The page lists no such property, so
  // the turn answers the half it has. "Why not both?" then needs to know the
  // other half existed, or it routes the words somewhere unrelated.
  const [only] = [...groups.keys()];
  // The same reading the answering turn used (src/agent/conditions.js), so the
  // note and the sentence cannot disagree about which condition went unchecked.
  const unresolved = only ? unresolvedCondition(question, only, { minWords: 1 }) : null;
  if (groups.size === 1 && unresolved && !isStackValue(unresolved)) {
    return memory.note({ groups: [...groups.values()], unresolved, turn });
  }
  return null;
}

/** The answer to "why not both?", read from the split the last set answer kept. */
export function exclusionAnswer(memory, question, register = 'normal') {
  const note = typeof memory?.lastNote === 'function' ? memory.lastNote() : null;
  if (!note || (note.groups ?? []).length < 1) return null;
  // Only the turn right after the set answer: a "why not both" three turns
  // later is about whatever came in between, and answering this would be a guess.
  if (note.turn + 1 !== (memory.turns ?? []).length) return null;
  if (!/^\s*why\s+(not|isn'?t|aren'?t|didn'?t|doesn'?t)\b/i.test(String(question ?? ''))) return null;

  const groups = note.groups;
  const terms = groups.map((group) => group.term);
  // One condition was a page value and the other was not: the honest answer is
  // that there is no second side to compare, and naming one would invent it.
  if (groups.length === 1) {
    const only = groups[0];
    const phrase = `"${note.unresolved}"`;
    const claim = `Only ${only.term} is a listed stack value here. ${phrase} is not one, so no project has both.`;
    const text =
      register === 'terse'
        ? `Only ${only.term} is listed. ${phrase} is not.`
        : `${claim} ${joinNames(only.names)} ${only.names.length === 1 ? 'lists' : 'list'} ${only.term}.`;
    return { text, line: `Read the two conditions of the last answer and which of them the stacks list` };
  }
  const shared = groups[0].names.filter((name) => groups.every((group) => group.names.includes(name)));
  const claim = shared.length
    ? `${joinNames(shared)} ${shared.length === 1 ? 'is' : 'are'} the only ${shared.length === 1 ? 'one' : 'ones'} with both ${joinNames(terms)}.`
    : `No project lists both ${joinNames(terms)}.`;
  if (register === 'terse') {
    return { text: claim, line: 'Read the two conditions of the last answer' };
  }
  // Each side says what it has and what it lacks: that is the exclusion, and it
  // is read off the stacks rather than inferred from the sentence above.
  const sides = groups
    .map((group) => {
      const only = group.names.filter((name) => !shared.includes(name));
      if (only.length === 0) return '';
      const missing = terms.filter((term) => term !== group.term);
      return `${joinNames(only)} ${only.length === 1 ? 'lists' : 'list'} ${group.term} and ${only.length === 1 ? 'not' : 'neither lists'} ${missing.length === 1 ? missing[0] : joinNames(missing)}`;
    })
    .filter(Boolean);
  const text = `${claim}${sides.length ? ` ${sides.join('; ')}.` : ''}`;
  return {
    text,
    line: `Read the two conditions of the last answer and which project lists each`,
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
