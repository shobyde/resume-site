/* ============================================================
   Main - assembles DOM, wires everything up
   ============================================================ */
import { DATA } from './data.js';
import { initBackground } from './background.js';
import { initCursor, initSmoothScroll, initReveals, initMagnetic } from './motion.js';
import { initStreamText, initScrollStream } from './streamText.js';
import { initFeedback } from './feedback.js';
import { initBlog } from './blog.js';
import { motionPrefs } from './motionPrefs.js';
import './styles/main.css';
import './styles/sections.css';

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
      <div class="stat__num" data-count="${s.num}" data-suffix="${s.suffix}">0${s.suffix}</div>
      <div class="stat__label">${s.label}</div>
    </div>
  `).join('');

  return `
  <div id="homeView">
  <nav class="nav" id="nav">
    <a href="#about" class="nav__link">About</a>
    <a href="#experience" class="nav__link">Experience</a>
    <a href="#skills" class="nav__link">Skills</a>
    <a href="#blog" class="nav__link">Log</a>
    <a href="#contact" class="nav__link">Contact</a>
  </nav>

  <!-- HERO -->
  <header class="hero" id="hero">
    <div class="hero__inner">
      <div class="hero__tag" id="heroTag">${DATA.hero.tag}</div>
      <h1 class="hero__name" id="heroName" aria-label="${DATA.hero.name}"></h1>
      <p class="hero__role" id="heroRole">${DATA.hero.role}</p>
      <div class="hero__cta" id="heroCta">
        <a href="#contact" class="btn btn--primary">Get in touch →</a>
        <a href="#blog" class="btn">Read the daily log</a>
      </div>
    </div>
    <div class="hero__scroll" id="heroScroll"><span>Scroll</span><div class="hero__scroll-line"></div></div>
  </header>

  <main class="container">
    <!-- ABOUT -->
    <section class="section section--tight" id="about">
      <div class="eyebrow">01 - About</div>
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

    <!-- EXPERIENCE -->
    <section class="section" id="experience">
      <div class="eyebrow">02 - Experience</div>
      <h2 class="section-title reveal">The journey so far</h2>
      <div class="timeline">${exp}</div>
    </section>

    <!-- SKILLS -->
    <section class="section" id="skills">
      <div class="eyebrow">03 - Skills</div>
      <h2 class="section-title reveal">Tools of the trade</h2>
      <div class="skills__grid">${skills}</div>
    </section>

    <!-- BLOG -->
    <section class="section" id="blog">
      <div class="eyebrow">04 - Daily Log</div>
      <h2 class="section-title reveal">Written by the machine, curated by me</h2>
      <p class="section-sub">An AI-assisted daily log - news, notes, and build updates, published automatically every morning and curated by a human (me).</p>
      <div class="blog__list" id="blogGrid"></div>
    </section>

    <!-- CONTACT -->
    <section class="section contact" id="contact">
      <div class="eyebrow" style="justify-content:center">05 - Contact</div>
      <h2 class="section-title reveal">Let's build something.</h2>
      <p class="section-sub reveal">Open to interesting problems, consulting work, or just a coffee chat about code.</p>
      <p class="contact__sign reveal hand">~ Sho</p>
      <div class="contact__links reveal">
        <a href="mailto:${DATA.contact.email}" class="btn btn--primary">Email me</a>
        <a href="${DATA.contact.linkedin}" target="_blank" rel="noopener" class="btn">LinkedIn</a>
      </div>
    </section>
  </main>

  <div class="container"><footer class="footer">
    <div>© ${new Date().getFullYear()} Sho Byde</div>
    <div>Built with Three.js · Hosted on Cloudflare Pages</div>
  </footer></div>
  </div><!-- /homeView -->

  <!-- Dedicated post page (hash-routed at #/post/<slug>) -->
  <div class="postview" id="postView" hidden>
    <div class="postview__sheet">
      <div class="postview__head">
        <a href="#blog" class="postview__back hand">&larr; Back to the log</a>
        <div class="postview__meta mono" id="postMeta"></div>
      </div>
      <h1 class="postview__title" id="postTitle"></h1>
      <div class="postview__body" id="postBody"></div>
    </div>
  </div>
  `;
}

function initCounters() {
  const reduced = motionPrefs.reduced;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const target = +el.dataset.count;
      const suffix = el.dataset.suffix || '';
      if (reduced) { el.textContent = target + suffix; continue; } // final value, no count-up
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
  document.querySelectorAll('.stat__num').forEach((el) => io.observe(el));
}

/* ---------- boot ---------- */
async function boot() {
  const loader = document.getElementById('loader');
  const fill = document.getElementById('loaderFill');
  const pct = document.getElementById('loaderPct');
  const reduced = motionPrefs.reduced;

  // fake-ish but tied to real progress
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 18, 92);
    fill.style.width = progress + '%';
    pct.textContent = Math.round(progress) + '%';
  }, 200);

  // three.js init (independent from DOM)
  try { initBackground(); } catch (e) { console.warn('WebGL unavailable:', e); }

  // never let fonts/network hang the boot - hard cap at 2.5s
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  await withTimeout(document.fonts ? document.fonts.ready : Promise.resolve(), 2500);

  // hero animations
  heroIntro();
  initCursor();
  initSmoothScroll();
  initReveals();
  initStreamText();
  initScrollStream();
  initMagnetic();
  initFeedback();
  initCounters();
  await withTimeout(initBlog(), 3000);
  navSpy();
  clearInterval(timer);
  document.getElementById('nav').classList.add('is-visible');
  fill.style.width = '100%';
  pct.textContent = '100%';
  setTimeout(() => loader.classList.add('is-done'), 400);
}

function heroIntro() {
  const name = document.getElementById('heroName');
  const reduced = motionPrefs.reduced;
  const chars = DATA.hero.name.split('');
  name.innerHTML = chars.map((c) => c === ' '
    ? '<span class="word">&nbsp;</span>'
    : reduced
      // Reduced motion: plain text, no per-char spans to animate.
      ? `<span class="word">${c}</span>`
      : `<span class="word"><span class="char">${c}</span></span>`).join('');

  // Staggered per-element fades - offset so they land in reading order.
  // The name's container fade completes BEFORE the ink cascade finishes,
  // so it never clips the char-level reveal.
  const tl = [
    ['#heroName', 'opacity:1', 0],
    ['#heroTag', 'opacity:1', 2],
    ['#heroRole', 'opacity:1', 0],
    ['#heroCta', 'opacity:1', 0.4],
    ['#heroScroll', 'opacity:1', 0.6],
  ];
  tl.forEach(([sel, style, d]) => setTimeout(() => { document.querySelector(sel).style.opacity = 1; }, reduced ? 0 : 200 + d * 600));

  if (reduced) return; // no character-level ink animation

  // Ink-cascade entrance ("written into place"): each character appears
  // like a pen stroke landing - randomized delay (hand pauses between
  // letters), slight rotation jitter (nib tilt), and a text-shadow that
  // blooms from nothing to a hairline (ink spreading through the page
  // fiber). Live-gates on motionPrefs: turning reduced motion on
  // mid-reveal snaps every char to fully inked with no jitter.
  const inkEls = [...document.querySelectorAll('.hero__name .char')];
  const inkTimers = [];
  const settleAll = () => {
    inkTimers.forEach(clearTimeout);
    inkTimers.length = 0;
    inkEls.forEach((ch) => {
      ch.style.transition = 'none';
      ch.style.opacity = '1';
      ch.style.transform = '';
      ch.style.textShadow = '';
    });
  };
  window.addEventListener('motionprefchange', () => { if (motionPrefs.reduced) settleAll(); });

  inkEls.forEach((ch, i) => {
    // ~40-90ms hand pauses; a slightly longer beat after each word gap.
    // Settles to fully upright with a shrinking, dimmer bloom so the
    // cascade reads as a confident hand, not a flickering sparkle.
    const jitter = () => (Math.random() * 2 - 1) * 0.8; // +/-0.8deg nib tilt
    const d = 0.15 + i * 0.045 + Math.random() * 0.05;
    const rot = jitter();
    ch.style.transition = `opacity 0.25s ease, transform 0.55s var(--ease-out), text-shadow 0.6s ease`;
    inkTimers.push(setTimeout(() => {
      if (motionPrefs.reduced) return; // live gate inside timers too
      ch.style.opacity = '1';
      ch.style.transform = `rotate(${rot}deg)`;
      // ink bloom: 0 -> hairline spread while the glyph lands
      ch.style.textShadow = '0 0 0.4px rgba(230,221,208,0.65), 0 0 1px rgba(230,221,208,0.4)';
      // then fade the bloom to a resting hairline - a fresh stroke settles
      inkTimers.push(setTimeout(() => {
        if (motionPrefs.reduced) return;
        ch.style.textShadow = '0 0 1px rgba(230,221,208,0.16)';
        ch.style.transform = `rotate(0deg)`;
      }, 850));
    }, d * 1000));
  });
}

function navSpy() {
  const links = [...document.querySelectorAll('.nav__link')];
  const sections = links.map((l) => document.querySelector(l.getAttribute('href')));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === `#${e.target.id}`));
      }
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
