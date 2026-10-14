/* ============================================================
   Blog loader + hash router - reads content/posts/index.json.
   The Daily Log is a simple ledger-style list (title, date,
   one-liner); every entry opens on its own dedicated page at
   #/post/<slug>, which is deep-linkable and share-friendly.
   Cron pipeline writes new files.
   ============================================================ */
import { motionPrefs } from './motionPrefs.js';

const POST_HASH = /^#\/post\/(.+)$/;
const SECTION_HASH = /^#(about|experience|skills|blog|contact)$/;

let posts = [];

export async function initBlog() {
  const grid = document.getElementById('blogGrid');
  const postView = document.getElementById('postView');
  if (!grid || !postView) return { posts: [] };

  window.addEventListener('hashchange', route);

  try {
    const res = await fetch('/content/posts/index.json');
    if (res.ok) posts = await res.json();
  } catch (e) { /* offline or no file - show empty state below */ }

  if (!posts.length) {
    grid.innerHTML = `<p class="blog-empty">No posts yet - the daily writer hasn't woken up. Check back tomorrow morning.</p>`;
  } else {
    renderList(grid);
  }

  // A deep link (#/post/<slug>) routes once the index attempt settles, so
  // title/meta resolve from the index on cold loads. If the fetch hangs
  // (boot caps initBlog at 3s), this failsafe routes anyway - posts stays
  // empty and the post page falls back to the entry's own # heading.
  route();
  setTimeout(() => { if (!postOpened) route(); }, 3500);
  return { posts };
}

let postOpened = false;

/* ---------- ledger-style list ---------- */
function renderList(grid) {
  posts.forEach((post, i) => {
    const a = document.createElement('a');
    a.className = 'post-row reveal';
    a.href = `#/post/${post.slug}`;
    a.dataset.slug = post.slug;
    a.style.transitionDelay = `${i * 60}ms`;
    a.innerHTML = `
      <span class="post-row__meta mono">${post.date} · ${post.tag || 'log'}</span>
      <span class="post-row__copy">
        <span class="post-row__title">${esc(post.title)}</span>
        <span class="post-row__excerpt">${esc(post.excerpt)}</span>
      </span>
      <span class="post-row__read hand" aria-hidden="true">read</span>
    `;
    grid.appendChild(a);
  });

  // observe reveals after rows land in the DOM
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-inview'); io.unobserve(e.target); }
  }, { threshold: 0.1 });
  grid.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

/* ---------- small in-app router (home <-> post page) ---------- */
function route() {
  const m = location.hash.match(POST_HASH);
  if (m) openPostPage(decodeURIComponent(m[1]));
  else showHomeFromPost();
}

function showHomeFromPost() {
  const postView = document.getElementById('postView');
  if (!postView || postView.hidden) return; // home already showing - nothing to do
  postView.hidden = true;
  postView.querySelector('.postview__sheet')?.classList.remove('is-open');
  const homeView = document.getElementById('homeView');
  if (homeView) homeView.style.display = '';
  document.title = BASE_TITLE;

  // browser can't auto-jump: the section was display:none at hash change,
  // so scroll manually to whatever nav section was requested.
  const m = SECTION_HASH.exec(location.hash);
  if (m) {
    const el = document.getElementById(m[1]);
    if (el) el.scrollIntoView({ behavior: motionPrefs.reduced ? 'auto' : 'smooth' });
  }
}

async function openPostPage(slug) {
  postOpened = true; // set before any await - a slow md fetch still counts as opened
  const homeView = document.getElementById('homeView');
  const postView = document.getElementById('postView');
  const flow = postView?.querySelector('.postview__sheet');
  if (!postView || !flow) return;

  const post = posts.find((p) => p.slug === slug) || null;

  if (homeView) homeView.style.display = 'none';
  postView.hidden = false;
  window.scrollTo(0, 0); // Lenis resyncs via the native scroll event
  void flow.offsetWidth;  // force a layout pass so the fade-in transition runs
  flow.classList.add('is-open');

  const meta = document.getElementById('postMeta');
  const title = document.getElementById('postTitle');
  const body = document.getElementById('postBody');
  const heading = post ? post.title : 'Log entry';
  title.textContent = heading;
  meta.textContent = post ? `${post.date} · ${post.tag || 'log'}` : '';
  body.innerHTML = '<p class="post-body__loading">Loading entry…</p>';
  document.title = `${heading} · Sho Byde`;

  try {
    const res = await fetch(`/content/posts/${slug}.md`);
    if (!res.ok) throw new Error(res.status);
    const md = await res.text();
    // no index entry (e.g. deep link raced the fetch): fall back to the
    // entry's own # heading for the title; meta stays whatever we set above.
    if (!post) {
      const h1 = md.match(/^# (.+)$/m);
      if (h1) title.textContent = h1[1];
      meta.textContent = '';
    }
    body.innerHTML = mdToHtml(md);
  } catch (e) {
    body.innerHTML = `<p>Couldn't load this entry (${e.message}). It may not exist - try <a href="#blog">back to the log</a>.</p>`;
  }
}

/* ---------- tiny markdown renderer ---------- */
const BASE_TITLE = typeof document !== 'undefined' ? document.title : 'Sho Byde - Software Engineer';

function mdToHtml(md) {
  // strip front-matter (before first ---)
  md = md.replace(/^#[^\n]*\n(?:Tag:[^\n]*\n)?(?:Subtitle:[^\n]*\n)?\n*---\n?/, '');
  // fenced code
  md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${escapeCode(code.trim())}</code></pre>`;
  });
  const lines = md.split('\n');
  let html = '', inList = false;
  for (const line of lines) {
    const nowList = line.startsWith('- ') || line.startsWith('* ');
    if (nowList && !inList) { html += '<ul>'; inList = true; }
    else if (!nowList && inList) { html += '</ul>'; inList = false; }
    if (inList) html += `<li>${inline(line.slice(2))}</li>`;
    else if (line.startsWith('### ')) html += `<h2>${inline(line.slice(4))}</h2>`;
    else if (line.startsWith('## ')) html += `<h2>${inline(line.slice(3))}</h2>`;
    else if (line.trim() === '') { /* spacer */ }
    else html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
function inline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code>$1</code>')
          .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent)">$1</a>');
}
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeCode(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
