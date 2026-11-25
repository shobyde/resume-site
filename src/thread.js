/* ============================================================
   Thread - the conversation page. The landing stays the record;
   this is a separate page where Boaz answers with prose and
   useful components, streamed into the thread.
   ============================================================ */
import boazPackage from '@shobyde/boaz/package.json';
import manifest from 'boaz:manifest';
import { createConversation } from '@shobyde/boaz/conversation';
import { DATA } from './data.js';
import { initBlog } from './blog.js';
import { initProgress } from './motion.js';
import { motionPrefs } from './motionPrefs.js';
import { createAssistantKnowledge } from './agent/knowledge.js';
import { siteCapabilities } from './agent/capabilities.js';
import { SITE_SUBJECTS } from './agent/sessionMemory.js';
import { PROJECT_SIZE } from './agent/projectSize.js';
import { renderA2UI } from './agent/a2ui.js';
import { pageIntent, questionsFor } from './page/pageSurface.js';
import './styles/main.css';
import './styles/sections.css';
import './styles/agent.css';
import './styles/thread.css';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const capCount = manifest.capabilities.length;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const shortChartLabel = (label) => {
  const iso = String(label || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) return `${MONTHS[Number(iso[2]) - 1] || iso[2]}${iso[3] ? ` ${iso[3]}` : ''}`;
  return String(label || '');
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shortDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
};

function matches(entry, alias) {
  const needle = String(alias || '').toLowerCase();
  return needle && String(entry).toLowerCase().includes(needle);
}

function projectKey(title) {
  const text = String(title);
  if (/hobnob/i.test(text)) return 'hobnob';
  if (/readback/i.test(text)) return 'readback';
  if (/groundglass/i.test(text)) return 'groundglass';
  if (/\bboaz\b/i.test(text)) return 'boaz';
  if (/shobyde/i.test(text)) return 'shobyde';
  if (/physics|digipen/i.test(text)) return 'digipen';
  return slug(text.split(':')[0]);
}

function projectsFor(intent) {
  if (intent.focus) {
    return DATA.projects.filter((project) => slug(project.title.split(':')[0]) === intent.focus);
  }
  if (intent.filter) {
    return DATA.projects.filter((project) => project.stack.some((entry) => matches(entry, intent.filter)));
  }
  return DATA.projects;
}

function projectList(intent) {
  const projects = projectsFor(intent);
  const head = `<div class="thread-component__head"><span>Work</span><span>${projects.length} record${projects.length === 1 ? '' : 's'}</span></div>`;
  if (!projects.length) {
    return `${head}<p class="thread-empty">No project on this page lists ${esc(intent.filter || 'that')}.</p>`;
  }
  const rows = projects.map((project) => {
    const links = project.links
      .map((link) => `<a href="${link.url}"${link.url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(link.label)}</a>`)
      .join('');
    const details = project.details
      ? `<details class="thread-project__details"><summary>Engineering detail</summary><p>${project.details.architecture}</p><ul>${project.details.decisions.map((d) => `<li>${d}</li>`).join('')}</ul></details>`
      : '';
    return `
      <article class="thread-project" data-project="${projectKey(project.title)}">
        <div class="thread-project__head">
          <h3>${project.title}</h3>
          <span>${project.meta.map((entry) => esc(entry)).join(' · ')}</span>
        </div>
        <p>${project.summary}</p>
        <div class="thread-project__stack">${project.stack.map((entry) => `<span class="tag">${esc(entry)}</span>`).join('')}</div>
        ${links ? `<div class="thread-project__links">${links}</div>` : ''}
        ${details}
      </article>`;
  }).join('');
  return `${head}${rows}`;
}

function roleList() {
  const rows = DATA.experience.map((role) => `
    <article class="thread-role">
      <span class="thread-role__period">${role.period}</span>
      <div>
        <h3>${role.role}</h3>
        <p>${role.org}</p>
        <details><summary>What he did</summary><ul>${role.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul></details>
      </div>
    </article>`).join('');
  return `<div class="thread-component__head"><span>History</span><span>${DATA.experience.length} roles</span></div>${rows}`;
}

function stackList() {
  const rows = DATA.skills.map((group) => `
    <div class="thread-spec">
      <h3>${group.group}</h3>
      <div class="thread-spec__tags">${group.tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div>
    </div>`).join('');
  return `<div class="thread-component__head"><span>Stack</span><span>${DATA.skills.reduce((n, group) => n + group.tags.length, 0)} tools</span></div>${rows}`;
}

