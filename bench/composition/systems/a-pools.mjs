// Spike A — phrase pools.
//
// Each intent keeps several whole-sentence variants of the same claim; the
// question picks one by hash, so paraphrases of the same intent get different
// wording while a repeated question stays identical. No grammar, no state.

const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

const pick = (list, key) => list[hash(key) % list.length];

const list = (items) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function poolSystem(facts) {
  const names = facts.projects.map((p) => p.name.split(' ')[0]);
  const pyProjects = facts.projects
    .filter((p) => p.stack.some((s) => /python/i.test(s)))
    .map((p) => p.name.split(' ')[0]);
  const newest = facts.posts.newest.title.split(':')[0];
  const count = facts.posts.count;
  const years = (facts.role.match(/(\d+)\+?\s*years?/) ?? [])[1] ?? '12';

  const pools = {
    list_titles: [
      `${plural(facts.projects.length, 'project')} are public: ${list(names)}.`,
      `He has shipped ${plural(facts.projects.length, 'project')}: ${list(names)}.`,
      `Cutting to it — ${list(names)}.`,
      `The list is ${list(names)}, ${facts.projects.length} in all.`,
      `${list(names)}. That is the whole public set.`,
    ],
    using_python: [
      `${list(pyProjects)}: both list Python 3.10+.`,
      `${plural(pyProjects.length, 'project')} use Python — ${list(pyProjects)}.`,
      `Python shows up in ${list(pyProjects)}.`,
      `${list(pyProjects)} both run it.`,
      `Two of them, ${list(pyProjects)}, name Python 3.10+ in their stack.`,
    ],
    posts_newest: [
      `${count} posts so far. The newest is "${newest}".`,
      `That is ${count} entries; the latest is "${newest}".`,
      `${count} posts, most recently "${newest}".`,
      `The log has ${count} posts, ending with "${newest}".`,
      `"${newest}" — number ${count}, if you are counting.`,
    ],
    email: [
      `${facts.email}.`,
      `Best address: ${facts.email}.`,
      `He answers at ${facts.email}.`,
      `${facts.email} works.`,
      `That would be ${facts.email}.`,
    ],
    linkedin: [
      `${facts.linkedin}.`,
      `He is on LinkedIn at ${facts.linkedin}.`,
      `${facts.linkedin} — that is the profile.`,
      `Try ${facts.linkedin}.`,
    ],
    summary: [
      `Engineering manager and individual contributor, ${years}+ years in software — APIs, cloud systems, client-facing apps.`,
      `${years}+ years in software, now managing and still building: APIs, cloud systems, front ends.`,
      `He manages engineers and writes code: ${years}+ years across APIs, cloud, and client-facing applications.`,
      `An engineering manager who still ships, ${years}+ years in.`,
    ],
  };

  return {
    async answer({ question, intent }) {
      const pool = pools[intent] ?? [`I can answer ${intent}.`];
      return pick(pool, `${intent}:${question}`);
    },
  };
}
