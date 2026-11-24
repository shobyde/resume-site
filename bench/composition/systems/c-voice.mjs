// Spike C — borrowed voice.
//
// The site has 58 posts written by the person being described. This spike
// harvests his sentence openers (the words up to a colon, dash or comma in a
// real sentence) and his punctuation habits, then hangs the facts off them.
// Every candidate is validated against the required facts; a candidate that
// loses one falls back to a plain clause, so voice never costs accuracy.
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content/posts');

const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

const list = (items) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sentences() {
  const out = [];
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
    const body = fs
      .readFileSync(`${DIR}/${file}`, 'utf8')
      .replace(/^---[\s\S]*?---/, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_`]/g, ' ');
    for (const raw of body.split(/(?<=[.!?])\s+/)) {
      const clean = raw.replace(/\s+/g, ' ').trim();
      if (clean.split(' ').length >= 6 && clean.split(' ').length <= 30) out.push(clean);
    }
  }
  return out;
}

/**
 * Argumentative openers carry a position ("The honest caveat:", "My take:").
 * Reusing them for a plain fact reads as a non-sequitur, so the harvest keeps
 * only framing moves that state nothing on their own.
 */
const STANCE = /\b(caveat|limitation|problem|wrong|mistake|question|instinct|take|point|case|reason|catch|trade-?off|risk|worry|concern|however|but|yet|instead|frankly|honestly)\b/i;

/** Openers he actually uses: the words before a colon or dash, 2–5 words long. */
function harvestOpeners(all) {
  const seen = new Set();
  for (const sentence of all) {
    const match = sentence.match(/^([A-Z][^:—–]{4,42})[:—–]/);
    if (!match) continue;
    const opener = match[1].trim();
    const length = opener.split(' ').length;
    if (length < 2 || length > 5) continue;
    if (/\b(I|my|we|our|you|your)\b/.test(opener)) continue; // the panel speaks about him
    if (/\d/.test(opener)) continue;
    if (STANCE.test(opener)) continue;
    if (/["'()]/.test(opener)) continue;
    seen.add(opener);
  }
  return [...seen];
}

export function voiceSystem(facts) {
  const all = sentences();
  const openers = harvestOpeners(all);
  const names = facts.projects.map((p) => p.name.split(' ')[0]);
  const pyNames = facts.projects
    .filter((p) => p.stack.some((s) => /python/i.test(s)))
    .map((p) => p.name.split(' ')[0]);
  const newest = facts.posts.newest.title.split(':')[0];
  const years = (facts.role.match(/(\d+)\+?\s*years?/) ?? [])[1] ?? '12';

  /** The fact-carrying clause + what it must contain, per intent. */
  const clauses = {
    list_titles: {
      must: names,
      forms: [
        `${list(names)} — ${count(names.length, 'project')}, all of it public.`,
        `${list(names)}.`,
        `${list(names)} — and that is the whole set.`,
      ],
    },
    using_python: {
      must: pyNames,
      forms: [
        `${list(pyNames)} — the ${count(pyNames.length, 'project')} that name Python 3.10+.`,
        `${list(pyNames)}.`,
        `${list(pyNames)}, both of them.`,
      ],
    },
    posts_newest: {
      must: [String(facts.posts.count), newest],
      forms: [
        `${facts.posts.count} posts, the most recent being "${newest}".`,
        `"${newest}", one of ${facts.posts.count}.`,
        `${facts.posts.count} of them; the newest is "${newest}".`,
      ],
    },
    email: { must: [facts.email], forms: [`${facts.email}.`, `${facts.email}, and he answers it.`] },
    linkedin: { must: ['linkedin.com/in/'], forms: [`${facts.linkedin}.`, `${facts.linkedin} — the only one he keeps current.`] },
    summary: {
      must: [years],
      forms: [
        `${years}+ years in software, now managing and still shipping.`,
        `an engineering manager who still writes code, ${years}+ years in.`,
      ],
    },
  };

  return {
    async answer({ question, intent }) {
      const clause = clauses[intent];
      if (!clause) return 'I can answer that from the page.';
      const seed = hash(`${intent}:${question}`);
      const form = clause.forms[seed % clause.forms.length];
      const opener = openers.length ? openers[seed % openers.length] : '';

      const candidates = [
        opener ? `${opener}: ${form}` : '',
        opener ? `${opener} — ${form}` : '',
        form,
      ].filter(Boolean);

      const valid = candidates.find((text) =>
        clause.must.every((needle) => text.toLowerCase().includes(String(needle).toLowerCase())),
      );
      return (valid ?? form).replace(/\s+/g, ' ').trim();
    },
  };
}