function postList(posts) {
  const sorted = [...posts].sort((a, b) => `${b.date}-${b.slug}`.localeCompare(`${a.date}-${a.slug}`));
  const rows = sorted.slice(0, 8).map((post) => `
    <a class="thread-post" href="/posts/${esc(post.slug)}/">
      <time>${shortDate(post.date)}</time>
      <span class="thread-post__title">${esc(post.title)}</span>
      <span class="thread-post__tag">${esc(post.tag || 'log')}</span>
    </a>`).join('');
  return `<div class="thread-component__head"><span>Log</span><span>${sorted.length} entries</span></div>${rows}
    <p class="thread-archive"><a href="/archive/">All writing →</a></p>`;
}

function contactBlock() {
  return `
    <div class="thread-component__head"><span>Contact</span><span>No form</span></div>
    <div class="thread-contact">
      <a class="thread-contact__mail" href="mailto:${DATA.contact.email}">${DATA.contact.email}</a>
      <div class="thread-contact__links">
        <a class="btn btn--ink" href="mailto:${DATA.contact.email}">Email me</a>
        <a class="btn btn--ghost" href="${DATA.contact.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
      </div>
      <dl class="thread-contact__facts">
        <div><dt>Base</dt><dd>Pacific Northwest</dd></div>
        <div><dt>Status</dt><dd>Open to conversations</dd></div>
        <div><dt>Résumé</dt><dd>Printable from the record</dd></div>
      </dl>
    </div>`;
}

function profileBlock() {
  return `
    <div class="thread-component__head"><span>Profile</span><span>12+ years</span></div>
    <div class="thread-profile">
      <p>${DATA.about.p1}</p>
      <p>${DATA.about.p2}</p>
      <p>${DATA.about.p3}</p>
      <dl class="thread-profile__facts">
        <div><dt>Role</dt><dd>Engineering Manager (IC), Conversica</dd></div>
        <div><dt>Base</dt><dd>Pacific Northwest</dd></div>
        <div><dt>Focus</dt><dd>APIs, cloud, client-facing systems, agent UI</dd></div>
      </dl>
    </div>`;
}

function registerBlock() {
  const rows = manifest.capabilities.slice(0, 8).map((capability, index) => `
    <div class="thread-manifest__row">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <code>${esc(capability.id)}</code>
      <span>${esc(capability.kind || 'capability')}</span>
    </div>`).join('');
  return `
    <div class="thread-component__head"><span>Register</span><span>boaz v${esc(boazPackage.version)}</span></div>
    <div class="thread-register">
      <div class="thread-register__stats">
        <div><b>${capCount}</b><span>capabilities</span></div>
        <div><b>0</b><span>models</span></div>
        <div><b>0</b><span>network calls</span></div>
        <div><b>3 µs</b><span>to rank</span></div>
      </div>
      <div class="thread-manifest">${rows}</div>
      <p class="thread-archive"><a href="/boaz/">Read the boaz page →</a></p>
    </div>`;
}

function resolveGithub(question) {
  const text = String(question || '');
  if (!/\b(github|commits?|releases?|stars?|forks?|repos?)\b/i.test(text)) return null;
  let repo = 'all';
  if (/\bboaz\b/i.test(text)) repo = 'boaz';
  else if (/hobnob/i.test(text)) repo = 'hobnob';
  else if (/readback/i.test(text)) repo = 'readback';
  else if (/groundglass/i.test(text)) repo = 'groundglass';
  else if (/shobyde|resume-site|this site/i.test(text)) repo = 'shobyde';
  else if (!/\b(all|compare|projects|repos)\b/i.test(text)) repo = 'boaz';
  return { id: 'github.activity', args: { repo } };
}

function resolveChart(question) {
  const text = String(question || '');
  if (/(chart|graph|plot|visuali[sz]e)/i.test(text)) {
    if (/(role|career|history|timeline)/i.test(text)) return { id: 'charts.roles' };
    if (/\b(post|writing|blog|month|cadence|entries)\b|\blog\b/i.test(text)) return { id: 'charts.posts' };
    if (/(size|lines|codebase)/i.test(text)) return { id: 'charts.sizes' };
    if (/(tech|technology|stack|language|footprint)/i.test(text)) return { id: 'charts.tech' };
  }
  if (/\b(technology footprint|tech footprint|stack frequency)\b/i.test(text)) return { id: 'charts.tech' };
  if (/\b(which technologies show up|most used technologies|technology breakdown)\b/i.test(text)) return { id: 'charts.tech' };
  if (/\b(posts per month|posting cadence|posts by month)\b/i.test(text)) return { id: 'charts.posts' };
  if (/\b(roles over time|roles timeline|career timeline)\b/i.test(text)) return { id: 'charts.roles' };
  return null;
}

