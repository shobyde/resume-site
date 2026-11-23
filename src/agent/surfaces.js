/* ============================================================
   A2UI surfaces the assistant can render.

   These builders are pure: data in, A2UI 1.0 messages out, no DOM.
   That is deliberate. `scripts/build_surface_fixtures.mjs` imports
   this file under Node, writes every surface to JSONL, and
   `groundglass check` runs over the result in CI, so a surface the
   assistant can emit is a surface that has been conformance checked.

   Component rules held here: ids are UAX #31 (letters, digits,
   underscores), every component is reachable from root, buttons
   carry text and a named action, and text binds through the data
   model rather than being inlined.
   ============================================================ */
import { DATA } from '../data.js';

export const CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

export const PROJECT_KEYS = ['hobnob', 'readback', 'groundglass', 'shobyde', 'digipen'];

const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Cards carry the opening of the story; the expand button has the rest. */
function excerpt(text, limit = 180) {
  const clean = strip(text);
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const stop = cut.lastIndexOf('. ');
  return `${(stop > limit * 0.5 ? cut.slice(0, stop + 1) : cut).trimEnd()}…`;
}

export function surface(messages) {
  return [{ version: '1.0', ...messages }];
}

function createSurface(surfaceId, components, dataModel) {
  return surface({
    createSurface: {
      surfaceId,
      catalogId: CATALOG_ID,
      sendDataModel: true,
      components,
      dataModel,
    },
  });
}

export function findProject(key) {
  const needles = { hobnob: 'hobnob', readback: 'readback', groundglass: 'groundglass', shobyde: 'shobyde.com', digipen: 'physics' };
  const needle = needles[key];
  return DATA.projects.find((project) => project.title.toLowerCase().includes(needle));
}

export function projectCard(key) {
  const project = findProject(key);
  if (!project) return null;
  const [primary] = project.links;
  const children = ['title', 'meta', 'summary', 'stack', 'actions'];
  const actionChildren = ['detail_button'];
  if (primary) actionChildren.push('open_button');
  const components = [
    { id: 'root', component: 'Column', children: ['card'] },
    { id: 'card', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children },
    { id: 'title', component: 'Text', variant: 'h3', text: { '@path': '/project/title' } },
    { id: 'meta', component: 'Text', variant: 'caption', text: { '@path': '/project/meta' } },
    { id: 'summary', component: 'Text', text: { '@path': '/project/summary' } },
    { id: 'stack', component: 'Text', variant: 'caption', text: { '@path': '/project/stack' } },
    { id: 'actions', component: 'Row', children: actionChildren },
    {
      id: 'detail_button',
      component: 'Button',
      text: 'Engineering detail',
      action: { name: 'projects.expand', context: { project: key } },
    },
  ];
  if (primary) {
    components.push({
      id: 'open_button',
      component: 'Button',
      text: primary.label.replace(/^Visit /, 'Open '),
      action: { name: 'projects.open', context: { project: key, link: 'site' } },
    });
  }
  return createSurface(`project_${key}`, components, {
    project: {
      title: project.title,
      meta: project.meta.join(' · '),
      summary: excerpt(project.summary),
      stack: project.stack.slice(0, 4).join(' · '),
    },
  });
}

export function contactCard() {
  return createSurface(
    'contact',
    [
      { id: 'root', component: 'Column', children: ['heading', 'card'] },
      { id: 'heading', component: 'Text', variant: 'h3', text: 'Get in touch' },
      { id: 'card', component: 'Card', child: 'body' },
      { id: 'body', component: 'Column', children: ['email', 'note', 'actions'] },
      { id: 'email', component: 'Text', text: { '@path': '/contact/email' } },
      { id: 'note', component: 'Text', variant: 'caption', text: 'No form, no scheduler. A real inbox.' },
      { id: 'actions', component: 'Row', children: ['copy_button', 'linkedin_button'] },
      { id: 'copy_button', component: 'Button', text: 'Copy email', action: { name: 'contact.copy_email' } },
      { id: 'linkedin_button', component: 'Button', text: 'LinkedIn', action: { name: 'contact.open_linkedin' } },
    ],
    { contact: { email: DATA.contact.email } },
  );
}

export function articleCard(post) {
  if (!post) return null;
  const meta = [post.date, post.tag || 'log', post.minutes ? `${post.minutes} min read` : null]
    .filter(Boolean)
    .join(' · ');
  return createSurface(
    'newest_article',
    [
      { id: 'root', component: 'Column', children: ['heading', 'card'] },
      { id: 'heading', component: 'Text', variant: 'h3', text: 'Newest in the log' },
      { id: 'card', component: 'Card', child: 'body' },
      { id: 'body', component: 'Column', children: ['title', 'meta', 'actions'] },
      { id: 'title', component: 'Text', text: { '@path': '/article/title' } },
      { id: 'meta', component: 'Text', variant: 'caption', text: { '@path': '/article/meta' } },
      { id: 'actions', component: 'Row', children: ['read_button', 'archive_button'] },
      { id: 'read_button', component: 'Button', text: 'Read it', action: { name: 'blog.open_newest' } },
      { id: 'archive_button', component: 'Button', text: 'All writing', action: { name: 'blog.open_archive' } },
    ],
    { article: { title: post.title, meta } },
  );
}

/** Every surface the assistant can emit, for the conformance fixtures. */
export const SURFACE_CASES = [
  ...PROJECT_KEYS.map((key) => ({ name: `project_${key}`, build: () => projectCard(key) })),
  { name: 'contact', build: contactCard },
  {
    name: 'newest_article',
    build: () =>
      articleCard({
        title: 'Readback 0.2.0: rewards, and a catalog that fills the shelf',
        date: '2026-11-22',
        tag: 'project',
        minutes: 4,
      }),
  },
];
