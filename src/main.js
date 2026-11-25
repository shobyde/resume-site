/* ============================================================
   Main - assembles the working record and wires its instruments.
   ============================================================ */
import boazPackage from '@shobyde/boaz/package.json';
import manifest from 'boaz:manifest';
import { registry } from '@shobyde/boaz/core';
import { DATA } from './data.js';
import { initReveals, initProgress } from './motion.js';
import { initBlog } from './blog.js';
import { renderA2UI } from './agent/a2ui.js';
import { articleCard, contactCard, projectCard } from './agent/surfaces.js';
import { pageSurface, questionsFor } from './page/pageSurface.js';
import './styles/main.css';
import './styles/sections.css';
import './styles/agent.css';
import './styles/print.css';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const capCount = manifest.capabilities.length;
let currentPageSurface = pageSurface({ view: 'home' });
const PROJECT_ORDER = [];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}

const CAREER_START = 2012;
const CAREER_END = 2026;

function yearsIn(period) {
  const years = String(period).match(/\d{4}/g) || [];
  const start = Number(years[0]) || CAREER_START;
  const end = /present/i.test(period) ? CAREER_END : Number(years[1]) || start;
  return { start, end };
}

function chartRows() {
  return DATA.experience.map((item) => {
    const { start, end } = yearsIn(item.period);
    const offset = ((start - CAREER_START) / (CAREER_END - CAREER_START + 1)) * 100;
    const span = (Math.max(1, end - start + 1) / (CAREER_END - CAREER_START + 1)) * 100;
    const isCivic = /volunteer|teacher/i.test(`${item.role} ${item.org}`);
    const isCurrent = /present/i.test(item.period);
    const label = isCivic ? 'High school' : item.org;
    return `
      <div class="career-chart__row">
        <span class="career-chart__label">${esc(label)}</span>
        <div class="career-chart__lane" title="${esc(item.org)} · ${esc(item.period)}">
          <span class="career-chart__bar${isCurrent ? ' career-chart__bar--current' : isCivic ? ' career-chart__bar--civic' : ''}" style="--start:${offset.toFixed(3)}%;--span:${span.toFixed(3)}%"></span>
        </div>
      </div>`;
  }).join('');
}

