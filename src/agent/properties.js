// A property no stack entry carries, read off the card that describes it
// (rung 26).
//
// "Which projects run locally" names a property, not a technology: no stack
// entry says "local", so the join rule can only answer "no project lists run".
// The card's own prose does describe it, so the honest move is to read that
// prose and quote it. Four things keep this from inventing answers:
//
// 1. Every card opens with the industry problem it rejects ("Meeting note-takers
//    ship your conversations to someone else's server"; "Most AI features ship
//    weights: a download, a GPU requirement"). That first sentence is never
//    evidence. It is the reason "which project needs a GPU" must not answer Boaz.
// 2. A rejection is not a claim anywhere else either: "No model, no API key" and
//    "a GPU requirement are three good reasons for a visitor not to" both name
//    the property in order to deny it.
// 3. Words are weighted by how rare they are across the six cards, and a card
//    needs a word that is not on most cards to qualify. Without that, "app"
//    alone matched five cards for "which project is a desktop app".
// 4. A word matches a whole token or its stem, never a substring, so
//    "machine-drafted" is not evidence for "machine".
import { DATA } from '../data.js';

const shortName = (title) => String(title).split(':')[0].trim();

/** Verbs and nouns that only frame the question; the property is the modifier. */
const FRAME = new Set([
  'which', 'what', 'who', 'one', 'ones', 'project', 'projects', 'card', 'cards', 'of', 'them',
  'these', 'those', 'any', 'all', 'some', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be',
  'does', 'do', 'did', 'has', 'have', 'had', 'can', 'could', 'would', 'should', 'run', 'runs',
  'running', 'work', 'works', 'working', 'operate', 'operates', 'live', 'lives', 'need', 'needs',
  'needing', 'require', 'requires', 'offer', 'offers', 'support', 'supports', 'keep', 'keeps',
  'store', 'stores', 'use', 'uses', 'using', 'get', 'gets', 'make', 'makes', 'built', 'build',
  'ship', 'ships', 'shipped', 'that', 'he', 'his', 'him', 'here', 'page', 'site', 'so', 'it',
  'its', 'they', 'their', 'own', 'on', 'and', 'or', 'but', 'versus', 'vs',
]);

/** Question word -> words a card would use for it. Closed and small on purpose. */
const ALIAS = {
  local: ['on-device', 'local', 'self-hosted', 'offline', 'on the machine'],
  locally: ['on-device', 'local', 'self-hosted', 'offline', 'on the machine'],
  offline: ['offline', 'on-device', 'no cloud', 'nothing leaving', 'local'],
  private: ['no cloud', 'no telemetry', 'on-device', 'private', 'nothing leaving'],
  privacy: ['no cloud', 'no telemetry', 'on-device', 'private', 'nothing leaving'],
  selfhosted: ['self-hosted'],
  hosted: ['self-hosted'],
  gpu: ['gpu'],
  model: ['model', 'llm', 'gguf', 'whisper'],
  models: ['model', 'llm', 'gguf', 'whisper'],
  llm: ['model', 'llm', 'gguf'],
  audio: ['audio', 'microphone'],
  transcribe: ['transcribe', 'captions', 'whisper'],
  transcribes: ['transcribe', 'captions', 'whisper'],
  transcripts: ['transcript', 'transcribe'],
  summarise: ['summarize'],
  summarizes: ['summarize'],
  summarises: ['summarize'],
  desktop: ['desktop', 'macos'],
  browser: ['in-browser', 'browser'],
  daily: ['daily', 'every day'],
  tests: ['test', 'pytest', 'fault', 'conformance'],
  tested: ['test', 'pytest', 'fault', 'conformance'],
  machine: ['machine', 'on-device'],
  data: ['data', 'sqlite', 'ledger', 'transcript'],
  source: ['open source', 'source', 'mit'],
};

