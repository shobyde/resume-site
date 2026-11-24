/* ============================================================
   Main - assembles DOM, wires everything up
   ============================================================ */
import boazPackage from '@shobyde/boaz/package.json';
import { DATA } from './data.js';
import { initBackground } from './background.js';
import { initSmoothScroll, initReveals, initMagnetic, initProgress } from './motion.js';
import { initStreamText, initScrollStream } from './streamText.js';
import { initBlog } from './blog.js';
import { initAssistant } from './agent/assistant.js';
import { motionPrefs } from './motionPrefs.js';
import './styles/main.css';
import './styles/sections.css';
import './styles/print.css';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

document.getElementById('app').innerHTML = buildPage();

/* ---------- helpers ---------- */
function buildPage() {
  const exp = DATA.experience.map((item) => `
    <div class="tl-item">
      <div class="tl-item__period mono">${item.period}</div>
      <h3 class="tl-item__role">${item.role}</h3>
      <div class="tl-item__org">${item.org} <em>· ${item.loc || 'remote'}</em></div>
      <ul class="tl-item__bullets">${item.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
    </div>
  `).join('');

  const skills = DATA.skills.map((s) => `
    <div class="skill-group">
      <div class="skill-group__title">${s.group}</div>
      <div class="skill-tags">${s.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
    </div>
  `).join('');

  const stats = DATA.stats.map((s) => `
    <div class="stat reveal">
      ${s.text
        ? `<div class="stat__num">${s.text}</div>`
        : `<div class="stat__num" data-count="${s.num}" data-suffix="${s.suffix}">0${s.suffix}</div>`}
      <div class="stat__label">${s.label}</div>
    </div>
  `).join('');

  const projects = DATA.projects.map((p, i) => `
    <article class="project-card reveal" style="transition-delay:${i * 80}ms">
      <div class="project-card__top">
        <div class="project-card__meta">${p.meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
        ${p.details ? `<button class="project-card__toggle" type="button" aria-expanded="false" aria-controls="proj-details-${i}" aria-label="Engineering detail for ${esc(p.title)}" title="Architecture and engineering decisions">Details</button>` : ''}
      </div>
      <h3 class="project-card__title">${p.title}</h3>
      <p class="project-card__summary">${p.summary}</p>
      <div class="project-card__stack">${p.stack.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      <div class="project-card__actions">
        ${p.links.map((l) => `<a class="project-card__link" href="${l.url}"${l.url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${l.label}</a>`).join('')}
      </div>
      ${p.details ? `
      <div class="project-card__details" id="proj-details-${i}">
        <div>
          <h4>Architecture</h4>
          <p>${p.details.architecture}</p>
          <h4>Engineering decisions</h4>
          <ul>${p.details.decisions.map((d) => `<li>${d}</li>`).join('')}</ul>
          ${p.details.diagram ? `<div class="project-card__diagram"><img src="${p.details.diagram.src}" alt="${p.details.diagram.alt}" width="800" height="450" loading="lazy" /></div>` : ''}
        </div>
      </div>` : ''}
    </article>
  `).join('');

  return `
  <div class="nav-scrim" aria-hidden="true"></div>
  <nav class="nav" id="nav" aria-label="Primary">
    <a href="#about" class="nav__link">About</a>
    <a href="#projects" class="nav__link">Projects</a>
    <a href="#experience" class="nav__link">Experience</a>
    <a href="#skills" class="nav__link">Skills</a>
    <a href="#blog" class="nav__link">Log</a>
    <a href="#contact" class="nav__link">Contact</a>
  </nav>

  <!-- HERO -->
  <header class="hero" id="hero">
    <div class="hero__inner">
      <p class="hero__tag hero__anim hero__anim--1">${DATA.hero.tag}</p>
      <h1 class="hero__headline hero__anim hero__anim--2" aria-label="${DATA.hero.headlineText}">${DATA.hero.headline}</h1>
      <p class="hero__role hero__anim hero__anim--3">${DATA.hero.role}</p>
      <!-- print-only: compact name header + contact line on the résumé PDF -->
      <p class="print-name">Sho Byde</p>
      <p class="print-contact">
        <a href="mailto:${DATA.contact.email}">${DATA.contact.email}</a> ·
        <a href="${DATA.contact.linkedin}">LinkedIn</a> ·
        <a href="https://shobyde.com/">shobyde.com</a>
      </p>
      <div class="hero__cta hero__anim hero__anim--4">
        <a href="#projects" class="btn btn--primary">Explore my work →</a>
        <button class="btn" type="button" id="resumeBtn">Download résumé</button>
        <a href="#contact" class="btn">Get in touch</a>
      </div>
    </div>
    <div class="hero__scroll" id="heroScroll"><span>Scroll</span><div class="hero__scroll-line"></div></div>
  </header>

  <!-- FEATURED WORK: the assistant on this page is the product; say so above the fold -->
  <aside class="featured container" aria-labelledby="featuredTitle">
    <div class="featured__card">
      <div class="featured__copy">
        <p class="featured__eyebrow"><span class="featured__pulse" aria-hidden="true"></span>Featured work <span class="featured__year">2026</span></p>
        <h2 class="featured__title" id="featuredTitle"><a href="/boaz/">boaz</a><span class="featured__version">v${boazPackage.version}</span></h2>
        <p class="featured__lede">The assistant on this page runs on it: 26 capabilities, a declarative planner, session memory and a skill runner, with no model and no network.</p>
        <ul class="featured__links">
          <li><a href="/boaz/">How it works</a></li>
          <li><a href="/labs/tools/">Tools lab</a></li>
          <li><a href="/labs/benchmarks/">Benchmarks</a></li>
          <li><a href="/labs/no-llm/">Scorecard</a></li>
          <li><a href="https://github.com/shobyde/boaz/releases">Source &amp; releases</a></li>
        </ul>
      </div>
      <div class="featured__flow" aria-hidden="true">
        <span class="featured__node">ask</span><span class="featured__wire"></span>
        <span class="featured__node">plan</span><span class="featured__wire"></span>
        <span class="featured__node">tool</span><span class="featured__wire"></span>
        <span class="featured__node featured__node--end">answer</span>
      </div>
    </div>
  </aside>

  <div class="progress" id="progress" aria-hidden="true"></div>

  <main class="container" id="main-content" tabindex="-1">
    <!-- ABOUT -->
    <section class="section" id="about">
      <h2 class="section-title reveal">Where code meets culture</h2>
      <div class="about__grid">
        <div class="about__text reveal">
          <p>${DATA.about.p1}</p>
          <p>${DATA.about.p2}</p>
          <p>${DATA.about.p3}</p>
        </div>
        <div class="stats">${stats}</div>
      </div>
    </section>

    <!-- PROJECTS -->
    <section class="section" id="projects">
      <h2 class="section-title reveal">Proof, not adjectives</h2>
      <p class="section-sub">Selected work with the engineering decisions behind it. Expand a card for architecture and trade-offs.</p>
      <div class="projects__grid">${projects}</div>
    </section>

    <!-- EXPERIENCE -->
    <section class="section" id="experience">
      <h2 class="section-title reveal">Twelve years, one throughline: build and ship useful things</h2>
      <div class="timeline">${exp}</div>
    </section>

    <!-- SKILLS -->
    <section class="section" id="skills">
      <h2 class="section-title reveal">Tools of the trade</h2>
      <div class="skills__grid">${skills}</div>
    </section>

    <!-- BLOG -->
    <section class="section" id="blog">
      <h2 class="section-title reveal">Written by the machine, curated by me</h2>
      <div class="blog__head">
        <div>
          <p class="section-sub">An AI-assisted daily log: news, notes, and build updates, drafted automatically every morning and curated by a human (me).</p>
          <span class="blog__stats" id="blogStats"></span>
        </div>
        <a class="section-link" href="/archive/">All writing →</a>
      </div>
      <div class="blog__grid" id="blogGrid"></div>
    </section>

    <!-- CONTACT -->
    <section class="section contact" id="contact">
      <h2 class="section-title reveal">Let's build something.</h2>
      <p class="section-sub reveal">Open to interesting problems, consulting work, or just a coffee chat about code.</p>
      <div class="contact__links reveal">
        <a href="mailto:${DATA.contact.email}" class="btn btn--primary">Email me</a>
        <a href="${DATA.contact.linkedin}" target="_blank" rel="noopener" class="btn">LinkedIn</a>
      </div>
      <p class="contact__note reveal">The printable version is generated right from this page, so everything here is already public. If you need my phone number or a formal PDF résumé with references, just email me and I'll send it over.</p>
    </section>
  </main>

  <div class="container"><footer class="footer">
    <div>© ${new Date().getFullYear()} Sho Byde</div>
    <div class="footer__labs"><a href="/labs/">Labs</a> · <a href="/labs/benchmarks/">Benchmarks</a> · <a href="/labs/no-llm/">Scorecard</a> · <a href="/labs/tools/">Tools</a> · <a href="/boaz/">boaz</a></div>
    <div><a href="mailto:${DATA.contact.email}">${DATA.contact.email}</a></div>
  </footer></div>

  <aside class="new-post" id="newPost" hidden aria-labelledby="newPostTitle">
    <button class="new-post__close" type="button" id="newPostClose" aria-label="Dismiss new article notice">×</button>
    <p class="new-post__eyebrow"><span class="new-post__dot" aria-hidden="true"></span> New article</p>
    <a class="new-post__title" id="newPostTitle" href="/#blog"></a>
    <p class="new-post__meta" id="newPostMeta"></p>
  </aside>
  `;
}

/* ---------- project detail expanders ---------- */
function initProjectToggles() {
  document.querySelectorAll('.project-card__toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      btn.textContent = open ? 'Details' : 'Close';
      panel.classList.toggle('is-open', !open);
    });
  });
}

