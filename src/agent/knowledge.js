// The knowledge and answer rules the site's assistant runs on. Shared by the
// panel (src/agent/assistant.js) and the live console on /client-agent/.
import { KnowledgeBase, fact } from 'client-agent/rules';

/**
 * Nothing about the projects is copied into a fact table: the assistant calls
 * the page's own `projects.list` capability and reasons over what it returns.
 * Contact details are not declared at all, so they are read off the page.
 */
const slugOf = (title) =>
  String(title)
    .split(':')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function createAssistantKnowledge({ posts }) {
  const knowledge = new KnowledgeBase({
    facts: [],
    rules: [
      'projects_using(?P) :- uses(?P, ?T), asked(?T).',
      // Declared facts would come first if there were any; the page scan is the
      // fallback, and the only way an undeclared address can be answered.
      'email(?V) :- field(email, ?V).',
      'linkedin(?V) :- field(linkedin, ?V).',
    ],
  });

  const projectFacts = (result) =>
    (result?.projects ?? []).flatMap((project) => {
      const slug = slugOf(project.title);
      return [
        fact('project', slug, String(project.title).split(':')[0].trim()),
        ...(project.stack ?? []).map((tech) => fact('uses', slug, tech)),
      ];
    });

  const answers = [
    {
      id: 'projects.using',
      title: 'Which projects use a technology',
      keywords: ['which projects use', 'built with', 'written in', 'uses', 'stack'],
      goal: 'projects_using(?P)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      explain: ({ solutions, terms, mentions, observed }) => {
        if (!observed['projects.list']) return 'Read the project list';
        const tech = terms.join(' or ') || mentions[0] || 'that';
        if (solutions.length === 0) return `Read the project list: no stack lists ${tech}`;
        return `Read the project list and matched ${tech} against ${solutions.length} project${solutions.length === 1 ? '' : 's'}`;
      },
      compose: ({ solutions, terms, mentions, observed, knowledge: kb }) => {
        if (solutions.length === 0) {
          // The tool ran, so "no stack lists TypeScript" is a fact about the
          // page, not a shrug. Without the tool result there is nothing to say.
          if (!observed['projects.list']) return '';
          const asked = terms.join(' or ') || mentions[0];
          return asked ? `No project stack lists ${asked}.` : '';
        }
        const titles = solutions
          .map(
            (solution) =>
              kb
                .query('project(?P, ?T)', { assume: [['asked', solution.bindings['?P'] ?? '']] })
                .find((hit) => hit.bindings['?P'] === solution.bindings['?P'])?.bindings['?T'] ??
              solution.bindings['?P'],
          )
          .filter(Boolean);
        if (titles.length === 0) return '';
        const list =
          titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}`;
        return `${list} ${titles.length === 1 ? 'uses' : 'use'} it.`;
      },
    },
    {
      id: 'projects.list_titles',
      title: 'List the projects',
      keywords: ['list projects', 'which projects', 'what has he built', 'project names', 'what did he build'],
      goal: 'project(?P, ?T)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      // Both rules read the same tool, so the join rule must win whenever the
      // question names a technology: keep this one for plain "list" questions.
      threshold: 2.4,
      explain: ({ solutions }) => `Read the project list: ${solutions.length} projects`,
      compose: ({ solutions }) => {
        if (solutions.length === 0) return '';
        const titles = solutions.map((solution) => solution.bindings['?T']).filter(Boolean);
        return titles.length > 1
          ? `He has shipped ${titles.length} projects: ${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}.`
          : `He has shipped one project here: ${titles[0]}.`;
      },
    },
    {
      id: 'contact.email',
      title: 'His email address',
      keywords: ['email', 'e-mail', 'mail him', 'reach him', 'contact him', 'write to him'],
      goal: 'email(?V)',
      compose: ({ bindings, observed }) =>
        bindings['?V'] ? `His email is ${bindings['?V']}.` : '',
      explain: ({ solutions }) =>
        solutions.length ? 'Read the email address off this page' : 'Looked for an email address on this page',
    },
    {
      id: 'contact.linkedin',
      title: 'His LinkedIn profile',
      keywords: ['linkedin', 'his profile', 'social'],
      goal: 'linkedin(?V)',
      compose: ({ bindings }) => (bindings['?V'] ? `His LinkedIn is ${bindings['?V']}.` : ''),
      explain: () => 'Read the LinkedIn link off this page',
    },
    {
      id: 'posts.newest',
      title: 'The newest article',
      keywords: ['newest post', 'latest article', 'last thing he wrote', 'how many posts'],
      goal: 'post_newest(?T)',
      steps: [
        {
          capabilityId: 'blog.stats',
          toFacts: (result) => [
            fact('post_count', String(result?.posts ?? 0)),
            fact('post_newest', String(result?.newest ?? '')),
          ],
        },
      ],
      explain: ({ observed }) => {
        const count = observed['blog.stats']?.posts;
        return count ? `Read the log: ${count} posts, took the most recent` : 'Read the log for the newest post';
      },
      compose: ({ bindings, lookup }) => {
        const newest = bindings['?T'];
        const count = lookup('post_count(?N)')[0]?.bindings['?N'];
        if (!newest) return '';
        return count
          ? `${count} posts are published, and the newest is "${newest}".`
          : `The newest post is "${newest}".`;
      },
    },
  ];

  return { knowledge, answers };
}