function buildPage() {
  const starters = questionsFor({ view: 'home' }).slice(0, 5)
    .map((question) => `<button type="button" data-home-ask="${esc(question)}">${esc(question)}</button>`)
    .join('');
  const projects = DATA.projects.map((p, i) => {
    const index = String(i + 1).padStart(2, '0');
    const meta = p.meta.map((m) => `<span>${esc(m)}</span>`).join('');
    const stack = p.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    const links = p.links
      .map((l) => `<a class="project-card__link" href="${l.url}"${l.url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(l.label)}</a>`)
      .join('');
    const details = p.details
      ? `
        <div class="project-card__details" id="proj-details-${i}" aria-hidden="true" inert>
          <div>
            <div class="project-card__details-inner">
              <div>
                <h4>Architecture</h4>
                <p>${p.details.architecture}</p>
                ${p.details.diagram ? `<div class="project-card__diagram"><img src="${p.details.diagram.src}" alt="${esc(p.details.diagram.alt)}" width="800" height="450" loading="lazy" /></div>` : ''}
              </div>
              <div>
                <h4>Engineering decisions</h4>
                <ul>${p.details.decisions.map((d) => `<li>${d}</li>`).join('')}</ul>
              </div>
            </div>
          </div>
        </div>`
      : '';
    const toggle = p.details
      ? `<button class="project-card__toggle" type="button" aria-expanded="false" aria-controls="proj-details-${i}" aria-label="Architecture and engineering decisions for ${esc(p.title)}">Architecture <span aria-hidden="true">+</span></button>`
      : '';
    return `
      <li class="project-card${i === 0 ? ' project-card--lead' : ''}" data-project="${esc(p.title.split(':')[0])}" data-key="${slug(p.title.split(':')[0])}" data-stack="${esc(p.stack.join('|').toLowerCase())}">
        <div class="project-card__index" aria-hidden="true">P.${index}</div>
        <div class="project-card__body">
          <span class="project-card__lead-tag"${i === 0 ? '' : ' hidden'}>Featured</span>
          <h3 class="project-card__title">${p.title}</h3>
          <p class="project-card__summary">${p.summary}</p>
          <div class="project-card__stack">${stack}</div>
          <div class="project-card__actions">${links}${toggle}</div>
        </div>
        <div class="project-card__meta">${meta}</div>
        ${details}
      </li>`;
  }).join('');

  const chart = chartRows();
  const axis = [2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026].map((y) => `<span>${y}</span>`).join('');

  const timeline = DATA.experience.map((item) => {
    const isCivic = /volunteer|teacher/i.test(`${item.role} ${item.org}`);
    const isCurrent = /present/i.test(item.period);
    const tag = isCurrent
      ? '<span class="tl-item__tag">Current</span>'
      : isCivic
        ? '<span class="tl-item__tag tl-item__tag--civic">Civic</span>'
        : '';
    return `
      <article class="tl-item${isCivic ? ' tl-item--civic' : ''}">
        <div class="tl-item__when">
          <span class="tl-item__period">${item.period}</span>
          ${tag}
        </div>
        <div>
          <h3 class="tl-item__role">${item.role}</h3>
          <p class="tl-item__org">${item.org}${item.loc ? ` <em>· ${item.loc}</em>` : ''}</p>
          <ul class="tl-item__bullets">${item.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
        </div>
      </article>`;
  }).join('');

  const skills = DATA.skills.map((group) => `
    <div class="spec-row">
      <h3 class="spec-row__group">${group.group}</h3>
      <span class="spec-row__count">${String(group.tags.length).padStart(2, '0')}</span>
      <div class="spec-row__tags">${group.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    </div>`).join('');

  const stats = DATA.stats.map((s, i) => {
    const value = i === DATA.stats.length - 1 ? String(capCount) : s.text ? s.text : `${s.num}${s.suffix || ''}`;
    return `
    <div class="hero__stat">
      <span class="hero__num">${value}</span>
      <span class="hero__label">${s.label}</span>
    </div>`;
  }).join('');

  const manifestRows = manifest.capabilities.slice(0, 8).map((capability, i) => `
    <div class="manifest__row">
      <span>${String(i + 1).padStart(2, '0')}</span>
      <code>${esc(capability.id)}</code>
      <span>${esc(capability.kind || 'capability')}</span>
    </div>`).join('');

  return `
  <div class="shell">
    <aside class="rail" aria-label="Working record">
      <div class="rail__brand">
        <span class="rail__mark" aria-hidden="true">SB</span>
        <div>
          <div class="rail__name">Sho<br />Byde</div>
          <div class="rail__role">Software engineer<br />Engineering manager</div>
        </div>
      </div>

      <nav class="rail__nav" aria-label="Primary">
        <a class="rail__link nav__link" href="#about" data-section="about">Profile</a>
        <a class="rail__link nav__link" href="#projects" data-section="projects">Work</a>
        <a class="rail__link nav__link" href="#register" data-section="register">Register</a>
        <a class="rail__link nav__link" href="#experience" data-section="experience">History</a>
        <a class="rail__link nav__link" href="#skills" data-section="skills">Stack</a>
        <a class="rail__link nav__link" href="#blog" data-section="blog">Log</a>
        <a class="rail__link nav__link" href="#contact" data-section="contact">Contact</a>
        <a class="rail__link" href="/thread/">Thread</a>
        <a class="rail__link rail__link--reset" href="#hero" data-page-reset data-reset-link hidden>Full record</a>
      </nav>

      <dl class="rail__status">
        <div class="rail__status-row"><dt>Current</dt><dd>Conversica<br />Engineering Manager (IC)</dd></div>
        <div class="rail__status-row"><dt>Base</dt><dd>Pacific Northwest</dd></div>
        <div class="rail__status-row"><dt>Last filed</dt><dd id="railLog">Loading log</dd></div>
      </dl>

      <a class="rail__ask" href="/thread/">
        <span>Ask the record</span>
        <small>${capCount} capabilities · open the thread</small>
      </a>

      <div class="rail__progress" aria-hidden="true"><span id="progress"></span></div>
    </aside>

    <div class="page page--home">
      <main id="main-content" tabindex="-1">
        <div class="print-header">
          <h1>Sho Byde</h1>
          <p>Software engineer / engineering manager · Pacific Northwest</p>
          <p><a href="mailto:${DATA.contact.email}">${DATA.contact.email}</a> · <a href="${DATA.contact.linkedin}">LinkedIn</a> · <a href="https://shobyde.com/">shobyde.com</a></p>
        </div>
        <section class="hero" id="hero">
          <div class="hero__meta">
            <span>Portfolio / 2012-2026</span>
            <span>Software engineer / engineering manager</span>
            <span>Pacific Northwest</span>
          </div>

          <div class="hero__grid">
            <div class="hero__copy">
              <p class="eyebrow hero__kicker" id="heroKicker">Working record · open to conversations</p>
              <h1 class="hero__title" id="heroTitle" aria-label="${DATA.hero.headlineText}">I build<br />software<br />that solves<br /><span class="mark">real problems.</span></h1>
              <p class="hero__lede" id="heroLede">${DATA.hero.role}</p>
              <div class="hero__actions" id="heroActions">
                <a class="btn btn--ink" href="#projects">See the work <span class="btn__arrow" aria-hidden="true">→</span></a>
                <button class="btn btn--ghost" type="button" id="resumeBtn" data-print>Résumé (PDF)</button>
              </div>
              <p class="hero__note" id="heroNote">The record is the page. <a href="/thread/">Open the thread</a> to ask a question.</p>
            </div>


          </div>

          <div class="hero__stats" id="heroStats" role="group" aria-label="At a glance">${stats}</div>
        </section>

        <section class="section" id="about">
          <div class="section__head">
            <div>
              <p class="section__label">Profile</p>
              <h2 class="section__title">Twelve years of building, and the <span class="mark">people</span> around it.</h2>
            </div>
            <p class="section__sub">A working engineer's record: APIs and cloud systems, teams and escalations, and one year spent teaching an intro CS class before work.</p>
          </div>
          <div class="about__grid">
            <div class="about__body reveal">
              <p>${DATA.about.p1}</p>
              <p>${DATA.about.p2}</p>
              <p>${DATA.about.p3}</p>
            </div>
            <aside class="about__side reveal">
              <dl class="side-table">
                <div class="side-table__row"><dt>Name</dt><dd>Sho Byde</dd></div>
                <div class="side-table__row"><dt>Role</dt><dd>Engineering Manager (IC), Conversica</dd></div>
                <div class="side-table__row"><dt>Base</dt><dd>Pacific Northwest</dd></div>
                <div class="side-table__row"><dt>Focus</dt><dd>APIs, cloud, client-facing systems, agent UI</dd></div>
                <div class="side-table__row"><dt>Elsewhere</dt><dd><a href="${DATA.contact.linkedin}" target="_blank" rel="noopener">LinkedIn</a> · <a href="mailto:${DATA.contact.email}">Email</a></dd></div>
              </dl>
              <div class="about__quote">
                <p>“I care just as much about the people: fostering positive workplace culture, mentoring, and contributing to team life.”</p>
                <cite>From the record</cite>
              </div>
            </aside>
          </div>
        </section>

        <section class="section" id="projects">
          <div class="section__head">
            <div>
              <p class="section__label">Selected work</p>
              <h2 class="section__title" id="workTitle">Work that survives contact with <span class="mark">production</span>.</h2>
            </div>
            <p class="section__sub" id="workSub">Six projects with the architecture and trade-offs behind each one. Expand a row for the decisions, not the adjectives.</p>
          </div>
          <div class="work-result" id="workResult" hidden>
            <span class="work-result__label">Result</span>
            <div class="work-result__main"><strong id="workResultCount"></strong><span id="workResultNames"></span></div>
            <button class="work-result__clear" type="button" data-page-reset>Clear filter</button>
          </div>
          <div class="work-table">
            <div class="work-head" aria-hidden="true"><span>Index</span><span>Project</span><span>Type</span></div>
            <ol class="work-list" style="list-style:none">${projects}</ol>
            <p class="work-empty" id="workEmpty" hidden>No project on this page matches that filter. <button class="work-empty__reset" type="button" data-page-reset>Full record</button></p>
          </div>
        </section>

        <section class="register" id="register" aria-labelledby="registerTitle">
          <div class="register__grid">
            <div>
              <p class="section__label">Boaz / A2UI 1.0</p>
              <h2 class="register__title" id="registerTitle">The page is the <span class="mark">demo</span>.</h2>
              <p class="register__body">The assistant here is <strong>Boaz</strong>, an in-browser engine with no model and no API key. The build scans the app for <code>defineCapability()</code>, publishes a manifest, and the runtime answers from that manifest and the facts beside it. An answer can become a <strong>declarative surface</strong> instead of a paragraph.</p>
              <div class="register__stats">
                <div class="register__stat"><b>${capCount}</b><span>capabilities in the manifest</span></div>
                <div class="register__stat"><b>0</b><span>models downloaded</span></div>
                <div class="register__stat"><b>0</b><span>network calls to answer</span></div>
                <div class="register__stat"><b>3 µs</b><span>to rank every capability</span></div>
              </div>
              <div class="register__links">
                <a href="/boaz/">Read the boaz page</a>
                <a href="https://github.com/shobyde/boaz">Source &amp; releases</a>
              </div>
              <blockquote class="register__quote">
                “Answers come from the record, and changes happen where they can be seen.”
                <cite>boaz / the contract</cite>
              </blockquote>
            </div>
            <div>
              <div class="viewer" id="surfaceViewer">
                <div class="viewer__bar">
                  <span class="viewer__label"><b>A2UI 1.0</b> / live surface</span>
                  <div class="viewer__tabs" role="tablist" aria-label="A2UI surface">
                    <button class="viewer__tab" type="button" role="tab" id="tab-project" aria-controls="surfaceStage" data-surface="project" aria-selected="true">project_card</button>
                    <button class="viewer__tab" type="button" role="tab" id="tab-contact" aria-controls="surfaceStage" data-surface="contact" aria-selected="false">contact</button>
                    <button class="viewer__tab" type="button" role="tab" id="tab-article" aria-controls="surfaceStage" data-surface="article" aria-selected="false">newest_article</button>
                    <button class="viewer__tab" type="button" role="tab" id="tab-page" aria-controls="surfaceStage" data-surface="page" aria-selected="false">page</button>
                  </div>
                </div>
                <div class="viewer__stage" id="surfaceStage" role="tabpanel" aria-live="polite"></div>
                <details class="viewer__json">
                  <summary>View the stream</summary>
                  <pre id="surfaceJson"></pre>
                </details>
              </div>
              <p class="register__caption"><b>A2UI 1.0:</b> createSurface → updateComponents → updateDataModel. The surface names components; this page's own elements render them. The surface buttons are live and run the same capabilities the assistant uses.</p>
              <div class="manifest" role="group" aria-label="Manifest excerpt">
                <p class="manifest__label">agent-manifest.json / excerpt</p>
                ${manifestRows}
                <p class="manifest__more">+ ${Math.max(0, capCount - 8)} more</p>
              </div>
            </div>
          </div>
        </section>

        <section class="section" id="experience">
          <div class="section__head">
            <div>
              <p class="section__label">History</p>
              <h2 class="section__title">Roles, not a <span class="mark">highlight reel</span>.</h2>
            </div>
            <p class="section__sub">Twelve years across client-facing products, live production systems, and one classroom. The teaching year is here because it changed how I lead.</p>
          </div>
          <div class="career-chart" role="img" aria-label="Career timeline, 2012 to 2026">
            <div class="career-chart__inner">
              ${chart}
              <div class="career-chart__years">
                <span></span>
                <div class="career-chart__axis">${axis}</div>
              </div>
            </div>
          </div>
          <div class="timeline">${timeline}</div>
        </section>

        <section class="section" id="skills">
          <div class="section__head">
            <div>
              <p class="section__label">Stack</p>
              <h2 class="section__title">The tools, and what I do <span class="mark">with them</span>.</h2>
            </div>
            <p class="section__sub">The stack I have shipped in production. The short version: APIs, cloud infrastructure, data, and the front ends that make them usable.</p>
          </div>
          <div class="spec-list">
            <div class="spec-head" aria-hidden="true"><span>Category</span><span>Count</span><span>Items</span></div>
            ${skills}
          </div>
        </section>

        <section class="section" id="blog">
          <div class="section__head writing__head">
            <div>
              <p class="section__label">Log</p>
              <h2 class="section__title">A daily log, drafted by machine and <span class="mark">signed by a human</span>.</h2>
            </div>
            <div>
              <span class="blog__stats" id="blogStats">Loading the log…</span>
              <div class="writing__all"><a href="/archive/">All writing <span aria-hidden="true">→</span></a></div>
            </div>
          </div>
          <div class="writing__grid" id="blogGrid">
            <p class="section__sub">The log is loading. <a href="/archive/">Read the archive</a> if it does not appear.</p>
          </div>
        </section>

        <section class="contact" id="contact">
          <div class="contact__grid">
            <div>
              <p class="section__label">Contact</p>
              <h2 class="contact__title">Let's build something that <span class="mark">lasts</span>.</h2>
              <a class="contact__mail" href="mailto:${DATA.contact.email}">${DATA.contact.email}</a>
              <div class="contact__links">
                <a class="btn btn--ink" href="mailto:${DATA.contact.email}">Email me</a>
                <a class="btn" href="${DATA.contact.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
                <button class="btn" type="button" id="resumeBtn2" data-print>Résumé (PDF)</button>
              </div>
              <p class="contact__note">The printable version is generated from this page, so everything here is already public. If you need a phone number or a formal PDF with references, email me and I will send it over.</p>
            </div>
            <dl class="contact__table" aria-label="Contact details">
              <div class="contact__row"><dt>Email</dt><dd><a href="mailto:${DATA.contact.email}">${DATA.contact.email}</a></dd></div>
              <div class="contact__row"><dt>LinkedIn</dt><dd><a href="${DATA.contact.linkedin}" target="_blank" rel="noopener">in/sho-byde</a></dd></div>
              <div class="contact__row"><dt>Based</dt><dd>Pacific Northwest</dd></div>
              <div class="contact__row"><dt>Status</dt><dd>Open to conversations</dd></div>
              <div class="contact__row"><dt>Résumé</dt><dd>Printable from this page</dd></div>
            </dl>
          </div>
        </section>
      </main>

      <footer class="footer">
        <div class="footer__grid">
          <div>
            <p class="footer__word">Sho Byde</p>
            <p class="footer__colophon">Set in Archivo and IBM Plex Mono. Built with Vite and deployed to Cloudflare Pages. <a href="/boaz/">Boaz v${esc(boazPackage.version)}</a> runs the thread; no model was downloaded to render this page.</p>
          </div>
          <nav class="footer__links" aria-label="Elsewhere">
            <a href="/boaz/">Boaz</a>
            <a href="/archive/">Writing archive</a>
            <a href="/labs/">Labs</a>
            <a href="/thread/">Thread</a>
            <a href="https://github.com/shobyde">GitHub</a>
          </nav>
          <div class="footer__meta">
            © ${new Date().getFullYear()} Sho Byde<br />
            <a href="mailto:${DATA.contact.email}">${DATA.contact.email}</a><br />
            Pacific Northwest
          </div>
        </div>
      </footer>
      <div class="agent" id="agentRoot">
        <form class="agent__launcher" id="homeAsk" autocomplete="off">
          <div class="agent__launcher-top">
            <div class="agent__launcher-suggest">${starters}</div>
            <span class="agent__launcher-power">starts a thread</span>
          </div>
          <div class="agent__launcher-row">
            <span class="agent__launcher-dot" aria-hidden="true"></span>
            <label class="sr-only" for="homeAskInput">Start a thread</label>
            <input class="agent__launcher-input" id="homeAskInput" type="text" placeholder="Ask the record" />
            <button class="agent__launcher-send" type="submit" aria-label="Start a thread">&rarr;</button>
          </div>
        </form>
      </div>
    </div>
  </div>`;
}

