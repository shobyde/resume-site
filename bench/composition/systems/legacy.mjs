// The composers as they were before the spikes were ported (v0.5.x/0.6.x site).
// Kept so the before/after numbers are measured with the same metric, not
// remembered from a different one.
const join = (items) =>
  items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export function legacySystem(facts) {
  const names = facts.projects.map((p) => p.name.split(' ')[0]);
  const pyNames = facts.projects
    .filter((p) => p.stack.some((s) => /python/i.test(s)))
    .map((p) => p.name.split(' ')[0]);
  return {
    async answer({ intent }) {
      if (intent === 'list_titles') {
        return names.length > 1
          ? `He has shipped ${names.length} projects: ${join(names)}.`
          : `He has shipped one project here: ${names[0]}.`;
      }
      if (intent === 'using_python') return `${join(pyNames)} use it.`;
      if (intent === 'email') return `His email is ${facts.email}.`;
      if (intent === 'linkedin') return `His LinkedIn is ${facts.linkedin}.`;
      if (intent === 'posts_newest') {
        return `${facts.posts.count} posts are published, and the newest is "${facts.posts.newest.title.split(':')[0]}".`;
      }
      return 'Sho is a software engineer with twelve years of experience building web applications and platforms.';
    },
  };
}
