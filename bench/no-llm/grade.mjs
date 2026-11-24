/**
 * The grader for the slot-filling suites (taxonomy, negation, reference,
 * compound, synonyms), split out of run.mjs so the browser scorecard at
 * /labs/no-llm/ grades with the same code the Node harness does. Two graders
 * are one too many: a page that re-implemented this would report numbers that
 * disagree with `npm run bench:no-llm` and nobody would know which to trust.
 *
 * Everything here is pure and dependency-free on purpose (no node imports).
 */

export function baselineType(query) {
  const s = query.toLowerCase().trim();
  if (/^compare\b/.test(s)) return 'compare';
  if (/\b(vs\.?|versus)\b/.test(s)) return 'compare';
  const lead = s.match(/^(?:can you |could you |please |and )?(who|what|where|when|why|which|how)\b/);
  if (!lead) return 'unknown';
  if (lead[1] === 'how') return /^how (many|much)\b/.test(s) ? 'how-many' : 'unknown';
  return lead[1];
}

const NEGATION_WORD = /\b(?:not|except|excluding|excludes?|besides|without|other than|apart from|anything but)\b/;

/**
 * The hand-written version of a compound check: one connective for the whole
 * sentence, whichever appears first anywhere in it. It gets "python and
 * sqlite" right and misreads "sqlite and not python", where the second name is
 * excluded rather than joined.
 */
export function baselineCombine(query, entities) {
  if (entities.length < 2) return null;
  const text = query.toLowerCase();
  const or = text.search(/\b(?:or|either)\b/);
  const and = text.search(/\b(?:and|plus|with|both)\b/);
  if (or < 0 && and < 0) return null;
  return or >= 0 && (and < 0 || or < and) ? 'any' : 'all';
}

/**
 * The hand-written entity scan: every declared subject whose words appear in
 * the query, in order of appearance, no stemming and no negation awareness.
 * Used for the compound class so its baseline is a real attempt rather than a
 * straw man that finds no names at all.
 */
export function baselineSubjects(query, subjects) {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const found = [];
  for (const subject of subjects) {
    const needle = subject
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, ' ')
      .split(/\s+/)
      .filter((word) => word && !/^[0-9]+$/.test(word));
    if (needle.length === 0) continue;
    for (let start = 0; start < words.length; start += 1) {
      let at = 0;
      for (let i = start; i < words.length && at < needle.length; i += 1) {
        if (/^[0-9]+$/.test(words[i])) continue;
        if (words[i] !== needle[at]) break;
        at += 1;
      }
      if (at === needle.length) {
        found.push({ subject, at: start });
        break;
      }
    }
  }
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.subject);
}

/** The subject's own first word, which is what a hand-written scan would look for. */
function anchor(subject) {
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !['the', 'a', 'an'].includes(word));
  return words[0] ?? '';
}

export function baselineExclusions(query, subjects) {
  const text = query.toLowerCase();
  const out = [];
  for (const subject of subjects) {
    const word = anchor(subject);
    if (!word) continue;
    const at = text.search(new RegExp(`\\b${word}`));
    if (at < 0) continue;
    if (NEGATION_WORD.test(text.slice(0, at))) out.push(subject);
  }
  return out;
}

export function baselineAnalysis(query, subjects = [], context = {}) {
  // A hand-written pointer scan: any pronoun resolves to whatever the last turn
  // was about, ordinals resolve to nothing, and a partial name only matches when
  // it is the whole name.
  const saysPronoun = /\b(?:he|him|his|she|her|it|its|that|this|those|these|they|them)\b/.test(
    query.toLowerCase(),
  );
  // `context.naive` turns on the substring entity scan (compound suite); the
  // earlier suites keep their recorded baselines, which extracted no entities.
  const naive = context.naive ? baselineSubjects(query, subjects) : [];
  return {
    type: baselineType(query),
    slots: {
      entities: naive,
      attribute: null,
      subject: naive[0] ?? null,
      newest: null,
      referenced: saysPronoun,
      reference: saysPronoun && context.subject ? { kind: 'pronoun', value: context.subject, cue: 'pronoun' } : null,
      exclude: baselineExclusions(query, subjects),
      combine: context.naive ? baselineCombine(query, naive) : null,
      mentions: [],
    },
  };
}

const sameSet = (a = [], b = []) =>
  a.length === b.length && [...a].sort().every((value, i) => value === [...b].sort()[i]);

export function scoreTask(task, analysis) {
  const want = task.expect;
  const problems = [];
  if (want.type && analysis.type !== want.type) problems.push(`type ${analysis.type} != ${want.type}`);
  for (const entity of want.entities ?? []) {
    if (!analysis.slots.entities.includes(entity)) problems.push(`missing entity ${entity}`);
  }
  if (want.attribute && analysis.slots.attribute !== want.attribute) {
    problems.push(`attribute ${analysis.slots.attribute} != ${want.attribute}`);
  }
  const got = analysis.slots.exclude ?? [];
  if (want.exclude && !sameSet(got, want.exclude)) {
    problems.push(`exclude [${got.join(', ')}] != [${want.exclude.join(', ')}]`);
  }
  const leaked = got.filter((subject) => analysis.slots.entities.includes(subject));
  if (leaked.length) problems.push(`excluded but counted as entity: ${leaked.join(', ')}`);
  if ('reference' in want) {
    const resolved = analysis.slots.reference?.value ?? null;
    if (resolved !== want.reference) problems.push(`reference ${resolved} != ${want.reference}`);
  }
  if ('combine' in want) {
    const op = analysis.slots.combine?.op ?? null;
    if (op !== want.combine) problems.push(`combine ${op} != ${want.combine}`);
  }
  return { ok: problems.length === 0, problems };
}