document.getElementById('app').innerHTML = buildPage();
document.querySelectorAll('.project-card').forEach((row) => PROJECT_ORDER.push(row.dataset.key));

/* ---------- project detail expanders ---------- */
function initProjectToggles() {
  document.querySelectorAll('.project-card__toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel?.classList.toggle('is-open', !open);
      panel?.setAttribute('aria-hidden', String(open));
      panel?.toggleAttribute('inert', open);
    });
  });
}

function initPageControls() {
  document.addEventListener('click', (event) => {
    const print = event.target.closest('[data-print], #resumeBtn, #resumeBtn2');
    if (print) {
      event.preventDefault();
      window.print();
    }
  });
}

/* ---------- Live A2UI surface viewer ---------- */
function initSurfaceViewer(posts = []) {
  const stage = document.getElementById('surfaceStage');
  const json = document.getElementById('surfaceJson');
  const tabs = [...document.querySelectorAll('.viewer__tab')];
  if (!stage || !tabs.length) return;

  const newest = [...posts].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const cases = {
    project: () => projectCard('hobnob'),
    contact: () => contactCard(),
    article: () => (newest ? articleCard(newest) : projectCard('groundglass')),
  };

  const paint = (key) => {
    if (key === 'page') {
      stage.replaceChildren();
      const pre = document.createElement('pre');
      pre.className = 'viewer__page-json';
      pre.textContent = JSON.stringify(currentPageSurface || [], null, 2);
      stage.appendChild(pre);
      if (json) json.textContent = pre.textContent;
    } else {
      const surface = cases[key]?.();
      if (!surface) return;
      stage.replaceChildren();
      renderA2UI(surface, stage, {
        onAction: (name, context) => window.__clerk?.run(name, context),
      });
      if (json) json.textContent = JSON.stringify(surface, null, 2);
    }
    stage.setAttribute('aria-labelledby', `tab-${key}`);
    tabs.forEach((tab) => {
      const selected = tab.dataset.surface === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => paint(tab.dataset.surface));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });
  paint('project');
}

