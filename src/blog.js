/* ============================================================
   Blog loader: the engineering log as a lead entry plus an
   index table. One fetch, no framework, no card grid.
   ============================================================ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shortDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}

function newestFirst(posts) {
  return [...posts].sort((a, b) => `${b.date}-${b.slug}`.localeCompare(`${a.date}-${a.slug}`));
}

function renderBlogStats(posts) {
  const el = document.getElementById('blogStats');
  if (!el || !posts.length) return;
  const newest = newestFirst(posts)[0];
  el.textContent = `${posts.length} entries / last filed ${shortDate(newest.date)}`;
}

export async function initBlog() {
  const grid = document.getElementById('blogGrid');

  let posts = [];
  try {
    const res = await fetch('/content/posts/index.json');
    if (res.ok) posts = await res.json();
  } catch (error) {
    /* offline or missing index: the fallback below stays in place */
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    const stats = document.getElementById('blogStats');
    if (stats) stats.textContent = 'No entries filed yet';
    if (grid) grid.innerHTML = '<p class="section__sub">The log is empty for now. <a href="/archive/">Open the archive</a> for everything that has been filed.</p>';
    return { posts: [] };
  }

  const sorted = newestFirst(posts);
  renderBlogStats(sorted);
  if (!grid) return { posts: sorted };

  const [lead, ...rest] = sorted;
  const leadMeta = [shortDate(lead.date), lead.tag || 'log', lead.minutes ? `${lead.minutes} min` : null]
    .filter(Boolean)
    .join('<br />');

  const rows = rest.slice(0, 7).map((post) => `
    <a class="log-row" href="/posts/${esc(post.slug)}/">
      <time datetime="${esc(post.date)}">${shortDate(post.date)}</time>
      <span class="log-row__title">${esc(post.title)}</span>
      <span class="log-row__tag">${esc(post.tag || 'log')}<span>${post.minutes ? `${post.minutes} min` : ''}</span></span>
    </a>`).join('');

  grid.innerHTML = `
    <a class="log-lead reveal" href="/posts/${esc(lead.slug)}/">
      <span class="log-lead__meta">${leadMeta}</span>
      <span class="log-lead__title">${esc(lead.title)}</span>
      <span class="log-lead__cta">Read entry <span aria-hidden="true">→</span></span>
      <span class="log-lead__excerpt">${esc(lead.excerpt || '')}</span>
    </a>
    <div class="log-table">
      <div class="log-head" aria-hidden="true"><span>Date</span><span>Entry</span><span>Topic</span></div>
      ${rows}
    </div>`;

  requestAnimationFrame(() => {
    grid.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-inview'));
  });

  // legacy ?post= deep links redirect to the static page (SEO canonical)
  const req = new URLSearchParams(location.search).get('post');
  if (req) {
    location.replace(`/posts/${req}/`);
    return { posts: sorted };
  }
  return { posts: sorted };
}
