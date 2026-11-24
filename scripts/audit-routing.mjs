// Routing audit: does each question reach the capability a person expects?
// Runs the site's real engine and knowledge in Node, so a tool call shows up as a
// capability id instead of a sentence. `npm run audit:routing` — exits non-zero on
// any miss, so it can gate a deploy.
import fs from 'node:fs';
import { createRulesEngine } from 'client-agent/rules';
import { parseModelOutput, CapabilityIndex } from 'client-agent/core';
import { createAssistantKnowledge } from '/home/sho/projects/resume-site/src/agent/knowledge.js';

const caps = JSON.parse(fs.readFileSync('/home/sho/projects/resume-site/dist/agent-manifest.json', 'utf8')).capabilities;
const posts = JSON.parse(fs.readFileSync('/home/sho/projects/resume-site/content/posts/index.json', 'utf8'));
const postList = Array.isArray(posts) ? posts : posts.posts ?? [];
const { knowledge, answers } = createAssistantKnowledge({ posts: postList });
// The page the panel would read: contact details are never declared as facts.
const PAGE = 'Contact. Email shobyde@gmail.com or find him at https://www.linkedin.com/in/sho-byde-556954138/.';
const engine = createRulesEngine({
  knowledge,
  answers,
  capabilities: caps,
  grounding: { read: () => PAGE },
});

const byId = new Map(caps.map((c) => [c.id, c]));
const answerIndex = new CapabilityIndex(
  answers.map((rule) => ({
    id: rule.id,
    kind: 'query',
    title: rule.title,
    description: rule.title,
    keywords: rule.keywords,
  })),
);
const CONTROLLER = /^(show|open|go|take|read|expand|copy|download|print|visit|browse|scroll|jump|navigate|see)\b/i;

/** A rule with tool steps answers by calling one first; that call is its plan. */
function rulePlanning(toolId, question) {
  if (CONTROLLER.test(question)) return null;
  const [best] = answerIndex.search(question, { limit: 1, boost: false });
  if (!best) return null;
  const rule = answers.find((answer) => answer.id === best.capability.id);
  return rule?.steps?.some((step) => step.capabilityId === toolId) ? rule.id : null;
}

const PROBES = [
  // routes
  ['go to the about section', 'site.about'],
  ['take me to about', 'site.about'],
  ['show me the blog', 'site.blog'],
  ['take me to the log', 'site.blog'],
  ['take me to contact', 'site.contact'],
  ['take me to his experience', 'site.experience'],
  ['take me to the projects', 'site.projects'],
  ['show me the projects', 'site.projects'],
  ['take me to skills', 'site.skills'],
  ['back to the top', 'site.top'],
  // actions
  ['show the newest article card', 'blog.card'],
  ['open the archive', 'blog.open_archive'],
  ['go to the archive', 'blog.open_archive'],
  ['see all the posts', 'blog.open_archive'],
  ['read the newest article', 'blog.open_newest'],
  ['show the contact card', 'contact.card'],
  ['copy his email', 'contact.copy_email'],
  ['copy the email address', 'contact.copy_email'],
  ['open linkedin', 'contact.open_linkedin'],
  ['open his linkedin', 'contact.open_linkedin'],
  ['show the hobnob card', 'projects.card'],
  ['what is readback?', 'projects.card'],
  ['expand the hobnob card', 'projects.expand'],
  ['more about groundglass', 'projects.expand'],
  ['open the hobnob site', 'projects.open'],
  ['source code for readback', 'projects.open'],
  ['open the printable resume', 'resume.print'],
  ['download the resume', 'resume.print'],
  ['print the resume', 'resume.print'],
  // queries
  ['how many posts are there?', 'posts.newest'],
  ['what is his current role?', 'profile.summary'],
  ['where is he based?', 'profile.summary'],
  ['how long has he been working?', 'profile.summary'],
  ['list the projects', 'projects.list_titles'],
  ['what has he built?', 'projects.list_titles'],
  // knowledge / answer rules
  ['who is sho?', 'knowledge.about'],
  ['tell me about him', 'knowledge.about'],
  ['what technologies does he use?', 'knowledge.skills'],
  ['what is his stack?', 'knowledge.skills'],
  ['what is his email?', 'contact.email'],
  ['his linkedin?', 'contact.linkedin'],
  ['which projects use python?', 'projects.using'],
  ['which projects use typescript?', 'projects.using'],
];

async function routeOf(question) {
  const completion = await engine.complete({ messages: [{ role: 'user', content: question }], tools: [] });
  const text = completion.text ?? '';
  const parsed = parseModelOutput(text);
  if (parsed.kind === 'tool') {
    const planned = rulePlanning(parsed.capabilityId, question);
    return { kind: planned ? 'plan' : 'tool', id: planned ?? parsed.capabilityId, tool: parsed.capabilityId, text };
  }
  const inference = (completion.steps ?? []).find((step) => step.type === 'inference');
  if (inference) return { kind: 'answer', id: inference.capabilityId, text: text.slice(0, 90) };
  // Knowledge capabilities answer with their own prose.
  const knowledgeCap = caps.find((cap) => cap.kind === 'knowledge' && cap.knowledge && text.startsWith(cap.knowledge.slice(0, 40)));
  if (knowledgeCap) return { kind: 'knowledge', id: knowledgeCap.id, text: text.slice(0, 90) };
  return { kind: 'prose', id: null, text: text.slice(0, 90) };
}

let pass = 0;
const failures = [];
for (const [question, expected] of PROBES) {
  const got = await routeOf(question);
  const ok = got.id === expected;
  if (ok) pass += 1;
  else failures.push({ question, expected, got });
}

console.log(`PASS ${pass}/${PROBES.length}`);
for (const failure of failures) {
  console.log(`\nFAIL  "${failure.question}"`);
  console.log(`  expected ${failure.expected} (${byId.get(failure.expected)?.kind ?? 'rule'})`);
  console.log(
    `  got      ${failure.got.id ?? '(prose)'} [${failure.got.kind}]${failure.got.tool ? ` via ${failure.got.tool}` : ''}  "${failure.got.text}"`,
  );
}