/* ---------- hero + rail wiring ---------- */
function navSpy() {
  const links = [...document.querySelectorAll('.rail__link[data-section]')];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  if (!('IntersectionObserver' in window)) return;
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((link) => {
        const active = link.getAttribute('href') === `#${entry.target.id}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach((section) => spy.observe(section));
}

/* ---------- home thread starter ---------- */
function initHomeAsk() {
  const form = document.getElementById('homeAsk');
  if (!form) return;
  const input = document.getElementById('homeAskInput');
  const go = (text) => {
    const question = String(text || '').trim();
    if (!question) { input?.focus(); return; }
    location.assign(`/thread/?q=${encodeURIComponent(question)}`);
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    go(input?.value);
  });
  document.querySelectorAll('[data-home-ask]').forEach((button) => {
    button.addEventListener('click', () => go(button.getAttribute('data-home-ask')));
  });
}

/* ---------- boot ---------- */
async function boot() {
  initReveals();
  initProgress();
  initProjectToggles();
  initPageControls();
  initHomeAsk();

  const withTimeout = (promise, ms) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

  const blogState = await withTimeout(initBlog(), 3200);



  initSurfaceViewer(blogState?.posts || []);
  navSpy();

  const railLog = document.getElementById('railLog');
  if (railLog && blogState?.posts?.length) {
    const newest = [...blogState.posts].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    railLog.innerHTML = `${blogState.posts.length} entries<br /><span>${shortDate(newest.date)}</span>`;
  } else if (railLog) {
    railLog.textContent = 'No entries';
  }

  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
}

boot();