function initResumePrint() {
  const btn = document.getElementById('resumeBtn');
  if (btn) btn.addEventListener('click', () => window.print());
}

function initCounters() {
  const els = document.querySelectorAll('.stat__num[data-count]');
  if (motionPrefs.reduced) {
    els.forEach((el) => { el.textContent = el.dataset.count + (el.dataset.suffix || ''); });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const target = +el.dataset.count;
      const suffix = el.dataset.suffix || '';
      const dur = 1400;
      const start = performance.now();
      (function tick(now) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      })(start);
    }
  }, { threshold: 0.5 });
  els.forEach((el) => io.observe(el));
}

/* ---------- boot ---------- */
async function boot() {
  const loader = document.getElementById('loader');
  const fill = document.getElementById('loaderFill');
  const pct = document.getElementById('loaderPct');

  // never let fonts/network hang the boot - hard cap at 2.5s
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

  // three.js init (independent from DOM)
  try { initBackground(); } catch (e) { console.warn('WebGL unavailable:', e); }

  // hero entrance is a pure CSS animation (see .hero__anim) - starts on DOM insert,
  // no JS timing needed; just reveal scroll cue + nav once the loader lifts.
  document.getElementById('heroScroll').classList.add('is-visible');

  await withTimeout(document.fonts ? document.fonts.ready : Promise.resolve(), 2500);

  initSmoothScroll();
  initReveals();
  initStreamText();
  initScrollStream();
  initMagnetic();
  initCounters();
  initProgress();
  initProjectToggles();
  initResumePrint();
  const blogState = await withTimeout(initBlog(), 3000);
  navSpy();

  // The site assistant is additive: if it fails, the page is unaffected.
  try {
    initAssistant({ posts: blogState?.posts || [] });
  } catch (error) {
    console.warn('[assistant] unavailable:', error);
  }

  // deep-link to a section: anchors can't resolve before the DOM was built
  if (location.hash) {
    const t = document.querySelector(location.hash);
    if (t) t.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  document.getElementById('nav').classList.add('is-visible');
  fill.style.width = '100%';
  pct.textContent = '100%';
  setTimeout(() => loader.classList.add('is-done'), 150);
}

function navSpy() {
  const links = [...document.querySelectorAll('.nav__link')];
  const sections = links.map((l) => document.querySelector(l.getAttribute('href')));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((l) => {
        const active = l.getAttribute('href') === `#${e.target.id}`;
        l.classList.toggle('is-active', active);
        if (active) l.setAttribute('aria-current', 'true');
        else l.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach((s) => s && spy.observe(s));
}

// failsafe: never leave the loader spinning - force-close at 4s no matter what
setTimeout(() => {
  const l = document.getElementById('loader');
  if (l && !l.classList.contains('is-done')) {
    l.classList.add('is-done');
    const n = document.getElementById('nav');
    if (n) n.classList.add('is-visible');
    console.warn('[failsafe] loader force-closed at 4s');
  }
}, 4000);

boot();