/** A sentence that names the property in order to reject it is not evidence. */
const REJECT = /\b(not to|rather than|instead of|reasons? not to|avoid|don't need|do not need|both are gone|never (send|upload|leave))/i;
const NEGATION = /\b(no|not|never|without|nothing|nobody|none|n't)\b/i;
/**
 * A sentence that says nothing on the page carries the word. A card documenting
 * the refusal it gives ("no project stack lists Cobol") names the word without
 * claiming it and without rejecting it either, so it is not evidence in either
 * direction. Without this, the Boaz card quoting our own refusal copy made
 * "which projects use cobol" answer that Boaz names cobol only to avoid it.
 */
const ABSENT = /\bno\s+(?:project|projects|card|cards|stack|stacks|entry|entries|page)\b/i;

const plain = (text) =>
  String(text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalize = (text) =>
  plain(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A token, cut to a stem so "publishes" and "summarizes" reach their word. */
const stem = (word) =>
  String(word)
    .toLowerCase()
    .replace(/[^a-z0-9+#-]/g, '')
    .replace(/ies$/, 'y')
    .replace(/(ing|ed|es|s)$/, '')
    .replace(/e$/, '');

const tokens = (text) => normalize(text).split(' ').filter(Boolean);

/** A hyphenated word ("in-browser") is also its own parts to the word counter. */
const stemsOf = (text) => {
  const out = new Set();
  for (const token of tokens(text)) {
    out.add(stem(token));
    for (const part of token.split('-')) if (part.length > 2) out.add(stem(part));
  }
  return out;
};

/** The card's pitch line ("self-hosted reading for families"), always a claim. */
const subtitleOf = (project) => {
  const title = String(project.title ?? '');
  return title.includes(':') ? plain(title.split(':').slice(1).join(':')).trim() : '';
};

const cache = new WeakMap();

/**
 * Sentences a card makes about itself, original punctuation kept so a quote
 * reads, tagged by where they sit: a pitch line outranks a summary sentence,
 * which outranks an engineering note. The first sentence of every summary is the
 * industry problem the project rejects, so it is skipped.
 */
function claimsOf(project) {
  if (cache.has(project)) return cache.get(project);
  const out = [];
  const subtitle = subtitleOf(project);
  if (subtitle) out.push({ sentence: subtitle, rank: 2 });
  for (const sentence of plain(project.summary).split(/(?<=[.!?])\s+/).filter(Boolean).slice(1)) {
    out.push({ sentence: sentence.trim(), rank: 1 });
  }
  const notes = plain([project.details?.architecture, ...(project.details?.decisions ?? [])].filter(Boolean).join(' '));
  for (const sentence of notes.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    out.push({ sentence: sentence.trim(), rank: 0 });
  }
  cache.set(project, out);
  return out;
}

/**
 * Whole-word mention of the phrase, never a substring: "trustworthy" is not
 * evidence for "rust", which is how a card about the blog made "which projects
 * use rust" answer that the blog names rust only to reject it.
 */
function mentions(sentence, alias) {
  const clean = normalize(sentence);
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, 'i').test(clean);
}

/** Every sentence a card writes about itself, in reading order. */
const proseCache = new WeakMap();
function proseOf(project) {
  if (proseCache.has(project)) return proseCache.get(project);
  const text = [
    subtitleOf(project),
    plain(project.summary),
    plain([project.details?.architecture, ...(project.details?.decisions ?? [])].filter(Boolean).join(' ')),
  ].join(' ');
  const out = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  proseCache.set(project, out);
  return out;
}

/** Does this sentence carry the word as a claim rather than a denial? */
function claims(sentence, alias) {
  const clean = normalize(sentence);
  const windowFor = (at, length) => ({
    before: clean.slice(Math.max(0, at - 30), at),
    after: clean.slice(at, Math.min(clean.length, at + length + 60)),
  });
  const denied = (at, length) => {
    const { before, after } = windowFor(at, length);
    return NEGATION.test(before.split(' ').slice(-4).join(' ')) || REJECT.test(after);
  };
  if (alias.includes(' ')) {
    let at = clean.indexOf(alias);
    while (at >= 0) {
      if (!denied(at, alias.length)) return true;
      at = clean.indexOf(alias, at + alias.length);
    }
    return false;
  }
  const want = stem(alias);
  const tokenPattern = /[a-z0-9+#-]+/g;
  let match;
  while ((match = tokenPattern.exec(clean))) {
    const token = match[0];
    const variants = [stem(token), ...token.split('-').map((part) => stem(part))];
    if (!variants.includes(want)) continue;
    if (!denied(match.index, token.length)) return true;
  }
  return false;
}

const weightCache = new WeakMap();
function weightOf(projects) {
  if (weightCache.has(projects)) return weightCache.get(projects);
  const df = new Map();
  for (const project of projects) {
    for (const token of stemsOf(claimsOf(project).map((entry) => entry.sentence).join(' '))) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  const weight = (word) => Math.log((projects.length + 1) / ((df.get(stem(word)) ?? 0) + 1)) + 0.2;
  const count = (word) => df.get(stem(word)) ?? 0;
  weightCache.set(projects, { weight, count });
  return { weight, count };
}

/** The question's property words, frame removed. */
export function propertyPhrase(question) {
  return tokens(question)
    .filter((word) => !FRAME.has(word) && !/^\d+$/.test(word) && word.length > 2)
    .join(' ');
}

/**
 * The visitor's own words for the property ("a GPU", "self-hosted", "run
 * locally"), so a refusal can quote the question instead of the token list the
 * matcher worked from.
 */
export function surfaceOf(question) {
  const raw = String(question ?? '').replace(/\?+\s*$/, '').replace(/\s+/g, ' ').trim();
  const tail = raw.match(
    /^(?:can you |could you |and |please )?(?:which|what|who)(?:\s+(?:one|ones|project|projects|of them|of these))?\s+(.*)$/i,
  )?.[1] ?? raw;
  // The frame is the verb, not part of the property: "which projects use a GPU"
  // asks about the GPU. Stripping it in a loop is what makes "are built with"
  // read as "built with" rather than leaving the verb in the quoted phrase.
  const VERB = /^(?:(?:is|are|was|were|does|do|did|can|could|needs?|requires?|have|has|had|supports?|offers?|works?|runs?|uses?|using|utilises?|utilizes?|built|written|made|powered|listed|lists?)\b)(?:\s+(?:with|in|on|by))?\s*/i;
  let out = tail;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = out.replace(VERB, '');
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

const candidatesFor = (word) => ALIAS[word] ?? ALIAS[word.replace(/s$/, '')] ?? [word];

/**
 * The projects whose own prose claims the property, best first. Each hit keeps
 * the sentence it came from, so the answer can quote the card instead of
 * summarising it, and the projects that only rejected the property, so an honest
 * "no card claims this" can say who mentioned it anyway.
 */
export function propertyMatches(question, projects = DATA.projects) {
  const phrase = propertyPhrase(question);
  const asked = phrase ? phrase.split(' ').filter((word) => word.length > 2) : [];
  if (!asked.length) return null;

  const { weight, count } = weightOf(projects);
  // A word on more than half the cards is not a property, it is a common noun:
  // "app" matched three cards and made "which project is a desktop app" list
  // most of the page. Dropping it leaves "desktop" to decide on its own.
  const words = asked.filter((word) => count(word) <= projects.length / 2);
  if (!words.length) return { phrase, words, matches: [], mentionedOnly: [], common: true };

  const total = words.reduce((sum, word) => sum + weight(word), 0) || 1;
  const scored = [];
  const mentionedOnly = [];

  for (const project of projects) {
    const sentences = claimsOf(project);
    const hits = new Map();
    for (const word of words) {
      const aliases = candidatesFor(word);
      let best = null;
      for (const entry of sentences) {
        const alias = aliases.find((candidate) => claims(entry.sentence, candidate));
        if (!alias) continue;
        const score = entry.rank;
        if (!best || score > best.score) best = { ...entry, alias, score };
      }
      if (best) hits.set(word, best);
    }
    const gained = [...hits.keys()].reduce((sum, word) => sum + weight(word), 0);
    if (gained / total >= 0.55) {
      const best = [...hits.values()].sort((a, b) => b.score - a.score)[0];
      scored.push({ project, coverage: gained / total, sentence: best.sentence, hit: best.alias });
      continue;
    }
    const denied = words.some((word) =>
      candidatesFor(word).some(
        (alias) =>
          !sentences.some((entry) => claims(entry.sentence, alias)) &&
          proseOf(project).some((sentence) => mentions(sentence, alias) && !ABSENT.test(sentence)),
      ),
    );
    if (denied) mentionedOnly.push(project);
  }
  scored.sort((a, b) => b.coverage - a.coverage);
  return { phrase, words, matches: scored, mentionedOnly };
}

/** The shortest quotable stretch of the card that carries the property. */
export function snippetOf(hit) {
  const sentence = plain(hit?.sentence);
  if (!sentence) return '';
  const clauses = sentence.split(/,\s+/);
  const index = clauses.findIndex((clause) => normalize(clause).includes(hit.hit));
  let out = clauses[index >= 0 ? index : 0];
  if (index > 0 && tokens(out).length < 6) out = `${clauses[index - 1]}, ${out}`;
  if (tokens(out).length > 16) out = tokens(out).slice(0, 16).join(' ');
  return out
    .replace(/^["']|["']$/g, '')
    .replace(/[.,;:]$/, '')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .trim();
}
