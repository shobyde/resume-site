// The knowledge and answer rules the site's assistant runs on. Shared by the
// panel (src/agent/assistant.js) and the live console on /boaz/.
import { KnowledgeBase, fact } from 'boaz/rules';
import { DATA } from '../data.js';
import {
  phraseEmail,
  phraseProfile,
  phraseLinkedin,
  phraseNewestPost,
  phraseProjectList,
  phraseProjectsUsing,
  phraseProjectsUsingAll,
  shortName,
} from './phrasing.js';

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

/**
 * A project has a technology when its stack names it. Compared as words, not as
 * strings, so "Python 3.10+" answers "python" and the digits do not have to be
 * repeated. Used by the intersection form, where the union's `asked()` join
 * would return a project that has only one of the two.
 */
const stackWords = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .split(' ')
    .filter((word) => word && !/^[0-9]+$/.test(word));

const stackHas = (project, term) => {
  const want = stackWords(term);
  if (want.length === 0) return false;
  return (project.stack ?? []).some((entry) => {
    const have = stackWords(entry);
    return want.every((word) => have.includes(word));
  });
};

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
      id: 'profile.who',
      title: 'Who he is',
      keywords: [
        'who is sho',
        'who is he',
        'tell me who he is',
        'his background',
        'what does he do',
      ],
      goal: 'profile(?N)',
      // Nothing to look up: the profile is on the page already.
      requiresSubject: false,
      // "What does he do?" has no content words at all.
      match: (question) =>
        /^\s*(what does he do|what is his job|who is (sho|he)|tell me (about|who) (him|sho))/i.test(question),
      explain: () => 'Read the profile from this page',
      compose: ({ query }) => {
        const current = DATA.experience?.[0];
        const years = '12';
        const since = String(current?.period || '').split('–')[0].trim();
        return phraseProfile(query, {
          name: DATA.hero?.name,
          years,
          org: current?.org,
          since,
        });
      },
    },
    {
      id: 'projects.using',
      title: 'Which projects use a technology',
      keywords: ['which projects use', 'what uses', 'written in', 'uses', 'dependencies', 'powered by'],
      goal: 'projects_using(?P)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      explain: ({ solutions, terms, mentions, observed, combine }) => {
        if (!observed['projects.list']) return 'Read the project list';
        if (combine?.op === 'all' && terms.length >= 2) {
          return `Read the project list and kept the projects that list both ${terms.join(' and ')}`;
        }
        const tech = terms.join(' or ') || mentions[0] || 'that';
        if (solutions.length === 0) return `Read the project list: no stack lists ${tech}`;
        return `Read the project list and matched ${tech} against ${solutions.length} project${solutions.length === 1 ? '' : 's'}`;
      },
      compose: ({ query, solutions, terms, mentions, observed, combine, exclude }) => {
        const records = observed['projects.list']?.projects ?? [];
        const asked = terms[0] || mentions[0] || '';
        // "not python" rules the technology out of the answer, not just out of
        // the question: Readback lists Python, so it cannot answer "sqlite but
        // not python".
        const notWanted = (project) =>
          (exclude ?? []).some(
            (term) =>
              stackHas(project, term) ||
              shortName(project.title).toLowerCase() === String(term).toLowerCase() ||
              slugOf(project.title) === slugOf(term),
          );
        // "python and sqlite" is a different question from "python or sqlite":
        // the join over asked() is a union, so the intersection is computed
        // against the tool result the rule already holds.
        if (combine?.op === 'all' && terms.length >= 2 && records.length > 0) {
          const both = records.filter((project) => terms.every((term) => stackHas(project, term)) && !notWanted(project));
          return phraseProjectsUsingAll(query, both, terms, { records });
        }
        if (solutions.length === 0) {
          // The tool ran, so "no stack lists TypeScript" is a fact about the
          // page, not a shrug. Without the tool result there is nothing to say.
          if (!observed['projects.list']) return '';
          return phraseProjectsUsing(query, [], asked, { records });
        }
        const matched = solutions
          .map((solution) => {
            const slug = solution.bindings['?P'];
            const record = records.find(
              (project) => slugOf(project.title) === slug || shortName(project.title).toLowerCase() === slug,
            );
            return record ?? { title: solution.bindings['?T'] ?? slug, stack: [] };
          })
          .filter((project) => project?.title && !notWanted(project));
        return phraseProjectsUsing(query, matched, asked, { records });
      },
    },
    {
      id: 'projects.list_titles',
      title: 'List the projects',
      keywords: ['list projects', 'project list', 'which projects', 'what has he built', 'what did he build', 'what has he shipped', 'what did he make', 'what has he made'],
      goal: 'project(?P, ?T)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      // Both rules read the same tool, so the join rule must win whenever the
      // question names a technology: keep this one for plain "list" questions.
      threshold: 1.1,
      requiresSubject: false,
      explain: ({ solutions }) => `Read the project list: ${solutions.length} projects`,
      compose: ({ query, solutions, observed }) => {
        if (solutions.length === 0) return '';
        const records = observed['projects.list']?.projects?.length
          ? observed['projects.list'].projects
          : solutions.map((solution) => ({ title: solution.bindings['?T'] ?? '' }));
        return phraseProjectList(query, records.filter((project) => project?.title));
      },
    },
    {
      id: 'contact.email',
      title: 'His email address',
      keywords: ['what is his email', 'his email', 'email address', 'how do i email him', 'how do i reach him'],
      goal: 'email(?V)',
      compose: ({ query, bindings }) =>
        bindings['?V'] ? phraseEmail(query, bindings['?V']) : '',
      explain: ({ solutions }) =>
        solutions.length ? 'Read the email address off this page' : 'Looked for an email address on this page',
    },
    {
      id: 'contact.linkedin',
      title: 'His LinkedIn profile',
      keywords: ['his linkedin', 'what is his linkedin', 'linkedin profile'],
      goal: 'linkedin(?V)',
      compose: ({ query, bindings }) =>
        bindings['?V'] ? phraseLinkedin(query, bindings['?V']) : '',
      explain: () => 'Read the LinkedIn link off this page',
    },
    {
      id: 'posts.newest',
      title: 'The newest article',
      keywords: ['newest post', 'latest post', 'last thing he wrote', 'latest article', 'newest article', 'how much has he written', 'how many posts has he written', 'what has he written'],
      goal: 'post_newest(?T)',
      // Nothing to look up by name: the tool always runs.
      requiresSubject: false,
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
      compose: ({ query, bindings, lookup, observed }) => {
        const stats = observed['blog.stats'] ?? {};
        const newest = stats.newest ?? bindings['?T'];
        const count = stats.posts ?? lookup('post_count(?N)')[0]?.bindings['?N'];
        if (!newest) return '';
        return phraseNewestPost(query, { count, newest });
      },
    },
  ];

  return { knowledge, answers };
}
