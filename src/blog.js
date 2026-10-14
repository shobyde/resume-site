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
    document.body.appendChild(view);
  }
  view.style.display = 'block';
  view.innerHTML = `
    <article class="article">
      <a href="/" class="article__back">&larr; Back</a>
      <div class="article__meta">${post.date} · ${esc(post.tag || 'log')} · by ${esc(post.author || 'Sho Byde')}</div>
      <h1 class="article__title">${escapeHtml(post.title)}</h1>
      <p class="article__deck" hidden></p>
      <div class="article__body" id="articleBody"><p class="article__loading">Loading…</p></div>
    </article>
  `;
  view.querySelector('.article__back').addEventListener('click', (e) => { e.preventDefault(); closeArticle(); });
  document.addEventListener('keydown', onArticleEsc);

  const body = document.getElementById('articleBody');
  try {
    const res = await fetch(`/content/posts/${post.slug}.md`);
    if (!res.ok) throw new Error(res.status);
    const { meta, html } = mdToHtml(await res.text());
    body.innerHTML = html;
    const deck = view.querySelector('.article__deck');
    if (meta.Subtitle) { deck.textContent = meta.Subtitle; deck.hidden = false; }
    if (meta.Tag && post.tag !== meta.Tag) {
      view.querySelector('.article__meta').textContent =
        `${post.date} · ${meta.Tag} · by ${post.author || 'Sho Byde'}`;
    }
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

/* ---------- markdown renderer ----------
   Returns { meta: {Tag, Subtitle, ...}, html }. The header block
   (lines like "Tag: x" / "Subtitle: y" before the first ---) is
   parsed as meta; the H1 title line is consumed by the view. */
function mdToHtml(md) {
  const meta = {};
  // split off the front header: everything up to the first '---' rule
  let head = '', rest = md;
  const m = md.match(/([\s\S]*?)^---\s*$/m);
  if (m) { head = m[1]; rest = md.slice(m[0].length); }
  for (const line of head.split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }

  // fenced code -> placeholders so blocks don't eat it
  const fences = [];
  rest = rest.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    fences.push(`<pre class="article__pre"><code>${escapeCode(code.trim())}</code></pre>`);
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });

  const blocks = [];
  let cur = [];
  const flush = () => { if (cur.length) { blocks.push(cur.join('\n')); cur = []; } };
  for (const line of rest.split('\n')) {
    if (line.trim() === '') { flush(); continue; }
    // block-level starts force a break from a preceding paragraph
    if (/^(#{1,4} |> |- |\* |\d+\. |\u0000FENCE)/.test(line) && cur.length &&
        !/^(> |- |\* |\d+\. )/.test(cur[0])) flush();
    if (/^(> |- |\* |\d+\. )/.test(line) && cur.length &&
        !/^(> |- |\* |\d+\. |\u0000FENCE)/.test(cur[0])) flush();
    cur.push(line);
  }
  flush();

  let html = '';
  for (const b of blocks) {
    if (/^\u0000FENCE\d+\u0000$/.test(b.trim())) { html += fences[+b.trim().match(/\d+/)[0]]; continue; }
    if (/^#### /.test(b)) html += `<h4>${inline(b.slice(5))}</h4>`;
    else if (/^### /.test(b)) html += `<h3>${inline(b.slice(4))}</h3>`;
    else if (/^## /.test(b)) html += `<h2>${inline(b.slice(3))}</h2>`;
    else if (/^# /.test(b)) html += `<h2>${inline(b.slice(2))}</h2>`;
    else if (/^(-{3,}|\*{3,})$/.test(b.trim())) html += '<hr>';
    else if (/^> /.test(b)) {
      html += `<blockquote>${b.split('\n').map((l) => inline(l.replace(/^> ?/, ''))).join('<br>')}</blockquote>`;
    } else if (/^- |^\* /.test(b)) {
      html += `<ul>${b.split('\n').map((l) => `<li>${inline(l.replace(/^(- |\* )/, ''))}</li>`).join('')}</ul>`;
    } else if (/^\d+\. /.test(b)) {
      html += `<ol>${b.split('\n').map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    } else {
      // paragraph: soft-wrapped lines join into one <p>
      html += `<p>${inline(b.split('\n').join(' '))}</p>`;
    }
  }
  return { meta, html };
}
function inline(s) {
  return escapeCode(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" loading="lazy" />')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeCode(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
