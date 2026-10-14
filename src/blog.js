/* ============================================================
   Blog loader - reads content/posts/index.json, renders cards,
   opens posts in a side modal. Cron pipeline writes new files.
   ============================================================ */

export async function initBlog() {
  const grid = document.getElementById('blogGrid');
  if (!grid) return { posts: [] };

  let posts = [];
  try {
    const res = await fetch('/content/posts/index.json');
    if (res.ok) posts = await res.json();
  } catch (e) { /* offline or no file - show empty state below */ }

  const visible = posts.slice(0, 3); // card grid shows 3 latest; deep links resolve against all posts
  if (!posts.length) {
    grid.innerHTML = `<p style="color:var(--fg-mute);font-size:.9rem">No posts yet - the daily writer hasn't woken up. Check back tomorrow morning.</p>`;
    return { posts: [] };
  }

  // show 3 latest
  visible.forEach((post, i) => {
    const a = document.createElement('a');
    a.className = 'post-card reveal';
    a.href = `?post=${post.slug}`;
    a.dataset.slug = post.slug;
    a.style.transitionDelay = `${i * 60}ms`;
    a.innerHTML = `
      <span class="post-card__date">${post.date} · ${post.tag || 'log'}</span>
      <span class="post-card__title">${esc(post.title)}</span>
      <span class="post-card__excerpt">${esc(post.excerpt)}</span>
      <span class="post-card__read">Read →</span>
    `;
    a.addEventListener('pointermove', (e) => {
      const r = a.getBoundingClientRect();
      a.style.setProperty('--mx', `${e.clientX - r.left}px`);
      a.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    a.addEventListener('click', (e) => { e.preventDefault(); openArticle(post); });
    grid.appendChild(a);
  });

  // observe reveals again
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-inview'); io.unobserve(e.target); }
  }, { threshold: 0.1 });
  grid.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // open article if URL requests one
  const req = new URLSearchParams(location.search).get('post');
  if (req) {
    const p = posts.find((x) => x.slug === req);
    if (p) openArticle(p);
  }
  addEventListener('popstate', () => {
    const slug = new URLSearchParams(location.search).get('post');
    if (slug) {
      const p = posts.find((x) => x.slug === slug);
      if (p) openArticle(p);
    } else {
      closeArticle();
      document.title = 'Sho Byde - Software Engineer';
    }
  });
  return { posts };
}

/* ---------- full-page article view ---------- */
async function openArticle(post) {
  try { history.pushState({post: post.slug}, '', `?post=${post.slug}`); } catch {}
  document.title = `${post.title} - Sho Byde`;

  const site = document.getElementById('app');
  if (site) site.style.display = 'none';

  let view = document.getElementById('articleView');
  if (!view) {
    view = document.createElement('div');
    view.id = 'articleView';
    view.style.cssText = 'position:fixed;inset:0;z-index:800;background:var(--bg,#0b0b0f);overflow:auto;padding:clamp(1rem,4vw,3rem);';
    document.body.appendChild(view);
  }
  view.style.display = 'block';
  view.innerHTML = `
    <div style="max-width:760px;margin:0 auto;">
      <a href="/" id="articleBack" style="display:inline-block;margin-bottom:1.5rem;color:#fff;text-decoration:underline;font-weight:600;">← back to site</a>
      <h1 style="font-size:clamp(1.8rem,4vw,2.8rem);margin:.2rem 0 .6rem">${escapeHtml(post.title)}</h1>
      <div style="color:var(--fg-mute,#888);font-size:.85rem;margin-bottom:2rem;">${post.date} · ${post.tag || 'log'} · by ${post.author || 'Sho Byde'}</div>
      <div id="articleBody"><p style="color:var(--fg-mute)">Loading…</p></div>
    </div>
  `;
  document.getElementById('articleBack').addEventListener('click', (e) => { e.preventDefault(); closeArticle(); });
  document.addEventListener('keydown', onArticleEsc);

  const body = document.getElementById('articleBody');
  try {
    const res = await fetch(`/content/posts/${post.slug}.md`);
    if (!res.ok) throw new Error(res.status);
    body.innerHTML = mdToHtml(await res.text());
  } catch (e) {
    body.innerHTML = `<p>Couldn't load this post (${e.message}).</p>`;
  }
  view.scrollTop = 0;
}

function onArticleEsc(e) { if (e.key === 'Escape') closeArticle(); }

function closeArticle() {
  const view = document.getElementById('articleView');
  if (view) view.style.display = 'none';
  document.removeEventListener('keydown', onArticleEsc);
  const site = document.getElementById('app');
  if (site) site.style.display = '';
  document.title = 'Sho Byde - Software Engineer';
  try { history.pushState({}, '', window.location.pathname); } catch {}
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ---------- tiny markdown renderer ---------- */
function mdToHtml(md) {
  // strip front-matter up to first horizontal rule
  md = md.replace(/^[\s\S]*?^---\s*$/m, '');
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
    else if (line.startsWith('# ')) html += `<h2>${inline(line.slice(2))}</h2>`;
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
          .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:10px;margin:1rem 0;" loading="lazy" />')
          .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent)">$1</a>');
}
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeCode(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
