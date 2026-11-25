/* ============================================================
   Page composition surfaces.

   The front page is not hand-picked markup at runtime: a
   `SitePage` surface declares which sections are on the page,
   what the hero says, and which work rows survive a filter. The
   host applies that surface to the prerendered page. This is the
   A2UI contract applied to a whole page instead of a card.
   ============================================================ */
import { DATA } from '../data.js';

export const PAGE_CATALOG = 'https://shobyde.com/a2ui/catalog.json';

export const ALL_SECTIONS = ['about', 'projects', 'register', 'experience', 'skills', 'blog', 'contact'];

const SECTION_LABELS = {
  about: 'Profile',
  projects: 'Work',
  register: 'Register',
  experience: 'History',
  skills: 'Stack',
  blog: 'Log',
  contact: 'Contact',
};

const VIEWS = {
  home: {
    sections: ALL_SECTIONS,
    title: null,
    mark: null,
    note: null,
  },
  profile: {
    sections: ['about', 'contact'],
    title: 'The profile.',
    mark: 'profile',
    note: 'The profile is at the front. The work, the register, and the log are one question away.',
  },
  work: {
    sections: ['projects', 'contact'],
    title: 'The work index.',
    mark: 'work',
    note: 'The work index is at the front. Expand a row for the architecture and the decisions.',
  },
  register: {
    sections: ['register', 'contact'],
    title: 'The register.',
    mark: 'register',
    note: 'The register is at the front. It renders A2UI surfaces from the build manifest.',
  },
  history: {
    sections: ['experience', 'contact'],
    title: 'The history.',
    mark: 'history',
    note: 'The history is at the front. The teaching year is in the record.',
  },
  stack: {
    sections: ['skills', 'contact'],
    title: 'The stack.',
    mark: 'stack',
    note: 'The stack is at the front. The work index has the projects that used it.',
  },
  log: {
    sections: ['blog', 'contact'],
    title: 'The engineering log.',
    mark: 'engineering log',
    note: 'The log is at the front. Every entry is still in the archive.',
  },
  contact: {
    sections: ['contact'],
    title: 'Contact.',
    mark: 'contact',
    note: 'Contact is at the front. No form, no scheduler: a real inbox.',
  },
};

const PROJECT_KEYS = [
  { key: 'hobnob', name: 'Hobnob', re: /hobnob/i },
  { key: 'readback', name: 'Readback', re: /readback/i },
  { key: 'groundglass', name: 'Groundglass', re: /groundglass/i },
  { key: 'boaz', name: 'Boaz', re: /\bboaz\b/i },
  { key: 'shobyde', name: 'shobyde.com', re: /shobyde(\.com)?/i },
  { key: 'digipen', name: 'DigiPen', re: /digipen|physics engine/i },
];

/* The names a visitor is likely to use. Derived work filters compare against
   the project stack strings, so "Python" also catches "Python 3.10+". */
const TECH_ALIASES = [
  'API Gateway', 'Windows Server', 'Three.js', 'TypeScript', 'JavaScript',
  'Cloudflare', 'Terraform', 'DynamoDB', 'Redshift', 'Whisper', 'SQLite',
  'Next.js', 'Node.js', 'Mentoring', 'Docker', 'pytest', 'Python', 'Flask',
  'Express', 'Auth0', 'OAuth', 'Jinja', 'httpx', 'MySQL', 'T-SQL', 'A2UI',
  'React', 'Vite', 'Yii', 'PHP', 'AWS', 'SQL', 'C++', 'C#', 'QA', 'GGUF',
  'Lambda', 'Datalog', 'BM25', 'Agile', 'BFF',
];

const ALIASES = [...new Set(TECH_ALIASES)].sort((a, b) => b.length - a.length);

const SECTION_MATCHERS = [
  { re: /\b(what can you do|how does (this|it|the page) work|what is this page|capabilit|register|manifest|a2ui|surface|boaz)\b/i, view: 'register' },
  { re: /\b(log|blogs?|writings?|posts?|articles?|entries|wrote|write about)\b/i, view: 'log' },
  { re: /\b(about|profile|bio|background|who is|where.*based|how long|current role|what is his role|manager)\b/i, view: 'profile' },
  { re: /\b(experience|history|career|roles?|timeline|job|worked|employer|conversica|intuli)\b/i, view: 'history' },
  { re: /\b(skills?|stack|tools?|technolog)/i, view: 'stack' },
  { re: /\b(contact|email|linkedin|reach|hire|inbox)\b/i, view: 'contact' },
  { re: /\b(work|projects?|portfolio|built|shipped)\b/i, view: 'work' },
];

