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

  if (!posts.length) {
    grid.innerHTML = `<p style="color:var(--fg-mute);font-size:.9rem">No posts yet - the daily writer hasn't woken up. Check back tomorrow morning.</p>`;
    return { posts: [] };
  }

  // show 6 latest
  posts.slice(0, 6).forEach((post, i) => {
    const a = document.createElement('a');
    a.className = 'post-card reveal';
    a.href = '#post';
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
    a.addEventListener('click', (e) => { e.preventDefault(); openPost(post); });
    grid.appendChild(a);
  });

  // observe reveals again
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-inview'); io.unobserve(e.target); }
  }, { threshold: 0.1 });
  grid.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  wireModal();
  return { posts };
}

/* ---------- modal ---------- */
function wireModal() {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('postModal');
  overlay.addEventListener('click', closeModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  modal.parentElement.addEventListener('click', (e) => e.stopPropagation());
}

async function openPost(post) {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('postModal');
  document.getElementById('modalTitle').textContent = post.title;
  document.getElementById('modalMeta').textContent = `${post.date} · ${post.tag || 'log'}`;

  const body = document.getElementById('modalBody');
  body.innerHTML = '<p style="color:var(--fg-mute)">Loading…</p>';
  overlay.classList.add('is-open');
  modal.classList.add('is-open');

  try {
    const res = await fetch(`/content/posts/${post.slug}.md`);
    if (!res.ok) throw new Error(res.status);
    body.innerHTML = mdToHtml(await res.text());
  } catch (e) {
    body.innerHTML = `<p>Couldn't load this post (${e.message}). Try refreshing - or ask Hermes to republish it.</p>`;
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('is-open');
  document.getElementById('postModal').classList.remove('is-open');
}

/* ---------- tiny markdown renderer ---------- */
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
          .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent)">$1</a>');
}
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeCode(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
