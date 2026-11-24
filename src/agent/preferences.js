// Stated preferences for the site panel (rung 15).
//
// A visitor who says "keep it short" is asserting something about the session,
// not asking about the page. The arithmetic and the `prefers()` assertion live in
// `boaz` (0.7.11 `createPreferenceMemory`); this file declares the one key this
// site can act on, reads the phrasings that state it, and writes the two
// sentences the panel needs: what the session is set to, and why an answer came
// back short.
//
// The refusal is the interesting half. A standing request the site has no
// setting for ("always answer in French", "call me boss") is recognised by shape
// and declined in a sentence. The alternative, which is what shipped before this
// rung, is routing it as a question about the page and answering something
// adjacent, confidently.
import { createPreferenceMemory } from 'boaz';

/** The values this site can act on. Anything else `record()` refuses. */
export const SITE_PREFERENCES = [
  { id: 'register', values: ['terse', 'normal', 'explanatory'], defaultValue: 'normal' },
];

export const preferenceMemory = createPreferenceMemory({ preferences: SITE_PREFERENCES });

const LABELS = {
  terse: 'short answers',
  normal: 'normal answers',
  explanatory: 'fuller answers',
};

export const registerLabel = (value) => LABELS[value] ?? String(value);

/** The assertion behind a preference, for a trace tooltip rather than copy. */
export const preferenceFact = (id, value) => `prefers(${id}, ${String(value).toLowerCase()})`;

const PREFERENCE_QUERY =
  /\b(?:what (?:did|have) i (?:ask|asked|tell|told) (?:you|for)|what(?:'s| is) my (?:preference|setting)|my preferences|what are (?:my|your) (?:preferences|settings)|what are you set to|how are you set|what setting are you)\b/i;

/** A closed phrase list, the same trade every other trigger table here makes. */
export const isPreferenceQuery = (text) => PREFERENCE_QUERY.test(String(text ?? ''));

/**
 * A preference the site cannot serve. Only a standing-request shape counts, and a
 * question never does, so "does he always use typescript" stays a question.
 */
const STANDING = [
  /^(?:please\s+)?(?:always|from now on|forever)\b/i,
  /^(?:please\s+)?(?:call me|address me|refer to me)\b/i,
  /^(?:please\s+)?(?:answer|reply|respond|write|speak|talk)\b[^?]*\b(?:in|like)\b/i,
  /^(?:please\s+)?(?:use|switch to)\b[^?]*\b(?:tone|format|style|language)\b/i,
];
const QUESTION_START = /^(?:what|which|who|whom|where|when|why|how|does|did|is|are|can|could|would|will|has|have|do|may)\b/i;

/** The visitor's sentence when it asks for a setting the site has no value for. */
export function unknownPreference(text) {
  const sentence = String(text ?? '').trim();
  if (!sentence || QUESTION_START.test(sentence)) return null;
  return STANDING.some((pattern) => pattern.test(sentence)) ? sentence : null;
}

export const UNKNOWN_REPLY =
  'I can only change how long an answer is in this session, so I did not act on that.';

/** The trace line for a preference the panel just recorded. */
export function recordLine(entry) {
  if (!entry) return null;
  return {
    type: 'inference',
    label: `Kept for this session: ${registerLabel(entry.value)}`,
    rule: preferenceFact(entry.id, entry.value),
  };
}

/**
 * Why this answer is the length it is. Only a session preference earns this line:
 * an inline cue ("in one line") is a request about one answer, and saying it was
 * remembered would be false.
 */
export function preferenceLine(register) {
  if (register === 'terse') {
    return { type: 'inference', label: 'You asked for short answers, so I kept the claim', rule: preferenceFact('register', 'terse') };
  }
  if (register === 'explanatory') {
    return { type: 'inference', label: 'You asked for fuller answers, so I added a sentence', rule: preferenceFact('register', 'explanatory') };
  }
  return null;
}

/** "what did I ask for?" answered from the store, not from the last answer. */
export function preferenceRecap(store = preferenceMemory, register = 'normal') {
  const value = store.get('register') ?? 'normal';
  const stated = store.stated('register');
  if (!stated.length) {
    const text =
      register === 'terse'
        ? 'Nothing set: normal answers.'
        : 'Nothing set: normal answers. Say "keep it short" or "fuller answers" and I will hold it for this session.';
    return { text, line: 'Checked this session for a stated preference: none yet' };
  }
  const last = stated[stated.length - 1];
  const since = last.utterance ? `you said "${last.utterance}"` : 'your request';
  const changes = stated.length > 1 ? ` That is ${stated.length} changes this session.` : '';
  const wayBack = register === 'normal' && value !== 'normal' ? ' Say "normal answers" to go back.' : '';
  // The recap opens a sentence, so the label is capitalised here and stays
  // lowercase inside the trace line.
  const label = `${LABELS[value].charAt(0).toUpperCase()}${LABELS[value].slice(1)}`;
  const text =
    register === 'terse'
      ? `${label} since ${since}.`
      : `${label}, set when ${since}.${changes}${wayBack}`;
  return {
    text,
    line: `Read this session's preference: ${LABELS[value]}, stated at turn ${last.turn}`,
  };
}