const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(text, phrase) {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(phrase)}([^a-z0-9]|$)`, 'i').test(text);
}

const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function filterProjects(alias) {
  return DATA.projects.filter((project) =>
    project.stack.some((entry) => mentions(entry, alias)),
  );
}

function filterIntent(alias) {
  const matches = filterProjects(alias);
  const n = matches.length;
  return {
    view: 'work',
    sections: ['projects', 'contact'],
    filter: alias,
    title: `Work that uses ${alias}.`,
    mark: alias,
    note: n
      ? `${n} of ${DATA.projects.length} projects list ${alias}. The rest are hidden until you ask for the full record.`
      : `No project on this page lists ${alias}. The stack table has it; the work list does not.`,
  };
}

function projectIntent(projectKey) {
  const project = DATA.projects.find((p) => slug(p.title.split(':')[0]) === projectKey);
  if (!project) return null;
  return {
    view: 'work',
    sections: ['projects', 'contact'],
    focus: projectKey,
    title: project.title,
    mark: project.title.split(':')[0],
    note: strip(project.summary),
  };
}

/**
 * Read a question as a page view: a reset, a project, a technology,
 * or a section. Returns null when the question does not ask for a page view,
 * so an ordinary question does not disturb the record.
 */
export function pageIntent(question) {
  const text = String(question || '').trim();
  if (!text) return null;

  if (/\b(reset|full record|full page|start over|show everything|go home)\b/i.test(text)) {
    return pageOptions({ view: 'home' });
  }

  const project = PROJECT_KEYS.find((entry) => entry.re.test(text));
  if (project) return projectIntent(project.key) || null;

  const alias = ALIASES.find((candidate) => mentions(text, candidate));
  if (alias) {
    // "What is TypeScript" is a vocabulary question, not a project filter.
    // "Which projects use TypeScript" is the filtered work view.
    if (/^\s*(what is|what are|how does|how do|explain|tell me about)\b/i.test(text)) {
      if (/a2ui|boaz/i.test(alias)) return pageOptions({ view: 'register' });
      return pageOptions({ view: 'stack' });
    }
    return filterIntent(alias);
  }

  const section = SECTION_MATCHERS.find((entry) => entry.re.test(text));
  if (section) return pageOptions({ view: section.view });

  return null;
}

function pageOptions(options = {}) {
  const view = options.view || 'home';
  const config = VIEWS[view] || VIEWS.home;
  return {
    view,
    sections: options.sections || config.sections,
    title: options.title ?? config.title,
    mark: options.mark ?? config.mark,
    note: options.note ?? config.note,
    filter: options.filter ?? null,
    focus: options.focus ?? null,
  };
}

/** The A2UI stream for a whole page. One component, composed by the host. */
export function pageSurface(options = {}) {
  const page = pageOptions(options);
  const id = ['page', page.view, page.filter, page.focus]
    .filter(Boolean)
    .map((part) => slug(part))
    .join('_');

  return [{
    version: '1.0',
    createSurface: {
      surfaceId: id,
      catalogId: PAGE_CATALOG,
      sendDataModel: true,
      components: [{
        id: 'root',
        component: 'SitePage',
        ...page,
      }],
      dataModel: page,
    },
  }];
}

/** Read the SitePage component back out of a stream. */
export function pageProps(messages) {
  const component = messages?.[0]?.createSurface?.components?.find((c) => c.component === 'SitePage');
  return component ? pageOptions(component) : pageOptions({ view: 'home' });
}

export function questionsFor(options = {}) {
  const page = pageOptions(options);
  if (page.view === 'work' && page.filter) {
    return ['Show the profile', 'Show only the log', 'Which projects use Flask?', 'Show the register', 'What can you do?'];
  }
  const byView = {
    home: ['Which projects use Python?', 'Show me the Hobnob card', 'Which projects use TypeScript?', 'How many posts are there?', 'What is his email?'],
    profile: ['Show the work', 'Where is he based?', 'Show the stack', 'What is his current role?', 'Show the log'],
    work: ['Which projects use Python?', 'Show only the log', 'What is his current role?', 'Show the register', 'Show the profile'],
    register: ['Show only Python projects', 'What can you do?', 'Show the log', 'Show the contact card', 'Show the profile'],
    history: ['What is his current role?', 'Show the stack', 'Show the work', 'Show the log', 'Show the profile'],
    stack: ['Which projects use Python?', 'Show the work', 'Show the log', 'Show the register', 'What can you do?'],
    log: ['Show the register', 'Show me the Hobnob card', 'Show only Python projects', 'What is his email?', 'Show the stack'],
    contact: ['What is his email?', 'Show the work', 'Show the log', 'Show the register', 'What can you do?'],
  };
  return byView[page.view] || byView.home;
}

export { SECTION_LABELS, VIEWS };
