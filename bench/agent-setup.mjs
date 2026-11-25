// The site's engine, for `boaz audit` and `boaz bench`.
// Nothing here is a reimplementation: it wires the real manifest, the real
// knowledge and the same page scan the panel uses.
import fs from 'node:fs';
import { createRulesEngine } from '@shobyde/boaz/rules';
import { createAssistantKnowledge } from '../src/agent/knowledge.js';
import { PROJECT_SIZE } from '../src/agent/projectSize.js';
import { DATA } from '../src/data.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../dist/agent-manifest.json', import.meta.url), 'utf8'));
const posts = JSON.parse(fs.readFileSync(new URL('../content/posts/index.json', import.meta.url), 'utf8'));
const postList = Array.isArray(posts) ? posts : posts.posts ?? [];

const { knowledge, answers } = createAssistantKnowledge({ posts: postList });

// The page the panel would read; contact details live only in the DOM.
const PAGE =
  'Contact. Email shobyde@gmail.com or find him at https://www.linkedin.com/in/sho-byde-556954138/. ' +
  DATA.projects.map((project) => project.summary).join(' ');

export { answers };
export const capabilities = manifest.capabilities;
export const knowledgeBase = knowledge;

const GITHUB_FIXTURES = {
  boaz: { repo: 'shobyde/boaz', label: 'Boaz', commits: 81, releases: 67, stars: 0 },
  hobnob: { repo: 'emberscribe/hobnob', label: 'Hobnob', commits: 42, releases: 6, stars: 0 },
  readback: { repo: 'shobyde/readback', label: 'Readback', commits: 10, releases: 1, stars: 0 },
  groundglass: { repo: 'shobyde/groundglass', label: 'Groundglass', commits: 3, releases: 0, stars: 0 },
  shobyde: { repo: 'shobyde/resume-site', label: 'shobyde.com', commits: 205, releases: 0, stars: 0 },
};

const handlers = {
  'projects.list': async () => ({
    projects: DATA.projects.map((project) => ({
      title: project.title,
      summary: project.summary,
      stack: project.stack,
      details: Boolean(project.details),
      size: PROJECT_SIZE[String(project.title).split(':')[0].trim()] ?? null,
    })),
  }),
  'projects.card': async (args = {}) => {
    const key = String(args.project || '').toLowerCase();
    const project = DATA.projects.find((entry) =>
      String(entry.title).toLowerCase().includes(key),
    );
    return {
      answer: project ? `${project.title}. ${project.summary}` : 'No project on this page matches that.',
      project: project?.title ?? null,
    };
  },
  'blog.stats': async () => ({
    posts: postList.length,
    newest: postList.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.title,
  }),
  'contact.copy_email': async () => ({ copied: 'shobyde@gmail.com' }),
  'contact.open_linkedin': async () => ({ opened: 'https://www.linkedin.com/in/sho-byde-556954138/' }),
  'github.activity': async (args = {}) => {
    const requested = args.repo || 'all';
    const keys = requested === 'all' ? Object.keys(GITHUB_FIXTURES) : [requested];
    const repos = keys.map((key) => GITHUB_FIXTURES[key]).filter(Boolean);
    return {
      answer: repos.length
        ? `${repos.map((repo) => `${repo.label}: ${repo.commits} commits, ${repo.releases} releases, ${repo.stars} stars`).join('; ')}.`
        : 'GitHub did not return public data for that project.',
      github: { repos, requested, live: repos.length },
    };
  },
  'resume.print': async () => ({ printed: true }),
};

export const runCapability = async (id, args) =>
  handlers[id] ? handlers[id](args) : { note: 'no handler in this harness' };

export function createEngine() {
  return createRulesEngine({
    knowledge,
    answers,
    capabilities: manifest.capabilities,
    grounding: { read: () => PAGE },
    constants: [...new Set(DATA.projects.flatMap((project) => project.stack))],
  });
}
