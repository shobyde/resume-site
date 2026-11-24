// The site's engine, for `client-agent audit` and `client-agent bench`.
// Nothing here is a reimplementation: it wires the real manifest, the real
// knowledge and the same page scan the panel uses.
import fs from 'node:fs';
import { createRulesEngine } from 'client-agent/rules';
import { createAssistantKnowledge } from '../src/agent/knowledge.js';
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

const handlers = {
  'projects.list': async () => ({
    projects: DATA.projects.map((project) => ({
      title: project.title,
      stack: project.stack,
      details: Boolean(project.details),
    })),
  }),
  'blog.stats': async () => ({
    posts: postList.length,
    newest: postList.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.title,
  }),
  'contact.copy_email': async () => ({ copied: 'shobyde@gmail.com' }),
  'contact.open_linkedin': async () => ({ opened: 'https://www.linkedin.com/in/sho-byde-556954138/' }),
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
