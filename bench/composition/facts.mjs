// Facts the three spikes render, taken from the site's own sources.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function loadFacts() {
  const { DATA } = await import(`${SITE}/src/data.js`);
  const posts = JSON.parse(fs.readFileSync(`${SITE}/content/posts/index.json`, 'utf8'));
  const short = (title) => title.split(':')[0].trim();
  return {
    data: DATA,
    name: DATA.hero.name,
    role: strip(DATA.hero.role),
    email: 'shobyde@gmail.com',
    linkedin: 'https://www.linkedin.com/in/sho-byde-556954138/',
    projects: DATA.projects.map((project) => ({
      title: project.title,
      name: short(project.title),
      summary: strip(project.summary),
      stack: project.stack,
      meta: project.meta,
    })),
    posts: {
      count: posts.length,
      newest: posts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0],
      oldest: posts.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))[0],
    },
  };
}

/** HTML out of the résumé data, entities resolved. */
export function strip(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The question set each system has to answer, with what a correct answer must contain. */
export const PROBES = [
  {
    intent: 'list_titles',
    questions: ['what has he built?', 'list the projects', 'what has he shipped?', 'what did he make?'],
    must: (facts) => facts.projects.map((project) => project.name.split(' ')[0]),
  },
  {
    intent: 'using_python',
    questions: ['which projects use python?', "what's built with python?", 'any projects in python?', 'does he have python projects?'],
    must: () => ['Readback', 'Groundglass'],
  },
  {
    intent: 'posts_newest',
    questions: ['how many posts are there?', "what's the newest post?", 'how much has he written?', "what's the latest article?"],
    must: (facts) => [String(facts.posts.count), facts.posts.newest.title.split(':')[0].slice(0, 18)],
  },
  {
    intent: 'email',
    questions: ['what is his email?', 'how do i email him?', 'his email address?', 'can i get his email?'],
    must: (facts) => [facts.email],
  },
  {
    intent: 'linkedin',
    questions: ['his linkedin?', "what's his linkedin?", 'where can i find him on linkedin?', 'linkedin profile?'],
    must: () => ['linkedin.com/in/'],
  },
  {
    intent: 'summary',
    questions: ['who is sho?', 'what does he do?', "what's his background?", 'tell me about him'],
    must: () => ['12'],
  },
];
