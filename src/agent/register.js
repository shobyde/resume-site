// Register control: the same facts at the length the visitor asked for.
//
// Three registers, one answer path. `terse` keeps the claim, `normal` is the
// answer the rules already composed, and `explanatory` adds one more sentence
// computed from the same records. The visitor chooses with the question ("in
// one line", "in more detail") or for the session ("keep it short"); the choice
// is held in this module for the life of the page, never sent anywhere.
//
// The cue is stripped from the question before routing, because "which projects
// use python, in one line" is the same question as "which projects use python"
// and must resolve to the same capability.

export const REGISTERS = ['terse', 'normal', 'explanatory'];

let session = 'normal';
let pending = null;

/** The register the session is set to ("keep it short" holds until it changes). */
export const currentRegister = () => session;

/** The register this answer uses: the cue in the question, else the session. */
export const answerRegister = () => pending ?? session;

/** Called by the host after a turn, so a one-off cue does not stick. */
export const endTurn = () => {
  pending = null;
};

export function setRegister(register) {
  session = REGISTERS.includes(register) ? register : 'normal';
  return session;
}

export const resetRegister = () => {
  pending = null;
  setRegister('normal');
};

const TERSE_CUE =
  /\b(?:in (?:one|a single|1) (?:line|sentence)|one[- ]line|one sentence|briefly|just the (?:names?|list|titles)|short version|tl;?dr|keep (?:it|answers?) (?:short|brief)|be (?:brief|terse))\b/i;
const EXPLAIN_CUE =
  /\b(?:in (?:more |full )?detail|explain|more detail|full answer|walk me through|elaborate|tell me more|go deeper|fuller answers|longer answers)\b/i;

const PURE_TERSE = /^\s*(?:please\s+)?(?:keep (?:it|answers?) (?:short|brief)|be (?:brief|terse)|shorter answers|short answers)(?: from now on| please)?[.!]?\s*$/i;
const PURE_EXPLAIN = /^\s*(?:please\s+)?(?:fuller answers|longer answers|more detail (?:please|from now on)?|explain more)(?: please)?[.!]?\s*$/i;
const PURE_NORMAL = /^\s*(?:please\s+)?(?:normal answers|regular answers|answers as usual|that is enough detail|enough detail)(?: please)?[.!]?\s*$/i;

const CONFIRM = {
  terse: 'Short answers from here.',
  normal: 'Back to normal answers.',
  explanatory: 'Fuller answers from here.',
};

const TRIM = /^[\s,;:]+|[\s,;:]+$/g;

/** Cut a matched cue out of the question, with the comma it came with. */
function cut(text, match) {
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const glued = `${before} ${after}`.replace(/\s+/g, ' ').replace(/\s+([,.;:?!])/g, '$1');
  return glued.replace(TRIM, '');
}

/**
 * Read the register a question asks for.
 *
 * Returns the cleaned question, the register the answer should use (an explicit
 * cue wins over the session), whether the choice persists, and a reply when the
 * whole message was the preference rather than a question.
 */
export function readRegister(query) {
  const text = String(query ?? '');
  const pureNormal = !PURE_TERSE.test(text) && !PURE_EXPLAIN.test(text) && PURE_NORMAL.test(text);
  if (pureNormal) {
    setRegister('normal');
    return { cleaned: '', register: 'normal', cue: 'normal', sticky: true, preference: true, reply: CONFIRM.normal };
  }
  const pureTerse = PURE_TERSE.test(text);
  const pureExplain = !pureTerse && PURE_EXPLAIN.test(text);

  if (pureTerse || pureExplain) {
    const register = pureTerse ? 'terse' : 'explanatory';
    setRegister(register);
    pending = register;
    return { cleaned: '', register, cue: register, sticky: true, preference: true, reply: CONFIRM[register] };
  }

  const terse = TERSE_CUE.exec(text);
  const explain = terse ? null : EXPLAIN_CUE.exec(text);
  const match = terse ?? explain;
  if (!match) {
    pending = null;
    return { cleaned: text.trim(), register: session, cue: null, sticky: false, preference: false, reply: '' };
  }

  const cue = terse ? 'terse' : 'explanatory';
  const cleaned = cut(text, match)
    .replace(/\b(?:from now on|for the rest of this|keep it that way)\b/i, '')
    .replace(/[\s,;]+(?:and|but|please|so)$/i, '')
    .replace(TRIM, '');
  const sticky = /\bfrom now on\b/i.test(text);
  if (sticky) setRegister(cue);
  pending = cue;
  // "explain" on its own is a request about the previous answer, not a noun in
  // the question; with nothing left to route, the session register answers.
  return { cleaned, register: answerRegister(), cue, sticky, preference: false, reply: '' };
}
