/* ============================================================
   Capabilities for the site assistant.

   Metadata stays literal on purpose: the build crawler reads this
   file statically with the TypeScript AST and emits
   agent-manifest.json. Handlers are never part of the manifest; they
   are registered at runtime by src/agent/assistant.js.

   House rules for this file: no em-dashes, no invented facts, and
   every description written in the visitor's words rather than the
   component's.
   ============================================================ */
import { defineCapability, defineKnowledge, splitSentences, summarise } from '@shobyde/boaz/core';
import { DATA } from '../data.js';
import { articleCard, contactCard, findProject, projectCard } from './surfaces.js';
import { phraseSummary, rankPosts, summariseDocuments } from './summarise.js';

const plain = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export const siteCapabilities = [
  /* ---------- destinations ---------- */
  defineCapability({
    id: 'site.top',
    kind: 'route',
    title: 'Top of the page',
    description: 'Scrolls back to the top, where the headline and the download and contact buttons are.',
    keywords: ['top', 'start', 'beginning', 'hero', 'headline'],
    requiresConfirmation: true,
    route: '#hero',
  }),
  defineCapability({
    id: 'site.about',
    kind: 'route',
    title: 'About Sho',
    description:
      'Scrolls to the about section: what he has worked on for twelve years, how he works with teams, and the numbers behind it.',
    keywords: ['about', 'bio', 'background', 'who is', 'summary', 'stats'],
    requiresConfirmation: true,
    route: '#about',
  }),
  defineCapability({
    id: 'site.projects',
    kind: 'route',
    title: 'Selected projects',
    description:
      'Scrolls to the project cards, where every piece of work has architecture notes and engineering decisions behind an expand button.',
    keywords: ['projects', 'work', 'portfolio', 'built', 'examples', 'show me'],
    requiresConfirmation: true,
    route: '#projects',
  }),
  defineCapability({
    id: 'site.experience',
    kind: 'route',
    title: 'Work experience',
    description: 'Scrolls to the twelve year timeline of roles, employers, and what he did in each.',
    keywords: ['experience', 'jobs', 'career', 'history', 'timeline', 'employment'],
    requiresConfirmation: true,
    route: '#experience',
  }),
  defineCapability({
    id: 'site.skills',
    kind: 'route',
    title: 'Skills',
    description: 'Scrolls to the skill groups: languages, frameworks, data, cloud, and the leadership row.',
    keywords: ['skills', 'stack', 'tech', 'tools', 'languages', 'frameworks'],
    requiresConfirmation: true,
    route: '#skills',
  }),
  defineCapability({
    id: 'site.blog',
    kind: 'route',
    title: 'Engineering log',
    description:
      'Scrolls to the writing section, an AI-assisted daily log of news, notes, and build updates that he curates by hand.',
    keywords: ['blog', 'writing', 'log', 'posts', 'articles', 'reading', 'show me the blog'],
    requiresConfirmation: true,
    route: '#blog',
  }),
  defineCapability({
    id: 'site.contact',
    kind: 'route',
    title: 'Contact',
    description: 'Scrolls to the contact section with his email and LinkedIn.',
    keywords: ['contact', 'contact page', 'email', 'reach', 'hire', 'talk', 'linkedin', 'get in touch'],
    requiresConfirmation: true,
    route: '#contact',
  }),

  /* ---------- actions ---------- */
  defineCapability({
    id: 'resume.print',
    kind: 'action',
    title: 'Open the printable resume',
    description:
      'Opens the browser print dialog for this page. The print stylesheet turns it into a one page resume the visitor can save as PDF.',
    keywords: ['resume', 'cv', 'print', 'pdf', 'download resume', 'save'],
    handler: async (_params, ctx) => {
      ctx.dispatch('resume:print');
      return { opened: 'print dialog' };
    },
  }),
  defineCapability({
    id: 'contact.copy_email',
    kind: 'action',
    title: 'Copy the email address',
    description: 'Copies his email address to the clipboard so the visitor can paste it into their mail client.',
    keywords: ['copy email', 'email address', 'clipboard', 'copy address'],
    handler: async () => {
      await navigator.clipboard.writeText(DATA.contact.email);
      return { copied: DATA.contact.email };
    },
  }),
  defineCapability({
    id: 'contact.open_linkedin',
    kind: 'action',
    title: 'Open LinkedIn',
    description: 'Opens his LinkedIn profile in a new tab.',
    keywords: ['linkedin', 'profile', 'social', 'connect'],
    handler: async (_params, ctx) => {
      ctx.dispatch('contact:linkedin');
      return { opened: 'linkedin' };
    },
  }),
  defineCapability({
    id: 'blog.open_newest',
    kind: 'action',
    title: 'Read the newest article',
    description: 'Opens the most recent post in the engineering log as a full page.',
    keywords: ['newest', 'latest', 'read the newest article', 'read the last post', 'most recent article', 'newest article'],
    handler: async (_params, ctx) => {
      const newest = ctx.read('newestPost');
      if (!newest || !newest.slug) throw new Error('the post index has not loaded');
      ctx.dispatch('blog:open', { slug: newest.slug });
      return { opened: newest.title };
    },
  }),
  defineCapability({
    id: 'labs.tools',
    kind: 'route',
    title: 'Tools without a model',
    description:
      'Opens the lab where the manifest answers JSON-RPC tool calls and the page\'s own buttons are found by role and accessible name, with no model.',
    keywords: ['tools lab', 'json-rpc', 'mcp', 'accessibility tree', 'no model'],
    route: '/labs/tools/',
    requiresConfirmation: true,
  }),
  defineCapability({
    id: 'blog.open_archive',
    kind: 'action',
    title: 'Open the full archive',
    description:
      'Opens the archive page with every post, plus topic filters, search, and the publication calendar.',
    keywords: ['archive', 'all posts', 'see all posts', 'all the posts', 'every post', 'older posts', 'browse writing'],
    handler: async (_params, ctx) => {
      ctx.dispatch('blog:archive');
      return { opened: '/archive/' };
    },
  }),
  defineCapability({
    id: 'projects.expand',
    kind: 'action',
    title: 'Expand a project card',
    description:
      'Opens the engineering detail on one project card: the architecture, the trade-offs, and sometimes a diagram. Pick the project to open.',
    keywords: ['expand', 'expand card', 'engineering detail', 'architecture', 'how it works', 'more about'],
    route: '#projects',
    paramsSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['hobnob', 'readback', 'groundglass', 'shobyde', 'digipen'] },
      },
      required: ['project'],
      additionalProperties: false,
    },
    handler: async ({ project }, ctx) => {
      if (ctx.currentRoute !== '#projects') await ctx.navigate('#projects');
      const needles = {
        hobnob: 'hobnob',
        readback: 'readback',
        groundglass: 'groundglass',
        shobyde: 'shobyde.com',
        digipen: 'physics',
      };
      const needle = needles[project] || project;
      const cards = [...document.querySelectorAll('.project-card')];
      const card = cards.find((el) => (el.querySelector('.project-card__title')?.textContent || '').toLowerCase().includes(needle));
      if (!card) throw new Error(`no project card matched "${project}"`);
      const toggle = card.querySelector('.project-card__toggle');
      if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      return { expanded: card.querySelector('.project-card__title')?.textContent?.trim() };
    },
  }),

  defineCapability({
    id: 'projects.card',
    kind: 'action',
    title: 'Show a project card',
    description:
      'Shows a card for one project with its summary, its stack, and buttons for the engineering detail and the live site. Use it when the visitor asks what a project is or wants to see it rather than read a list.',
    keywords: ['show project', 'card', 'preview', 'what is hobnob', 'what is readback', 'project card'],
    route: '#projects',
    paramsSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['hobnob', 'readback', 'groundglass', 'shobyde', 'digipen'] },
      },
      required: ['project'],
      additionalProperties: false,
    },
    handler: async ({ project }, ctx) => {
      if (ctx.currentRoute !== '#projects') await ctx.navigate('#projects');
      const surface = projectCard(project);
      if (!surface) throw new Error(`no project named "${project}"`);
      return { surface, shown: project };
    },
  }),
  defineCapability({
    id: 'projects.open',
    kind: 'action',
    title: 'Open a project link',
    description:
      'Opens the live site or the public source for one project in a new tab. The link is chosen from a fixed list, never typed by the model.',
    keywords: ['open project', 'visit site', 'the site', 'website', 'source code', 'github', 'repo', 'open link'],
    paramsSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['hobnob', 'readback', 'groundglass', 'shobyde', 'digipen'] },
        link: { type: 'string', enum: ['site', 'source'] },
      },
      required: ['project', 'link'],
      additionalProperties: false,
    },
    handler: async ({ project, link }, ctx) => {
      const entry = findProject(project);
      const chosen = link === 'source' ? entry?.links[1] : entry?.links[0];
      if (!entry || !chosen) throw new Error(`no ${link} link for "${project}"`);
      ctx.dispatch('site:open_url', { url: chosen.url });
      return { opened: chosen.url };
    },
  }),
  defineCapability({
    id: 'contact.card',
    kind: 'action',
    title: 'Show the contact card',
    description:
      'Shows the email address and LinkedIn with buttons to copy the address or open the profile, for when the visitor wants to get in touch.',
    keywords: ['contact card', 'how do I reach him', 'email', 'get in touch', 'hire'],
    route: '#contact',
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_params, ctx) => {
      if (ctx.currentRoute !== '#contact') await ctx.navigate('#contact');
      return { surface: contactCard() };
    },
  }),
  defineCapability({
    id: 'blog.card',
    kind: 'action',
    title: 'Show the newest article card',
    description:
      'Shows a card for the newest post in the log with a button to read it and a button to browse everything.',
    keywords: ['article card', 'show the post', 'newest post', 'latest writing'],
    route: '#blog',
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_params, ctx) => {
      const newest = ctx.read('newestPost');
      if (!newest) throw new Error('the post index has not loaded');
      if (ctx.currentRoute !== '#blog') await ctx.navigate('#blog');
      return { surface: articleCard(newest) };
    },
  }),

  /* ---------- read-only context ---------- */
  defineCapability({
    id: 'profile.summary',
    kind: 'query',
    title: 'Profile summary',
    description:
      'Reads his current role, how many years he has been building software, where he is based, and the one line summary from the top of the page.',
    keywords: ['who is sho', 'what does he do', 'current role', 'how long', 'how long has he been working', 'years of experience', 'where based', 'manager'],
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const role = plain(DATA.hero.role);
      const current = DATA.experience[0];
      const since = String(current?.period || '').split('–')[0].trim();
      const where = since ? `${current.org} since ${since}` : current?.org || 'Conversica';
      return {
        answer: `Sho is an engineering manager and hands-on IC with 12+ years building APIs, cloud systems, and client-facing apps. He has been at ${where}, and his current title is ${current?.role || 'Engineering Manager (IC)'}.`,
        name: DATA.hero.name,
        role,
        years: '12+',
        region: 'Pacific Northwest',
        currentRole: current?.role || null,
        currentOrg: current?.org || null,
      };
    },
  }),
  defineCapability({
    id: 'blog.topics',
    kind: 'query',
    title: 'Summarise the blog',
    description:
      'Reads the posts and answers with sentences from them: what he writes about, or what he wrote about one subject.',
    keywords: [
      'what does he write about',
      'what does the blog cover',
      'what is the blog about',
      'topics',
      'themes',
      'summarise the blog',
      'summarize the blog',
    ],
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    // Retrieve, read, then pick three sentences that are not three versions of
    // one idea. The corpus is the posts' own markdown, which is already served.
    handler: async (_params, ctx) => {
      const posts = ctx.read('postsIndex') || [];
      const query = ctx.read('query') || '';
      const documents = await Promise.all(
        rankPosts(posts, query).map(async (post) => {
          try {
            const response = await fetch(`/content/posts/${post.slug}.md`);
            const markdown = response.ok ? await response.text() : post.excerpt;
            return { slug: post.slug, title: post.title, tag: post.tag, markdown };
          } catch {
            return { slug: post.slug, title: post.title, tag: post.tag, markdown: post.excerpt };
          }
        }),
      );
      const result = summariseDocuments(query, documents);
      return {
        answer: phraseSummary(result, { query }),
        documents: result.documents,
        sentences: result.sentences,
        picks: result.picks.map((pick) => ({
          slug: pick.source,
          title: pick.sourceTitle,
          text: pick.text,
        })),
      };
    },
  }),
  defineCapability({
    id: 'blog.stats',
    kind: 'query',
    title: 'Log statistics',
    description: 'Reads how many posts are published and which one is the newest.',
    keywords: ['how many posts', 'post count', 'posts published', 'updated when'],
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_params, ctx) => {
      const posts = ctx.read('postCount') || 0;
      const newest = ctx.read('newestPost');
      return {
        posts,
        newest: newest?.title ?? null,
        // phrase the reply here: a key/value dump reads like a database row
        answer: newest
          ? `${posts} posts are published, and the newest is "${newest.title}".`
          : `${posts} posts are published.`,
      };
    },
  }),
  defineCapability({
    id: 'projects.list',
    kind: 'query',
    title: 'List projects',
    description: 'Reads the titles and stacks of every project card on the page.',
    keywords: ['list projects', 'which projects', 'what has he built', 'project names'],
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    // The full stack, not the three chips the card shows: the assistant joins on
    // this data, and a truncated list turns "does he use SQLite" into "no".
    handler: async () => ({
      projects: DATA.projects.map((project) => ({
        title: project.title,
        // The card's own pitch. A comparison quotes the first sentence rather
        // than inventing a summary, so the payload has to carry it.
        summary: project.summary,
        stack: project.stack,
        details: Boolean(project.details),
      })),
    }),
  }),
  /* ---------- the page, read as material for a skill ---------- */
  defineCapability({
    id: 'page.sections',
    kind: 'query',
    title: 'Read the sections on this page',
    description: 'Returns the sentences of the visible sections, each tagged with the section it came from.',
    keywords: ['read this page', 'sentences on this page', 'the whole page'],
    paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
    // The host fills pageSections from the DOM (assistant.js); the capability
    // never touches the document itself, so it runs the same in a harness.
    handler: async (_params, ctx) => {
      const sections = ctx.read('pageSections') || [];
      const sentences = sections.flatMap((section) =>
        splitSentences(section.text)
          .filter((text) => text.length >= 40)
          .map((text) => ({ text, source: section.label })),
      );
      return {
        sections: sections.map((section) => section.label),
        sentences,
        text: sentences.map((sentence) => sentence.text).join(' '),
      };
    },
  }),
  defineCapability({
    id: 'page.points',
    kind: 'query',
    title: 'Pick points from these sentences',
    description: 'Chooses up to three sentences that answer the question and do not repeat each other.',
    keywords: ['pick points', 'choose sentences', 'three points'],
    paramsSchema: {
      type: 'object',
      properties: {
        sentences: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' }, source: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        },
      },
      required: ['sentences'],
      additionalProperties: false,
    },
    handler: async ({ sentences }, ctx) => {
      const result = summarise(sentences, { query: ctx.read('query') || '', k: 3 });
      // A question with no topic ("summarise this page") gives every sentence the
      // same relevance, so MMR's diversity term decides everything and picks the
      // most unusual sentences on the page. With nothing to be relevant to, the
      // honest summary is the leading sentence of each section, in page order.
      const bySource = new Map();
      for (const sentence of sentences) {
        if (!bySource.has(sentence.source)) bySource.set(sentence.source, sentence);
        if (bySource.size >= 3) break;
      }
      const picks = result.unguided ? [...bySource.values()] : result.picks.length < 3 ? [...bySource.values()] : result.picks;
      return {
        points: picks.map((pick) => ({ text: pick.text, source: pick.sourceTitle ?? pick.source })),
        // Echo what it read: a grounded check needs the source in the same result.
        text: sentences.map((sentence) => sentence.text).join(' '),
        considered: result.considered,
      };
    },
  }),
  defineKnowledge({
    id: 'knowledge.about',
    title: 'About Sho',
    description: 'Who Sho is and what he has worked on for twelve years.',
    keywords: ['about', 'bio', 'background', 'who is', 'who is he', 'tell me about him', 'about sho', 'summary'],
    knowledge:
      'Sho is a software engineer with twelve years of experience building web applications and platforms. ' +
      'He has worked across frontend, backend, and infrastructure, partnering with product and design teams to ship user-facing features.',
  }),
  defineKnowledge({
    id: 'knowledge.skills',
    title: 'Skills and stack',
    description: 'The technologies and tools Sho works with.',
    keywords: ['skills', 'stack', 'technologies', 'tools', 'languages'],
    knowledge:
      'Sho works primarily with JavaScript and TypeScript, React, Node.js, and modern web platform APIs. ' +
      'He has experience with cloud deployment, performance optimization, and accessible UI design.',
  }),
];

export const capabilityCount = siteCapabilities.length;