function lineChartMarkup(points, label) {
  const values = (points || []).map((point) => Number(point.value) || 0);
  const peak = Math.max(0, ...values);
  const scale = Math.max(1, peak);
  const count = Math.max(1, values.length);
  const coords = values.map((value, index) => {
    const x = count === 1 ? 50 : (index / (count - 1)) * 100;
    const y = 40 - (value / scale) * 38;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = count === 1
    ? `0,${coords[0].split(',')[1]} 100,${coords[0].split(',')[1]}`
    : coords.join(' ');
  const area = count === 1
    ? `0,40 0,${coords[0].split(',')[1]} 100,${coords[0].split(',')[1]} 100,40`
    : `0,40 ${line} 100,40`;
  const first = points?.[0]?.label || '';
  const last = points?.[points.length - 1]?.label || '';
  const spoken = (points || []).map((point) => `${point.label} ${point.value}`).join(', ');
  return `
    <div class="thread-line">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="${esc(label)}: ${esc(spoken)}">
        <polygon class="thread-line__area" points="${area}" />
        <polyline class="thread-line__line" points="${line}" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="thread-line__labels"><span>${esc(shortChartLabel(first))}</span><span>${peak} max</span><span>${esc(shortChartLabel(last))}</span></div>
    </div>`;
}

function chartComponent(chart) {
  if (!chart || !Array.isArray(chart.bars) || chart.bars.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'thread-component thread-chart';
  const valueLabel = (value) =>
    chart.format === 'number' ? Number(value).toLocaleString('en-US') : String(value);
  wrap.innerHTML = `<div class="thread-component__head"><span>${esc(chart.title || 'Chart')}</span><span>${esc(chart.unit || '')}</span></div>`;

  if (chart.kind === 'line') {
    wrap.innerHTML += lineChartMarkup(chart.bars, chart.title || 'Chart');
    return wrap;
  }

  if (chart.kind === 'timeline') {
    const start = Number(chart.start) || 2012;
    const end = Number(chart.end) || 2026;
    const total = Math.max(1, end - start + 1);
    const rows = chart.bars.map((bar) => {
      const left = ((Number(bar.start) - start) / total) * 100;
      const span = (Math.max(1, Number(bar.end) - Number(bar.start) + 1) / total) * 100;
      const civic = /school|teacher/i.test(`${bar.label} ${bar.meta || ''}`);
      return `
        <div class="thread-chart__row thread-chart__row--timeline">
          <span class="thread-chart__label">${esc(bar.label)}<small>${esc(bar.meta || '')}</small></span>
          <span class="thread-chart__lane" title="${esc(bar.label)} · ${bar.start}–${bar.end}">
            <i class="thread-chart__span${civic ? ' thread-chart__span--civic' : ''}" style="--start:${left.toFixed(2)}%;--span:${span.toFixed(2)}%"></i>
          </span>
          <span class="thread-chart__value">${bar.start}–${bar.end}</span>
        </div>`;
    }).join('');
    const axis = Array.from({ length: 8 }, (_, index) => start + Math.round((index * (end - start)) / 7));
    wrap.innerHTML += `<div class="thread-chart__bars">${rows}</div><div class="thread-chart__axis">${axis.map((year) => `<span>${year}</span>`).join('')}</div>`;
    return wrap;
  }

  const max = Math.max(1, ...chart.bars.map((bar) => Number(bar.value) || 0));
  const rows = chart.bars.map((bar) => {
    const width = ((Number(bar.value) || 0) / max) * 100;
    return `
      <div class="thread-chart__row">
        <span class="thread-chart__label">${esc(bar.label)}${bar.meta ? `<small>${esc(bar.meta)}</small>` : ''}</span>
        <span class="thread-chart__track"><i class="thread-chart__bar" style="--w:${width.toFixed(2)}%"></i></span>
        <span class="thread-chart__value">${valueLabel(bar.value)}</span>
      </div>`;
  }).join('');
  wrap.innerHTML += `<div class="thread-chart__bars">${rows}</div>`;
  return wrap;
}

function githubComponent(github) {
  if (!github?.repos?.length) return null;
  const value = (number) => Number(number || 0).toLocaleString('en-US');
  const wrap = document.createElement('div');
  wrap.className = 'thread-component thread-github';
  wrap.innerHTML = `<div class="thread-component__head"><span>GitHub</span><span>public API / cached 10 min</span></div>`;

  const live = github.repos.filter((repo) => !repo.error);
  if (live.length > 1) {
    const max = Math.max(1, ...live.map((repo) => repo.commits));
    wrap.innerHTML += `
      <div class="thread-chart__bars thread-github__compare">
        ${live.map((repo) => `
          <div class="thread-chart__row">
            <span class="thread-chart__label">${esc(repo.label)}</span>
            <span class="thread-chart__track"><i class="thread-chart__bar" style="--w:${((repo.commits / max) * 100).toFixed(2)}%"></i></span>
            <span class="thread-chart__value">${value(repo.commits)}</span>
          </div>`).join('')}
      </div>`;
  }

  for (const repo of github.repos) {
    const article = document.createElement('article');
    article.className = 'thread-github__repo';
    if (repo.error) {
      article.innerHTML = `
        <div class="thread-github__head"><span>${esc(repo.label)}</span><code>${esc(repo.repo)}</code></div>
        <p class="thread-empty">${esc(repo.error)}. GitHub's public API may be rate limited or the repository may be private.</p>`;
      wrap.appendChild(article);
      continue;
    }
    const activity = repo.weeks?.length ? repo.weeks : (repo.months || []);
    const releaseMax = Math.max(1, ...(repo.releaseMonths || []).map((point) => point.value));
    article.innerHTML = `
      <div class="thread-github__head">
        <span>${esc(repo.label)}</span>
        <code>${esc(repo.repo)}</code>
        <span class="thread-github__badge">${repo.cached ? 'CACHE' : 'LIVE'}</span>
      </div>
      <div class="thread-github__stats">
        <div><b>${value(repo.commits)}</b><span>commits</span></div>
        <div><b>${value(repo.releases)}</b><span>releases</span></div>
        <div><b>${value(repo.stars)}</b><span>stars</span></div>
        <div><b>${value(repo.openIssues)}</b><span>open items</span></div>
      </div>
      <p class="thread-github__chart-label">${repo.weeks?.length ? 'Commits by week' : 'Commits by month'}</p>
      ${lineChartMarkup(activity, repo.weeks?.length ? 'Commits by week' : 'Commits by month')}
      ${(repo.releaseMonths || []).length > 1 ? `
        <p class="thread-github__chart-label">Releases by month</p>
        <div class="thread-github__months thread-github__months--releases">
          ${repo.releaseMonths.map((point) => `
            <span class="thread-github__month">
              <i style="--h:${((point.value / releaseMax) * 100).toFixed(2)}%"></i>
              <small>${esc(point.label.slice(5))}</small>
            </span>`).join('')}
        </div>` : ''}
      ${(repo.releaseList || []).length ? `<p class="thread-github__releases">${repo.releaseList.map((release) => `<span>${esc(release.tag)}</span>`).join('')}</p>` : ''}`;
    wrap.appendChild(article);
  }

  const note = document.createElement('p');
  note.className = 'thread-github__note';
  note.textContent = 'Counts and recent commit history are read from the public GitHub API in this tab. The record answers stay offline; this tool makes a live request only when asked.';
  wrap.appendChild(note);
  return wrap;
}

function projectDetailHtml(project) {
  const links = project.links
    .map((link) => `<a href="${link.url}"${link.url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(link.label)}</a>`)
    .join('');
  return `
    <div class="thread-component">
      <div class="thread-component__head"><span>Engineering detail</span><span>${project.meta.map((entry) => esc(entry)).join(' · ')}</span></div>
      <h3 class="thread-project__detail-title">${project.title}</h3>
      <h4>Architecture</h4>
      <p>${project.details?.architecture || project.summary}</p>
      ${project.details?.decisions?.length ? `<h4>Engineering decisions</h4><ul>${project.details.decisions.map((decision) => `<li>${decision}</li>`).join('')}</ul>` : ''}
      ${links ? `<div class="thread-project__links">${links}</div>` : ''}
    </div>`;
}

function appendDetailTurn(project) {
  const log = document.getElementById('threadLog');
  if (!log) return;
  const turn = document.createElement('article');
  turn.className = 'thread-turn thread-turn--answer';
  const role = document.createElement('span');
  role.className = 'thread-turn__role';
  role.textContent = 'Boaz';
  const body = document.createElement('div');
  body.className = 'thread-turn__body';
  body.innerHTML = projectDetailHtml(project);
  turn.append(role, body);
  log.appendChild(turn);
  turn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function handleSurfaceAction(name, context) {
  if (name !== 'projects.expand') return false;
  const key = context?.project;
  const project = DATA.projects.find((entry) => projectKey(entry.title) === key);
  if (!project) return false;
  const card = [...document.querySelectorAll('#threadLog .thread-project')]
    .find((entry) => entry.dataset.project === key);
  const details = card?.querySelector('details');
  if (details) {
    details.open = true;
    details.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return true;
  }
  appendDetailTurn(project);
  return true;
}

const THREAD_COPY = {
  profile: 'Sho is an engineering manager and hands-on IC in the Pacific Northwest.',
  work: 'Selected projects, with the architecture and the decisions behind them.',
  stack: 'The tools he has shipped in production.',
  history: 'The roles, including the teaching year.',
  log: 'The latest entries from the engineering log.',
  register: 'The build manifest and the page engine.',
  contact: 'Email and LinkedIn. No form.',
};

function threadSummary(intent) {
  if (intent.view === 'work' && intent.filter) {
    const matches = projectsFor(intent);
    return `${matches.length} of ${DATA.projects.length} projects list ${intent.filter}.`;
  }
  if (intent.view === 'work' && intent.focus) {
    const project = DATA.projects.find((entry) => projectKey(entry.title) === intent.focus);
    if (project) return strip(project.summary);
  }
  return THREAD_COPY[intent.view] || strip(intent.note || '');
}

function componentFor(intent, posts) {
  const wrap = document.createElement('div');
  wrap.className = 'thread-component';
  switch (intent.view) {
    case 'work':
      wrap.innerHTML = projectList(intent);
      break;
    case 'history':
      wrap.innerHTML = roleList();
      break;
    case 'stack':
      wrap.innerHTML = stackList();
      break;
    case 'log':
      wrap.innerHTML = postList(posts);
      break;
    case 'contact':
      wrap.innerHTML = contactBlock();
      break;
    case 'profile':
      wrap.innerHTML = profileBlock();
      break;
    case 'register':
      wrap.innerHTML = registerBlock();
      break;
    default:
      return null;
  }
  return wrap;
}


function shell() {
  const nav = [
    ['about', 'Profile'],
    ['projects', 'Work'],
    ['register', 'Register'],
    ['experience', 'History'],
    ['skills', 'Stack'],
    ['blog', 'Log'],
    ['contact', 'Contact'],
  ].map(([id, label]) => `<a class="rail__link" href="/#${id}">${label}</a>`).join('');

  return `
    <div class="shell">
      <aside class="rail" aria-label="Record">
        <a class="rail__brand" href="/" aria-label="Sho Byde, back to the record">
          <span class="rail__mark" aria-hidden="true">SB</span>
          <span>
            <span class="rail__name">Sho<br />Byde</span>
            <span class="rail__role">Software engineer<br />Engineering manager</span>
          </span>
        </a>
        <nav class="rail__nav" aria-label="Record sections">${nav}</nav>
        <dl class="rail__status">
          <div class="rail__status-row"><dt>Current</dt><dd>Conversica<br />Engineering Manager (IC)</dd></div>
          <div class="rail__status-row"><dt>Base</dt><dd>Pacific Northwest</dd></div>
          <div class="rail__status-row"><dt>Last filed</dt><dd id="railLog">Loading log</dd></div>
        </dl>
        <button class="rail__ask" type="button" id="railAsk">
          <span>Ask the record</span>
          <small>⌘K · ${capCount} capabilities</small>
        </button>
        <div class="rail__progress" aria-hidden="true"><span id="progress"></span></div>
      </aside>

      <div class="page">
        <main class="thread-main" id="main-content" tabindex="-1">
          <div class="thread-bar">
            <span class="thread-bar__label">Thread</span>
            <button class="thread-bar__new" type="button" data-thread-new>New thread</button>
          </div>
          <div class="thread-log" id="threadLog" aria-live="polite"></div>
        </main>


      </div>
      <div class="agent" id="agentRoot">
        <form class="agent__launcher" id="agentLauncher" autocomplete="off">
          <div class="agent__launcher-top">
            <div class="agent__launcher-suggest" id="agentLauncherSuggest"></div>
            <span class="agent__launcher-power">powered by <a href="/boaz/">boaz</a></span>
          </div>
          <div class="agent__launcher-row">
            <span class="agent__launcher-dot" aria-hidden="true"></span>
            <label class="sr-only" for="agentLauncherInput">Ask the record</label>
            <input class="agent__launcher-input" id="agentLauncherInput" type="text" placeholder="Ask the record" />
            <span class="agent__launcher-busy" aria-hidden="true">processing</span>
            <button class="agent__launcher-send" type="submit" aria-label="Ask the record">&rarr;</button>
          </div>
        </form>
      </div>
    </div>`;
}

document.getElementById('app').innerHTML = shell();
initProgress();

let posts = [];
let conversation = null;
let busy = false;

function updateSuggestions(intent) {
  const dock = document.getElementById('agentLauncherSuggest');
  if (!dock) return;
  dock.innerHTML = questionsFor(intent)
    .map((question) => `<button type="button" data-ask="${esc(question)}">${esc(question)}</button>`)
    .join('');
}

function setDockBusy(value) {
  busy = value;
  const launcher = document.getElementById('agentLauncher');
  const input = document.getElementById('agentLauncherInput');
  const send = launcher?.querySelector('.agent__launcher-send');
  launcher?.classList.toggle('is-busy', value);
  launcher?.setAttribute('aria-busy', String(value));
  if (input) input.disabled = value;
  if (send) send.disabled = value;
}

function titleOf(id) {
  return manifest.capabilities.find((capability) => capability.id === id)?.title || id;
}

function beginTurn(question) {
  const log = document.getElementById('threadLog');
  if (!log) return null;
  log.setAttribute('aria-busy', 'true');
  const user = document.createElement('article');
  user.className = 'thread-turn thread-turn--user';
  const userRole = document.createElement('span');
  userRole.className = 'thread-turn__role';
  userRole.textContent = 'You';
  const userBody = document.createElement('div');
  userBody.className = 'thread-turn__body';
  const userText = document.createElement('p');
  userText.textContent = question;
  userBody.appendChild(userText);
  user.append(userRole, userBody);

  const answer = document.createElement('article');
  answer.className = 'thread-turn thread-turn--answer';
  answer.setAttribute('aria-busy', 'true');
  const answerRole = document.createElement('span');
  answerRole.className = 'thread-turn__role';
  answerRole.textContent = 'Boaz';
  const body = document.createElement('div');
  body.className = 'thread-turn__body';
  const status = document.createElement('p');
  status.className = 'thread-reading';
  status.setAttribute('role', 'status');
  status.innerHTML = 'Reading the record<span class="thread-reading__dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  body.appendChild(status);
  answer.append(answerRole, body);
  log.append(user, answer);
  answer.scrollIntoView({ block: 'nearest', behavior: motionPrefs.reduced ? 'auto' : 'smooth' });
  return { answer, body, status, textEl: null, calls: new Map() };
}

function setStatus(turn, text) {
  if (!turn?.status || !text) return;
  turn.status.innerHTML = `${esc(text)}<span class="thread-reading__dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
}

function addToolCall(turn, id, args) {
  if (!turn || turn.calls.has(id)) return;
  const call = document.createElement('div');
  call.className = 'thread-call';
  call.dataset.call = id;
  call.innerHTML = `<span>${esc(titleOf(id))}</span><code>${esc(JSON.stringify(args || {}))}</code><span class="thread-call__state">running</span>`;
  turn.body.appendChild(call);
  turn.calls.set(id, call);
}

function finishToolCall(turn, id, ok) {
  const call = turn?.calls.get(id);
  if (!call) return;
  call.classList.add(ok ? 'is-done' : 'is-failed');
  const state = call.querySelector('.thread-call__state');
  if (state) state.textContent = ok ? 'done' : 'failed';
}

function appendAnswerText(turn, text) {
  if (!turn || !text) return;
  if (!turn.textEl) {
    turn.textEl = document.createElement('p');
    turn.body.appendChild(turn.textEl);
  }
  turn.textEl.textContent += text;
  turn.status?.remove();
  turn.status = null;
  const log = document.getElementById('threadLog');
  if (log) log.scrollTop = log.scrollHeight;
}

function renderSurface(turn, capabilityId, messages) {
  if (!turn || !Array.isArray(messages) || messages.length === 0) return;
  const holder = document.createElement('div');
  holder.className = 'agent__surface';
  turn.body.appendChild(holder);
  renderA2UI(messages, holder, { onAction: handleSurfaceAction });
  const note = document.createElement('p');
  note.className = 'agent__surface-note';
  note.title = capabilityId;
  note.textContent = `◇ A2UI · ${titleOf(capabilityId)}`;
  holder.appendChild(note);
}

function addToolSummary(body, steps) {
  const ids = [];
  for (const step of steps) {
    if (!step?.capabilityId || !['query', 'action', 'surface', 'navigate'].includes(step.type)) continue;
    if (!ids.includes(step.capabilityId)) ids.push(step.capabilityId);
  }
  if (ids.length === 0) return;
  const details = document.createElement('details');
  details.className = 'thread-tools';
  details.innerHTML = `<summary>Tools used</summary><ul>${ids
    .map((id) => `<li>${esc(titleOf(id))}<code>${esc(id)}</code></li>`)
    .join('')}</ul>`;
  body.appendChild(details);
}

function renderTurnComponents(turn, question, result) {
  if (!turn) return;
  const intent = pageIntent(question);
  if (intent) updateSuggestions(intent);
  const postStep = result.steps.some((step) =>
    step.capabilityId === 'posts.newest' || step.capabilityId === 'blog.stats',
  );
  if (postStep && !result.steps.some((step) => step.type === 'surface')) {
    updateSuggestions({ view: 'log' });
    const log = componentFor({ view: 'log' }, posts);
    if (log) turn.body.appendChild(log);
    return;
  }
  const githubStep = result.steps.find((step) => step.type === 'query' && step.result?.github);
  const chartStep = result.steps.find((step) => step.type === 'query' && step.result?.chart);
  if (githubStep) {
    const github = githubComponent(githubStep.result.github);
    if (github) turn.body.appendChild(github);
    return;
  }
  if (chartStep) {
    const chart = chartComponent(chartStep.result.chart);
    if (chart) turn.body.appendChild(chart);
    return;
  }
  if (!intent || intent.view === 'home') return;
  if (result.steps.some((step) => step.type === 'surface')) return;
  const answer = (turn.textEl?.textContent || '').trim();
  const weak = /^(I'm not sure|I couldn't finish|I can do that|I can only|I couldn't complete|That did not work|I couldn't)/i.test(answer);
  const pure = /^\s*(show|open|view|go to|take me to)?\s*(me\s+)?(the|his|your)?\s*(profile|work|projects?|stack|skills?|history|experience|log|blog|register|contact)\s*[?.!]*$/i.test(question);
  if (turn.textEl && (weak || pure)) turn.textEl.textContent = threadSummary(intent);
  const component = componentFor(intent, posts);
  if (component) turn.body.appendChild(component);
}

function appendPageTurn(question, intent) {
  const log = document.getElementById('threadLog');
  if (!log) return;
  const user = document.createElement('article');
  user.className = 'thread-turn thread-turn--user';
  const userRole = document.createElement('span');
  userRole.className = 'thread-turn__role';
  userRole.textContent = 'You';
  const userBody = document.createElement('div');
  userBody.className = 'thread-turn__body';
  const userText = document.createElement('p');
  userText.textContent = question;
  userBody.appendChild(userText);
  user.append(userRole, userBody);

  const answer = document.createElement('article');
  answer.className = 'thread-turn thread-turn--answer';
  const answerRole = document.createElement('span');
  answerRole.className = 'thread-turn__role';
  answerRole.textContent = 'Boaz';
  const answerBody = document.createElement('div');
  answerBody.className = 'thread-turn__body';
  const answerText = document.createElement('p');
  answerText.textContent = threadSummary(intent);
  answerBody.appendChild(answerText);
  const component = componentFor(intent, posts);
  if (component) answerBody.appendChild(component);
  answer.append(answerRole, answerBody);

  log.append(user, answer);
  updateSuggestions(intent);
  answer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function ask(question) {
  const text = String(question || '').trim();
  if (!text || busy || !conversation) return;
  const intent = pageIntent(text);
  const pageCommand = /^\s*(show|open|view|go to|take me to)\b/i.test(text)
    && !/\b(card|newest article|surface)\b/i.test(text);
  if (intent && intent.view !== 'home' && pageCommand) {
    appendPageTurn(text, intent);
    return;
  }

  setDockBusy(true);
  const turn = beginTurn(text);
  try {
    for await (const event of conversation.stream(text)) {
      if (event.type === 'turn.started') {
        setStatus(turn, 'Matching the record');
      } else if (event.type === 'retrieval') {
        setStatus(turn, `Searching ${event.ids.length} capabilities`);
      } else if (event.type === 'tool.use') {
        setStatus(turn, `Reading ${titleOf(event.id)}`);
        addToolCall(turn, event.id, event.args);
      } else if (event.type === 'tool.result') {
        finishToolCall(turn, event.id, event.ok);
      } else if (event.type === 'step') {
        if (event.step.type === 'surface') renderSurface(turn, event.step.capabilityId, event.step.messages);
        if (event.step.type === 'inference') setStatus(turn, 'Applying a rule');
      } else if (event.type === 'text.delta') {
        appendAnswerText(turn, event.text);
      } else if (event.type === 'turn.completed') {
        if (!turn.textEl && event.turn.text) appendAnswerText(turn, event.turn.text);
        renderTurnComponents(turn, event.turn.turn.query || text, event.turn);
        addToolSummary(turn.body, event.turn.steps);
        turn.status?.remove();
        turn.status = null;
      } else if (event.type === 'error') {
        turn.status?.remove();
        turn.status = null;
        appendAnswerText(turn, `That did not work: ${event.message}`);
      }
    }
  } catch (error) {
    turn.status?.remove();
    turn.status = null;
    appendAnswerText(turn, `That did not work: ${error.message}`);
  } finally {
    turn.answer.setAttribute('aria-busy', 'false');
    document.getElementById('threadLog')?.setAttribute('aria-busy', 'false');
    setDockBusy(false);
    const input = document.getElementById('agentLauncherInput');
    if (input) input.value = '';
    turn.answer.scrollIntoView({ block: 'nearest', behavior: motionPrefs.reduced ? 'auto' : 'smooth' });
  }
}

function newThread() {
  conversation?.reset();
  document.getElementById('threadLog')?.replaceChildren();
  updateSuggestions({ view: 'home' });
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.getElementById('agentLauncherInput')?.focus();
}

document.addEventListener('click', (event) => {
  const askButton = event.target.closest('[data-ask]');
  if (askButton) {
    event.preventDefault();
    void ask(askButton.getAttribute('data-ask'));
    return;
  }
  if (event.target.closest('[data-thread-new]')) {
    event.preventDefault();
    newThread();
    return;
  }
  if (event.target.closest('#railAsk')) {
    document.getElementById('agentLauncherInput')?.focus();
  }
});

document.getElementById('agentLauncher')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.getElementById('agentLauncherInput');
  const text = input?.value.trim();
  if (!text) { input?.focus(); return; }
  input.value = '';
  void ask(text);
});

async function boot() {
  const state = await initBlog();
  posts = state?.posts || [];

  const railLog = document.getElementById('railLog');
  if (railLog && posts.length) {
    railLog.innerHTML = `${posts.length} entries<br /><span>${shortDate(posts[0].date)}</span>`;
  } else if (railLog) {
    railLog.textContent = 'No entries';
  }

  const { knowledge, answers } = createAssistantKnowledge({ posts });
  const plannerCapabilities = manifest.capabilities.filter((capability) => capability.id !== 'page.compose');
  conversation = createConversation({
    knowledge,
    answers,
    tools: siteCapabilities,
    capabilities: plannerCapabilities,
    subjects: SITE_SUBJECTS,
    descriptions: [
      { match: /reading|books|kid/i, subject: 'Readback' },
      { match: /meeting|notes|record/i, subject: 'Hobnob' },
      { match: /generated|interface|conformance/i, subject: 'Groundglass' },
      { match: /no.model|browser assistant/i, subject: 'Boaz' },
    ],
    pointable: (name) => DATA.projects.some((project) => String(project.title).split(':')[0].trim().toLowerCase() === String(name).toLowerCase()),
    sizeOf: (name) => PROJECT_SIZE[String(name).split(':')[0].trim()]?.lines ?? null,
    constants: [...new Set(DATA.projects.flatMap((project) => project.stack))],
    resolveTool: (question) => resolveGithub(question) || resolveChart(question),
    getSnapshot: () => ({ currentRoute: '/thread/', state: { postCount: posts.length, newestPost: posts[0] ?? null } }),
    navigate: (route) => {
      if (route.startsWith('/')) location.assign(route);
      else document.querySelector(route)?.scrollIntoView({ behavior: motionPrefs.reduced ? 'auto' : 'smooth' });
    },
    dispatch: (event, payload) => {
      if (event === 'resume:print') window.print();
      else if (event === 'contact:linkedin') window.open('https://www.linkedin.com/in/sho-byde-556954138/', '_blank', 'noopener');
      else if (event === 'site:open_url' && payload?.url) window.open(payload.url, '_blank', 'noopener');
      else if (event === 'blog:open' && payload?.slug) location.assign(`/posts/${payload.slug}/`);
    },
    confirm: async () => true,
    streaming: motionPrefs.reduced ? false : { chunkChars: 14, paceMs: 16, leadInMs: 650 },
  });

  window.__clerk = {
    ask: (question) => void ask(question),
    submit: (question) => void ask(question),
    reset: newThread,
    focus: () => document.getElementById('agentLauncherInput')?.focus(),
    memory: () => conversation.memory,
    runtime: conversation.runtime,
  };

  updateSuggestions({ view: 'home' });
  const question = new URLSearchParams(location.search).get('q');
  if (question) setTimeout(() => window.__clerk.ask(question), 260);
}

boot();
