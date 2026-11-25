// The knowledge and answer rules the site's assistant runs on. Shared by the
// panel (src/agent/assistant.js) and the live console on /boaz/.
import { KnowledgeBase, fact } from '@shobyde/boaz/rules';
import { DATA } from '../data.js';
import { answerRegister } from './register.js';
import { isStackValue, stackHas, stackWords, unresolvedCondition } from './conditions.js';
import { propertyMatches, propertyPhrase, surfaceOf } from './properties.js';
import { PROJECT_SIZE, SIZE_METRIC } from './projectSize.js';
import {
  phraseEmail,
  phraseProfile,
  phraseLinkedin,
  phraseNewestPost,
  phraseProjectAbout,
  phraseProjectList,
  phraseProjectSize,
  phraseProjectStack,
  phraseProjectsUsing,
  phraseProjectsUsingAll,
  phraseProjectsSplit,
  phraseProperty,
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
/** The names a visitor can type, longest first so "shobyde.com" wins over "shobyde". */
const PROJECT_NAME = new RegExp(
  `\\b(?:${DATA.projects
    .map((project) => shortName(project.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'i',
);

/** The projects named in the question itself, in the order they were asked about. */
const namedProjects = (query, records) => {
  const asked = String(query ?? '').match(new RegExp(PROJECT_NAME.source, 'gi')) ?? [];
  const order = new Map(asked.map((name, index) => [name.toLowerCase(), index]));
  return records
    .filter((project) => order.has(shortName(project.title).toLowerCase()))
    .sort(
      (a, b) =>
        order.get(shortName(a.title).toLowerCase()) - order.get(shortName(b.title).toLowerCase()),
    );
};

/** The projects each resolved technology matched, in the order the engine bound them. */
const groupByTerm = (solutions, records) => {
  const groups = new Map();
  for (const solution of solutions ?? []) {
    const term = solution.bindings?.['?1_T'] ?? solution.bindings?.['?T'];
    const slug = solution.bindings?.['?P'] ?? solution.bindings?.['?1_P'];
    if (!term || !slug) continue;
    const record = (records ?? []).find(
      (project) => slugOf(project.title) === slug || shortName(project.title).toLowerCase() === slug,
    );
    const name = record ? shortName(record.title) : String(slug);
    const key = String(term);
    if (!groups.has(key)) groups.set(key, { term: key, names: [] });
    const group = groups.get(key);
    if (!group.names.includes(name)) group.names.push(name);
  }
  return [...groups.values()];
};


export function createAssistantKnowledge({ posts }) {
  const knowledge = new KnowledgeBase({
    facts: [],
    rules: [
      'projects_using(?P) :- uses(?P, ?T), asked(?T).',
      // A project named outright: "what stack does Hobnob use", "what is Hobnob".
      // The name is the constant the visitor typed, so the join is on it.
      'project_stack(?P, ?S) :- uses(?P, ?S), project(?P, ?N), asked(?N).',
      'project_named(?P) :- project(?P, ?N), asked(?N).',
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
        /^\s*(what does he do|what is his job|who is (sho|he)|tell me (about|who) (him|sho))/i.test(question) ||
        // "how many years of experience" is a profile question, and the keyword
        // engine refused it: "years" ties between this and the experience list.
        // "how long has he been working" stays with profile.summary, which owns it.
        /\b(years of experience|how many years)\b/i.test(question),
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
          role: current?.role,
          register: answerRegister(),
        });
      },
    },
    {
      id: 'history.work',
      title: 'Work history',
      keywords: ['work history', 'career history', 'where has he worked', 'jobs', 'roles', 'employment history', 'work experience'],
      goal: 'profile(?N)',
      requiresSubject: false,
      match: (question) =>
        /\b(work history|career history|employment history|where has (he|sho) worked|what jobs|which roles|work experience)\b/i.test(question),
      explain: () => 'Read the work history from the record',
      compose: () => {
        const current = DATA.experience.find((entry) => /present/i.test(entry.period));
        const intuli = DATA.experience.find((entry) => /intuli/i.test(entry.org));
        const teaching = DATA.experience.find((entry) => /teacher/i.test(entry.role));
        const digipen = DATA.experience.find((entry) => /digipen/i.test(entry.org));
        const parts = [];
        if (current) parts.push(`${current.role} at ${current.org} (${current.period})`);
        if (intuli) parts.push(`${intuli.role} at ${intuli.org} (${intuli.period})`);
        if (teaching) parts.push(`${teaching.role} at ${teaching.org} (${teaching.period})`);
        if (digipen) parts.push(`${digipen.role} at ${digipen.org} (${digipen.period})`);
        return parts.length ? `Sho's work history: ${parts.join('; ')}.` : '';
      },
    },
    {
      id: 'assistant.about',
      title: 'What this assistant can do',
      keywords: ['what can you do', 'what can this do', 'what do you do'],
      goal: 'profile(?N)',
      // Nothing to look up: the manifest is the answer.
      requiresSubject: false,
      match: (question) => /^\s*(what can you do|what can this do|what do you do)\b/i.test(question),
      explain: ({ capabilities }) => `Read the manifest: ${capabilities.length} capabilities`,
      compose: ({ capabilities }) => {
        const titles = capabilities.map((capability) => capability.title).filter(Boolean);
        if (!titles.length) return '';
        const shown = titles.slice(0, 6).join('; ');
        const rest = titles.length > 6 ? `, and ${titles.length - 6} more` : '';
        return `I have ${capabilities.length} capabilities, all answered from this page: ${shown}${rest}.`;
      },
    },
    {
      id: 'projects.property',
      title: 'A property the cards describe',
      keywords: ['runs locally', 'offline', 'self-hosted', 'desktop app', 'in the browser', 'summarise'],
      goal: 'project(?P, ?N)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      requiresSubject: false,
      // Reachable by match only, like the size rule: a title that mentions
      // "local" or "offline" would otherwise steal stack questions on one word.
      threshold: 100,
      // Only when the cards actually claim (or reject) the phrase. A question
      // naming a technology is the join rule's, and one asking for a size is the
      // measurement rule's; both are checked here so neither is taken.
      match: (question) => {
        if (!/^\s*(which|what)\s+(one|project|projects|of them)\b/i.test(question)) return false;
        if (/\b(stack|tech|technolog|built with|written in|made with|by size|bigger|biggest|largest|smaller|smallest|lines of code|code|codes)\b/i.test(question)) return false;
        // A technology is the join rule's question, even when the word also
        // appears in a card's prose: "use sqlite" must stay a stack answer.
        // One stack word in the question makes it a technology question, whether
        // the phrase is a single name or two joined by a connective. Without this
        // "use python and sqlite" reached the prose reader and answered from the
        // cards instead of the stacks.
        const asked = (propertyPhrase(question) || '').split(' ').filter(Boolean);
        if (!asked.length || asked.some((word) => isStackValue(word))) return false;
        // A named project is a stack, comparison or description question.
        if (PROJECT_NAME.test(question)) return false;
        const found = propertyMatches(question);
        return Boolean(found && (found.matches.length || found.mentionedOnly.length));
      },
      explain: ({ query }) => {
        const found = propertyMatches(query);
        const names = (found?.matches ?? []).map((match) => shortName(match.project.title));
        const rejected = (found?.mentionedOnly ?? []).map((project) => shortName(project.title));
        if (names.length) return `Read the cards and found "${found.surface ?? found.phrase}" in ${names.length} ${names.length === 1 ? 'summary' : 'summaries'}`;
        if (rejected.length) return `Read the cards: ${rejected.join(' and ')} ${rejected.length === 1 ? 'names' : 'name'} it only to reject it`;
        return 'Read the cards for that property';
      },
      compose: ({ query }) => {
        const found = propertyMatches(query);
        if (!found) return '';
        return phraseProperty(query, { ...found, surface: surfaceOf(query) }, { register: answerRegister() });
      },
    },
    {
      id: 'projects.using',
      title: 'Which projects use a technology',
      keywords: ['which projects use', 'what uses', 'written in', 'uses', 'dependencies', 'powered by'],
      goal: 'projects_using(?P)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      // Fixed shapes, so say them outright: a second rule that mentions a
      // project ("what a project is built with") otherwise wins the score tie
      // these phrasings get from naming a declared technology, then composes ''
      // because no project is named. Match order in this file decides.
      match: (question) =>
        /\b(built|written|shipped|made|powered|runs)\s+(with|in|on|by)\b/i.test(question) ||
        // "which projects" alone is a list question; it needs content after the
        // noun (a technology) to be a join. Bare, it used to reach this rule and
        // compose a refusal, because the join had nothing to bind.
        /^\s*which projects\b\s*\S{3,}/i.test(question) ||
        /\b(any|some) projects\b/i.test(question) ||
        /\bprojects (that|which) (use|are|list)\b/i.test(question) ||
        /\bdoes (he|she) have\b[^?]*\bprojects\b/i.test(question),
      explain: ({ solutions, terms, mentions, observed, combine }) => {
        if (!observed['projects.list']) return 'Read the project list';
        if (combine?.op === 'all' && terms.length >= 2) {
          return `Read the project list and kept the projects that list both ${terms.join(' and ')}`;
        }
        // Two conditions with no named pair: the answer splits the stacks by
        // condition, so the trace counts each side instead of saying "or".
        if (terms.length >= 2) {
          const counts = new Map();
          for (const solution of solutions) {
            const bindings = solution.bindings ?? solution;
            const term = bindings['?1_T'];
            if (term) counts.set(term, (counts.get(term) ?? 0) + 1);
          }
          const sides = terms.map((term) => `${counts.get(term) ?? 0} on ${term}`);
          return `Read the project list and checked each stack: ${sides.join(', ')}`;
        }
        const tech = terms.join(' or ') || mentions[0] || 'that';
        if (solutions.length === 0) return `Read the project list: no stack lists ${tech}`;
        return `Read the project list and matched ${tech} against ${solutions.length} project${solutions.length === 1 ? '' : 's'}`;
      },
      compose: ({ query, solutions, terms, mentions, observed, combine, exclude }) => {
        const records = observed['projects.list']?.projects ?? [];
        const asked = terms[0] || mentions[0] || '';
        // "what stack does hobnob use" contains the word "use": if every term
        // is a project's name, this is not a stack question and the rule stays
        // out of it rather than answering "no stack lists hobnob".
        const isProjectTerm = (term) =>
          records.some(
            (project) =>
              slugOf(project.title) === slugOf(term) ||
              shortName(project.title).toLowerCase() === String(term).toLowerCase(),
          );
        if (terms.length && terms.every(isProjectTerm)) return '';
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
        const groups = groupByTerm(solutions, records);
        // No project lists both terms. The union claim would name every match
        // under the first term, which is false for the second: "which projects
        // use python and have a web interface" answered "3 projects name
        // Python", one of them there for Three.js.
        const conjunction = combine ? combine.op === 'all' : terms.length >= 2 && /\band\b/i.test(query) && !/\bor\b|\bversus\b|\bvs\.?\b/i.test(query);
        if (conjunction && terms.length >= 2 && records.length > 0) {
          const both = records.filter((project) => terms.every((term) => stackHas(project, term)) && !notWanted(project));
          if (both.length === 0 && groups.length >= 2) {
            return phraseProjectsSplit(query, groups, {
              both: [],
              total: records.length,
              register: answerRegister(),
            });
          }
          return phraseProjectsUsingAll(query, both, terms, { records, register: answerRegister() });
        }
        // One side of a two-condition ask can name something no stack lists
        // ("python and kubernetes"). Say so on the turn that answers, instead of
        // leaving it for the follow-up: the visitor asked for an intersection
        // and is being handed a set. The claim is only worth making when the
        // tool ran and no stack on the page carries the phrase.
        const unchecked = terms.length < 2 && asked && records.length
          ? (() => {
              const phrase = unresolvedCondition(query, asked, { minWords: 1, projects: records });
              if (!phrase || isStackValue(phrase, records)) return null;
              return phrase;
            })()
          : null;
        if (groups.length > 1) {
          return phraseProjectsSplit(query, groups, {
            both: [],
            conjunction: false,
            total: records.length,
            register: answerRegister(),
          });
        }
        if (solutions.length === 0) {
          // The tool ran, so "no stack lists TypeScript" is a fact about the
          // page, not a shrug. Without the tool result there is nothing to say.
          if (!observed['projects.list']) return '';
          return phraseProjectsUsing(query, [], asked, { records, register: answerRegister() });
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
        return phraseProjectsUsing(query, matched, asked, { records, register: answerRegister(), unchecked });
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
      // The phrase is fixed, so a deliberate match beats BM25: adding answer
      // rules shrinks every score, and a 1.1 floor made this rule vanish as the
      // corpus grew. "Which projects use python" still belongs to the join rule.
      match: (question) =>
        /^\s*(what (has|did) he (build|built|make|made|ship|shipped)|list (the|his) projects|project list)\b/i.test(question) ||
        // "how many projects has he built" lost its score once a rule was added
        // (adding a rule shrinks every BM25 score), so the fixed counts get a
        // match of their own rather than depending on a threshold.
        /^\s*how many (projects|of them) (has|did) he (built|made|shipped)\b/i.test(question),
      explain: ({ solutions }) => `Read the project list: ${solutions.length} projects`,
      compose: ({ query, solutions, observed }) => {
        if (solutions.length === 0) return '';
        const records = observed['projects.list']?.projects?.length
          ? observed['projects.list'].projects
          : solutions.map((solution) => ({ title: solution.bindings['?T'] ?? '' }));
        return phraseProjectList(query, records.filter((project) => project?.title), { register: answerRegister() });
      },
    },
    {
      id: 'projects.stack',
      title: 'What a project is built with',
      keywords: ['tech stack', 'stack', 'built with', 'made with', 'what does it use'],
      goal: 'project_stack(?P, ?S)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      // A project has to be named: "what technologies does he know" is the
      // profile's skill list, not any one project's stack.
      match: (question) =>
        PROJECT_NAME.test(question) &&
        !/^\s*which projects/i.test(question) &&
        /\b(stack|tech|technolog(y|ies)|built with|made (with|of)|what does .+ use)\b/i.test(question),
      explain: ({ solutions, observed }) =>
        observed['projects.list']
          ? `Read the project list: ${solutions.length} stack entries for the project named`
          : 'Read the project list',
      compose: ({ query, solutions, observed }) => {
        const records = observed['projects.list']?.projects ?? [];
        const first = solutions[0]?.bindings['?P'];
        const record = records.find((project) => slugOf(project.title) === first);
        const name = record ? shortName(record.title) : String(first ?? '');
        const stack = [...new Set(solutions.map((solution) => solution.bindings['?S']).filter(Boolean))];
        if (!name || stack.length === 0) return '';
        return phraseProjectStack(query, name, stack, { register: answerRegister() });
      },
    },
    {
      id: 'projects.about',
      title: 'A project, described',
      keywords: ['tell me about', 'what is', 'describe'],
      goal: 'project_named(?P)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      // Named projects only: "what is that" belongs to the pointer layer, and
      // "what is his email" belongs to the grounding rule. "More about X" is the
      // same request; without it the phrase lost to `projects.expand` on score
      // once a new rule shrank every BM25 score.
      match: (question) =>
        PROJECT_NAME.test(question) &&
        /^\s*(what is|what's|tell me about|describe|more about|anything else about)\b/i.test(question),
      explain: ({ observed }) => (observed['projects.list'] ? 'Read the project list and matched the name' : 'Read the project list'),
      compose: ({ query, solutions, observed }) => {
        const records = observed['projects.list']?.projects ?? [];
        const slug = solutions[0]?.bindings['?P'];
        const record = records.find((project) => slugOf(project.title) === slug);
        if (!record) return '';
        return phraseProjectAbout(query, record, {
          register: answerRegister(),
          stack: solutions.map((solution) => solution.bindings['?S']).filter(Boolean),
        });
      },
    },
    {
      id: 'projects.privacy',
      title: 'Where a project keeps its data',
      keywords: ['send to a server', 'leaves the machine', 'cloud', 'private', 'local'],
      goal: 'project(?P, ?N)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      match: (question) =>
        PROJECT_NAME.test(question) && /(send|upload|store|leave).{0,20}(server|cloud|machine|device)/i.test(question),
      explain: ({ observed }) => (observed['projects.list'] ? 'Read the project list and its own pitch about data' : 'Read the project list'),
      compose: ({ query, solutions, observed }) => {
        const records = observed['projects.list']?.projects ?? [];
        const named = namedProjects(query, records)[0];
        const record = named ?? records.find((project) => slugOf(project.title) === solutions[0]?.bindings['?P']);
        if (!record) return '';
        // The card's subtitle is the claim ("private meeting notes, no cloud");
        // repeating it is honest, and inventing a data policy is not.
        const subtitle = String(record.title).includes(':') ? String(record.title).split(':').slice(1).join(':').trim() : '';
        const local = /no cloud|local|offline|on.device|private|nothing leaving|no model/i.test(`${subtitle} ${record.summary ?? ''}`);
        if (!local) return '';
        return `${shortName(record.title)}: ${subtitle || 'runs locally'}. Nothing in its stack needs a remote server.`;
      },
    },
    {
      id: 'projects.compare',
      title: 'Compare two projects',
      keywords: ['compare', 'versus', 'vs'],
      goal: 'project(?P, ?N)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      requiresSubject: false,
      // "compare X and Y by size" is the size rule's form; without this guard
      // both rules match outright and the comparison quotes pitches instead of
      // the measurement the visitor asked for.
      match: (question) => /^\s*compare\b/i.test(question) && !/\bby size\b/i.test(question),
      explain: ({ query, solutions }) => {
        const named = namedProjects(query, DATA.projects);
        if (named.length >= 2) {
          return `Read the project list and set ${named.slice(0, 2).map((project) => shortName(project.title)).join(' and ')} side by side`;
        }
        return solutions.length >= 2 ? 'Read the project list and picked the two projects named' : 'Read the project list for both names';
      },
      compose: ({ query, solutions, observed }) => {
        const records = observed['projects.list']?.projects ?? [];
        // The question names the two sides. The rule's goal returns every
        // project, so without this filter "compare Groundglass and Boaz" would
        // compare whichever two happen to sit first in the list.
        const named = namedProjects(query, records);
        if (named.length < 2) return '';
        const picked = named.slice(0, 2);
        // One sentence each, from the project's own pitch: a comparison that
        // invents a winner would need a judgement this page does not hold.
        return picked
          .map((project) => {
            const pitch = String(project.summary ?? '')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .split(/(?<=[.!?])\s+/)[0];
            const stack = (project.stack ?? []).slice(0, 3).join(', ');
            return `${shortName(project.title)}: ${pitch}${stack ? ` It runs on ${stack}.` : ''}`;
          })
          .join(' ');
      },
    },
    {
      id: 'projects.size',
      title: 'Which project carries more code',
      keywords: ['bigger', 'larger', 'smaller', 'lines of code', 'codebase size', 'how big'],
      goal: 'project(?P, ?N)',
      steps: [{ capabilityId: 'projects.list', toFacts: projectFacts }],
      // The two sides come from the sentence ("compare hobnob and readback by
      // size") or from the session ("which one is bigger?" after a comparison,
      // rewritten by src/agent/sessionMemory.js). Without a name the rule still
      // answers, with the largest card, so a bare "which project is biggest"
      // is a measurement rather than a refusal.
      requiresSubject: false,
      // Reachable by its own match only: with 13 rules a rare word carries a lot
      // of IDF, so "source code for readback" scored the title's "code" at 4.12
      // and "more about groundglass" scored its "more" at 3.69, both above any
      // sane threshold. A matched-outright hit scores Infinity, so the match
      // below is the only way in by design.
      threshold: 100,
      match: (question) =>
        /\bby size\b/i.test(question) ||
        /\b(which|what)\b[^.?!]*\b(biggest|bigger|largest|larger|smallest|smaller|more code)\b/i.test(question) ||
        /\bhow (big|large)\b[^.?!]*\b(project|codebase|code|it|readback|hobnob|groundglass|boaz)\b/i.test(question) ||
        /\blines of code\b/i.test(question),
      explain: ({ query, observed }) => {
        const records = observed['projects.list']?.projects ?? [];
        const named = namedProjects(query, records);
        if (named.length === 2) {
          return `Measured ${named.map((project) => shortName(project.title)).join(' and ')} in source lines and compared the counts`;
        }
        return named.length === 1
          ? `Measured ${shortName(named[0].title)} in source lines`
          : 'Compared the measured source lines of every project card';
      },
      compose: ({ query, observed }) => {
        const records = observed['projects.list']?.projects ?? [];
        const sized = (records.length ? records : DATA.projects)
          .map((project) => {
            const name = shortName(project.title);
            const size = project.size ?? PROJECT_SIZE[name];
            return size ? { name, lines: size.lines, files: size.files } : null;
          })
          .filter(Boolean);
        if (!sized.length) return '';
        const named = namedProjects(query, records.length ? records : DATA.projects)
          .map((project) => shortName(project.title))
          .filter((name) => sized.some((entry) => entry.name === name));
        const picked = named.length
          ? sized.filter((entry) => named.includes(entry.name))
          : [sized.reduce((a, b) => (b.lines > a.lines ? b : a))];
        return phraseProjectSize(query, picked, { register: answerRegister(), metric: SIZE_METRIC });
      },
    },
    {
      id: 'contact.private',
      title: 'Details he does not publish',
      // "postal code" is not a keyword: its "code" token steals "source code
      // for readback" in the BM25 fallback. The match below still catches it.
      keywords: ['phone', 'phone number', 'cell', 'mobile', 'telephone', 'call him', 'zip', 'where does he live'],
      goal: 'profile(?N)',
      requiresSubject: false,
      match: (question) =>
        /\b(phone|cell|mobile|telephone|home address|street address|postal code|zip)\b/i.test(question) ||
        /^\s*(what is|what's|where is) his (home |street |mailing )?address\b/i.test(question) ||
        /\bwhere (does|do) (he|sho) live\b/i.test(question),
      explain: () => 'Checked the contact details this site publishes',
      compose: () =>
        'Only his email and LinkedIn are published here. For a phone number or anything else, email him and he will send it.',
    },
    {
      id: 'contact.email',
      title: 'His email address',
      keywords: ['what is his email', 'his email', 'email address', 'how do i email him', 'how do i reach him'],
      goal: 'email(?V)',
      compose: ({ query, bindings }) => {
        const value = bindings['?V'] || DATA.contact?.email;
        return value ? phraseEmail(query, value) : '';
      },
      explain: ({ solutions }) =>
        solutions.length ? 'Read the email address off this page' : 'Read the email address from the record',
    },
    {
      id: 'contact.linkedin',
      title: 'His LinkedIn profile',
      keywords: ['his linkedin', 'what is his linkedin', 'linkedin profile'],
      goal: 'linkedin(?V)',
      compose: ({ query, bindings }) => {
        const value = bindings['?V'] || DATA.contact?.linkedin;
        return value ? phraseLinkedin(query, value) : '';
      },
      explain: () => 'Read the LinkedIn link from the record',
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
        if (/\b(about|summar|cover|detail)\b/i.test(query) && stats.newestExcerpt) {
          return `The newest post, "${newest}": ${stats.newestExcerpt}`;
        }
        return phraseNewestPost(query, { count, newest, register: answerRegister() });
      },
    },
  ];

  return { knowledge, answers };
}
