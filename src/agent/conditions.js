// The condition a question named that no project stack accounts for (rung 25).
//
// A compound ask can resolve one side and not the other: "which projects use
// python and have a web interface". Answering only the half that bound is true
// and still misleading, because the visitor asked for an intersection and got a
// set. The answering turn says which side was not checked, and the follow-up
// ("why not both?") says why from the same reading, so the two cannot disagree
// about what the second condition was.
//
// The check is exact rather than a guess about wording: "no project lists X" is
// printed only when no stack on the page carries every word of X. That is what
// lets a one-word condition ("kubernetes") be spoken about at all.
import { DATA } from '../data.js';

/** Stack entries written as words, so "Python 3.10+" answers "python". */
export const stackWords = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .split(' ')
    .filter((word) => word && !/^[0-9]+$/.test(word));

/** Does one stack entry carry every word of the phrase? */
export const stackHas = (project, term) => {
  const want = stackWords(term);
  if (!want.length) return false;
  return (project.stack ?? []).some((entry) => {
    const have = stackWords(entry);
    return want.every((word) => have.includes(word));
  });
};

/** True when some project lists the phrase, i.e. the phrase is page vocabulary. */
export const isStackValue = (phrase, projects = DATA.projects) => {
  const want = stackWords(phrase);
  if (!want.length) return false;
  return (projects ?? []).some((project) => stackHas(project, phrase));
};

const shortNameOf = (title) => String(title).split(':')[0].trim().toLowerCase();

/** True when the phrase names one of the page's projects, which is not a stack. */
export const namesProject = (phrase, projects = DATA.projects) => {
  const words = stackWords(phrase).join(' ');
  if (!words) return false;
  return (projects ?? []).some((project) => shortNameOf(project.title) === words);
};

/**
 * The phrase a question named after a connective that no stack value accounts
 * for. Closed: it reads the words after the first "and"/"or"/"with" that are
 * not the resolved term, filler, or the question's own frame ("which projects
 * use"), and gives up rather than guessing when nothing is left.
 */
export function unresolvedCondition(question, term, { minWords = 2, projects = DATA.projects } = {}) {
  const words = String(question ?? '').toLowerCase().split(/[^a-z0-9+.#]+/).filter(Boolean);
  const connective = words.findIndex((word) => CONNECTIVES.has(word));
  if (connective < 0) return null;
  const termWords = new Set(stackWords(term));
  const rest = words
    .slice(connective + 1)
    .filter((word) => !termWords.has(word) && !FILLER.has(word));
  if (rest.length < minWords) return null;
  const phrase = rest.join(' ');
  if (namesProject(phrase, projects)) return null;
  return phrase;
}

const CONNECTIVES = new Set(['and', 'or', 'with', 'plus']);
const FILLER = new Set([
  'a', 'an', 'the', 'have', 'has', 'that', 'which', 'uses', 'use', 'using', 'is', 'are', 'be',
  'its', 'it', 'they', 'them', 'their', 'also', 'both', 'either', 'on', 'in', 'for', 'of', 'to',
  'project', 'projects', 'he', 'his', 'him', 'built', 'build', 'shipped', 'ship', 'some', 'any',
]);
