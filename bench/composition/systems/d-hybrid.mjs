// Spike D — hybrid: B's construction choice, A's surface variation.
//
// The construction follows the question form (count-first for "how many",
// entity-first for "which"), then two or three realisations of that construction
// are picked by hash. Same facts, different sentence shape and different words.

const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

const join = (items) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const HOW_MANY = /\b(how many|how much|number of|count)\b/i;
const WHICH = /\b(which|what)\b.*\b(use|uses|using|built with|written in|run|runs)\b/i;
const CONTINUATION = /^(and|both|those|that one|what about|either|the other)\b/i;

export function hybridSystem(facts) {
  const named = facts.projects.map((p) => p.name.split(' ')[0]);
  const python = facts.projects.filter((p) => p.stack.some((s) => /python/i.test(s)));
  const pyNames = python.map((p) => p.name.split(' ')[0]);
  const pyStack = python[0]?.stack.find((s) => /python/i.test(s)) ?? 'Python 3.10+';
  const newest = facts.posts.newest.title.split(':')[0];
  const posts = facts.posts.count;
  const years = (facts.role.match(/(\d+)\+?\s*years?/) ?? [])[1] ?? '12';
  let lastEntities = [];

  // construction -> realisations
  const constructions = {
    list_titles: {
      count: [
        `${count(named.length, 'project')}: ${join(named)}.`,
        `Five of them, in order of how much of his life they ate: ${join(named)}.`,
        `${named.length} in total — ${join(named)}.`,
      ],
      entity: [
        `${join(named)} — ${count(named.length, 'of them')}, every one shipped.`,
        `${join(named)}. That is the public list.`,
        `Everything he has shipped is public: ${join(named)}.`,
      ],
    },
    using_python: {
      count: [
        `${count(pyNames.length, 'project')} use Python: ${join(pyNames)}.`,
        `Two of them name it, ${join(pyNames)}.`,
        `Just ${join(pyNames)} — ${pyNames.length} out of ${named.length}.`,
      ],
      entity: [
        `${join(pyNames)} — ${count(pyNames.length, 'project')} on ${pyStack.split(' ')[0]}.`,
        `${join(pyNames)} both list ${pyStack}.`,
        `Python shows up in ${join(pyNames)}; nothing else claims it.`,
      ],
    },
    posts_newest: {
      count: [
        `${posts} posts; the newest is "${newest}".`,
        `${posts} of them, ending with "${newest}".`,
        `That is ${posts} entries, most recently "${newest}".`,
      ],
      entity: [
        `The newest is "${newest}", one of ${posts}.`,
        `"${newest}" — number ${posts}, if you are counting.`,
        `"${newest}" is the latest; ${posts} in all.`,
      ],
    },
    email: {
      count: [`${facts.email}.`, `One address: ${facts.email}.`, `Mail goes to ${facts.email}.`],
      entity: [`${facts.email} — and he answers it.`, `${facts.email} works.`, `Try ${facts.email}.`],
    },
    linkedin: {
      count: [`${facts.linkedin}.`, `One profile: ${facts.linkedin}.`, `${facts.linkedin}.`],
      entity: [`${facts.linkedin} — the one he keeps current.`, `He is at ${facts.linkedin}.`, `That would be ${facts.linkedin}.`],
    },
    summary: {
      count: [
        `Engineering manager and individual contributor, ${years}+ years in software.`,
        `${years}+ years in, managing and still writing code.`,
        `${years}+ years of APIs, cloud systems and client-facing apps, now with a team.`,
      ],
      entity: [
        `An engineering manager who still ships, ${years}+ years in.`,
        `He manages engineers and writes code — ${years}+ years, mostly client-facing work.`,
      ],
    },
  };

  const details = {
    list_titles: 'Hobnob is the largest of them: a meeting recorder that never leaves the machine.',
    using_python: 'Both keep the dependency explicit in their stack.',
    posts_newest: 'Roughly one a day since the log started.',
    email: 'Mail is the fastest route.',
    linkedin: 'He does not keep a second profile.',
    summary: 'A year of that was teaching CS at a high school, before work hours.',
  };

  return {
    async answer({ question, intent }) {
      if (CONTINUATION.test(question.trim())) {
        if (lastEntities.length > 1) return `Both of them — ${join(lastEntities)}.`;
        if (lastEntities.length === 1) return `Just the one: ${lastEntities[0]}.`;
        return 'Which one do you mean?';
      }

      const bank = constructions[intent] ?? constructions.list_titles;
      const seed = hash(question);
      const form = HOW_MANY.test(question) ? bank.count : WHICH.test(question) ? bank.entity : seed % 2 ? bank.entity : bank.count;
      const list = form ?? bank.entity;
      let text = list[seed % list.length];

      if (seed % 4 === 0 && details[intent]) text = `${text} ${details[intent]}`;

      lastEntities = intent === 'using_python' ? pyNames : intent === 'list_titles' ? named : [];
      return text.replace(/\s+/g, ' ').trim();
    },
  };
}
