// Baseline: the site's shipping system (answer rules + keyword engine), run in
// Node exactly as the page runs it, including its two-turn tool loop.
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MODULES = `${SITE}/node_modules/@shobyde/boaz/dist`;

export async function baseline(facts) {
  const { createRulesEngine } = await import(`${MODULES}/rules/index.js`);
  const { parseModelOutput } = await import(`${MODULES}/core/index.js`);
  const { createAssistantKnowledge } = await import(`${SITE}/src/agent/knowledge.js`);
  const caps = JSON.parse(
    fs.readFileSync(`${SITE}/dist/agent-manifest.json`, 'utf8'),
  ).capabilities;
  const posts = JSON.parse(
    fs.readFileSync(`${SITE}/content/posts/index.json`, 'utf8'),
  );
  const { knowledge, answers } = createAssistantKnowledge({ posts });

  const observationsFor = (id) => {
    if (id === 'projects.list') {
      return {
        projects: facts.projects.map((p) => ({
          title: p.title,
          stack: p.stack,
          summary: p.summary,
          details: true,
        })),
      };
    }
    if (id === 'blog.stats') {
      // The site's blog.stats capability returns { posts, newest }.
      return { posts: facts.posts.count, newest: facts.posts.newest.title };
    }
    if (id === 'profile.summary') {
      return { role: facts.role, years: 12, projects: facts.projects.length };
    }
    return {};
  };

  const page = `Contact. Email ${facts.email} or find him at ${facts.linkedin}.`;

  return {
    async answer({ question }) {
      // Fresh engine per question keeps the benchmark honest about single-turn text.
      const engine = createRulesEngine({
        knowledge,
        answers,
        capabilities: caps,
        grounding: { read: () => page },
        // Same declaration the site makes, so a technology is recognised before
        // the project list has been read.
        constants: [...new Set(facts.projects.flatMap((project) => project.stack))],
      });
      let completion = await engine.complete({ messages: [{ role: 'user', content: question }], tools: [] });
      let observations;
      for (let turn = 0; turn < 2; turn += 1) {
        const parsed = parseModelOutput(completion.text);
        if (parsed.kind !== 'tool') break;
        observations = { ...(observations ?? {}), [parsed.capabilityId]: observationsFor(parsed.capabilityId) };
        completion = await engine.complete({
          messages: [{ role: 'user', content: question }],
          tools: [],
          observations,
        });
      }
      return completion.text;
    },
  };
}
