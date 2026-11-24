// Spike B — slot grammar with discourse.
//
// Facts fill typed slots rather than whole sentences. Each intent owns several
// constructions (lead with the count, lead with the entities, lead with the
// stack); the question form narrows the set and the question's hash picks inside
// it. Agreement follows the count, and a follow-up ("and?", "both?") refers back
// instead of repeating.

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

const CONTINUATION = /^(and|both|those|that one|what about|either|the other)\b/i;
const HOW_MANY = /\b(how many|how much|number of|count)\b/i;
const WHICH = /\b(which|what)\b.*\b(use|uses|using|built with|written in|run|runs)\b/i;

export function grammarSystem(facts) {
  const named = facts.projects.map((p) => p.name.split(' ')[0]);
  const python = facts.projects.filter((p) => p.stack.some((s) => /python/i.test(s)));
  const pyNames = python.map((p) => p.name.split(' ')[0]);
  const pyStack = python[0]?.stack.find((s) => /python/i.test(s)) ?? 'Python 3.10+';
  const newest = facts.posts.newest.title.split(':')[0];
  const posts = facts.posts.count;
  const years = (facts.role.match(/(\d+)\+?\s*years?/) ?? [])[1] ?? '12';
  let lastEntities = [];

  const pick = (forms, seed) => forms[seed % forms.length];
  const tidy = (text) => text.replace(/\s+/g, ' ').trim();

  const banks = {
    list_titles: [
      () => `${count(named.length, 'project')}: ${join(named)}.`,
      () => `${join(named)} — ${count(named.length, 'of them')}, each shipped.`,
      () => `He has shipped ${String(named.length).toLowerCase() === '5' ? 'five' : named.length}: ${join(named)}.`,
      () => `Everything public, in one line: ${join(named)}.`,
    ],
    using_python: [
      () => `${join(pyNames)} — ${count(pyNames.length, 'project')} on ${pyStack.split(' ')[0]}.`,
      () => `${count(pyNames.length, 'project')} use Python: ${join(pyNames)}.`,
      () => `Python appears in ${join(pyNames)}; both list ${pyStack}.`,
      () => `${join(pyNames)} name ${pyStack} in their stack.`,
    ],
    posts_newest: [
      () => `${posts} posts; the newest is "${newest}".`,
      () => `The newest is "${newest}", one of ${posts}.`,
      () => `${posts} published, ending with "${newest}".`,
      () => `"${newest}" — number ${posts}, most recent first.`,
    ],
    email: [() => `${facts.email}.`, () => `${facts.email}, and he answers it.`],
    linkedin: [() => `${facts.linkedin}.`, () => `${facts.linkedin} — the one he keeps current.`],
    summary: [
      () => `Engineering manager and individual contributor, ${years}+ years in software.`,
      () => `${years}+ years in software, now managing and still writing code.`,
      () => `An engineering manager who still ships, ${years}+ years across APIs and cloud systems.`,
    ],
  };

  const details = {
    list_titles: `Hobnob is the largest of them: a meeting recorder that never leaves the machine.`,
    using_python: `Both keep the dependency explicit in their stack.`,
    posts_newest: `That is one a day, roughly, since the log started.`,
    email: `Mail is the fastest route; LinkedIn works too.`,
    linkedin: `He does not keep a second profile.`,
    summary: `Most of that has been client-facing work, plus a year teaching CS before work hours.`,
  };

  return {
    async answer({ question, intent }) {
      const seed = hash(question);
      if (CONTINUATION.test(question.trim())) {
        if (lastEntities.length > 1) return `Both of them — ${join(lastEntities)}.`;
        if (lastEntities.length === 1) return `Just the one: ${lastEntities[0]}.`;
        return 'Which one do you mean?';
      }

      const bank = banks[intent] ?? banks.list_titles;
      let text = pick(bank, seed)();

      if (intent === 'using_python' && WHICH.test(question) && pyNames.length > 1) {
        text = `${join(pyNames)} — ${count(pyNames.length, 'project')} on ${pyStack.split(' ')[0]}.`;
      }
      if (intent === 'list_titles' && HOW_MANY.test(question)) {
        text = `${count(named.length, 'project')}: ${join(named)}.`;
      }

      // A second sentence only when it adds a fact rather than a flourish.
      if (seed % 3 === 0 && details[intent]) text = `${text} ${details[intent]}`;

      lastEntities = intent === 'using_python' ? pyNames : intent === 'list_titles' ? named : [];
      return tidy(text);
    },
  };
}
