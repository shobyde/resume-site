#!/usr/bin/env python3
"""Generate /archive/ from content/posts/index.json.

The page is server-rendered so it is crawlable and works without JavaScript:
every post is in the HTML, along with the publication calendar and totals.
A small inline script adds topic/search/sort filtering on top. Without it,
the full list still reads.

Run directly after editing posts, or let new_post.py call it.
"""
from __future__ import annotations

import html
import json
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "content" / "posts"
OUT = ROOT / "public" / "archive"
SITE = "https://shobyde.com"

from reading_theme import head  # noqa: E402  (sibling module, run as a script)

WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def pretty_date(iso: str) -> str:
    dt = datetime.strptime(iso[:10], "%Y-%m-%d")
    return f"{dt:%b} {dt.day}, {dt.year}"


def load_posts() -> list[dict]:
    posts = json.loads((POSTS / "index.json").read_text(encoding="utf-8"))
    for post in posts:
        post.setdefault("words", 0)
        post.setdefault("minutes", 0)
    return posts


def build_stats(posts: list[dict]) -> dict:
    dates = sorted(datetime.strptime(p["date"], "%Y-%m-%d").date() for p in posts)
    first, last = dates[0], dates[-1]
    span_days = (last - first).days + 1
    total_words = sum(int(p["words"]) for p in posts)
    topics = Counter(p["tag"] or "log" for p in posts)
    per_day = Counter(dates)
    busiest_day, busiest_count = max(per_day.items(), key=lambda kv: (kv[1], kv[0]))
    gaps = [(b - a).days for a, b in zip(dates, dates[1:]) if (b - a).days > 0]
    return {
        "count": len(posts),
        "words": total_words,
        "avg_minutes": round(total_words / len(posts) / 200, 1),
        "topics": topics,
        "first": first,
        "last": last,
        "span_days": span_days,
        "active_days": len(per_day),
        "per_week": len(posts) / max(span_days / 7, 1),
        "per_day": per_day,
        "busiest_day": (busiest_day, busiest_count),
        "longest_gap": max(gaps) if gaps else 0,
    }


def calendar_html(posts: list[dict], stats: dict) -> str:
    """A Monday-first publishing calendar, one column per week, with month labels."""
    first_post = stats["first"]
    monday = first_post - timedelta(days=first_post.weekday())
    last = stats["last"]
    weeks = ((last - monday).days // 7) + 1

    cells: list[str] = []
    month_cells: list[str] = []
    previous_month = None
    day = monday
    while day <= last:
        # Cells before the first post are outside the archive: leave them blank
        # so "no post" and "no data" do not look the same.
        if day < first_post:
            cells.append('<span class="cal__cell is-blank"></span>')
        else:
            count = stats["per_day"].get(day, 0)
            level = min(4, count)
            titles = sorted(p["title"] for p in posts if p["date"] == day.isoformat())
            label = "no posts" if not count else f"{count} post" + ("s" if count != 1 else "")
            title = f"{day:%b} {day.day}: {label}" + (" · " + "; ".join(titles) if titles else "")
            cells.append(
                f'<span class="cal__cell lvl-{level}" title="{esc(title)}" '
                f'aria-label="{esc(title)}"></span>'
            )
        if day.weekday() == 0:
            month_index = day.month
            month_cells.append(
                f'<span class="cal__month">{MONTHS[month_index - 1]}</span>'
                if month_index != previous_month
                else '<span class="cal__month"></span>'
            )
            previous_month = month_index
        day += timedelta(days=1)

    # Pad the final week so every column has seven cells.
    pad_after = (6 - last.weekday()) % 7
    cells += ['<span class="cal__cell is-blank"></span>'] * pad_after

    weekday_labels = "".join(
        f'<span class="cal__day">{name}</span>' for name in WEEKDAYS
    )
    return f"""
    <div class="cal-wrap">
      <div class="cal" style="--weeks:{weeks}">
        <div class="cal__spacer"></div>
        <div class="cal__months" aria-hidden="true">{''.join(month_cells)}</div>
        <div class="cal__days" aria-hidden="true">{weekday_labels}</div>
        <div class="cal__grid" role="img" aria-label="Publishing calendar: {stats['count']} posts between {pretty_date(stats['first'].isoformat())} and {pretty_date(stats['last'].isoformat())}">
          {''.join(cells)}
        </div>
      </div>
      <p class="cal__legend"><span class="cal__cell lvl-0"></span> none
        <span class="cal__cell lvl-1"></span> 1
        <span class="cal__cell lvl-2"></span> 2
        <span class="cal__cell lvl-3"></span> 3
        <span class="cal__cell lvl-4"></span> 4 or more</p>
    </div>
    """


def tag_chips(posts: list[dict], stats: dict) -> str:
    buttons = [
        f'<button class="chip is-active" type="button" data-tag="all" aria-pressed="true">'
        f'All topics <span class="chip__n">{stats["count"]}</span></button>'
    ]
    for tag, count in stats["topics"].most_common():
        buttons.append(
            f'<button class="chip" type="button" data-tag="{esc(tag)}" aria-pressed="false">'
            f'{esc(tag)} <span class="chip__n">{count}</span></button>'
        )
    return "".join(buttons)


def post_items(posts: list[dict]) -> str:
    items = []
    for post in posts:
        tag = post["tag"] or "log"
        search = f"{post['title']} {post['excerpt']} {tag}".lower()
        items.append(
            f'<li class="post" data-tag="{esc(tag)}" data-date="{esc(post["date"])}" '
            f'data-words="{int(post["words"])}" data-search="{esc(search)}">'
            f'<a class="post__link" href="/posts/{esc(post["slug"])}/">'
            f'<span class="post__meta"><time datetime="{esc(post["date"])}">{pretty_date(post["date"])}</time>'
            f'<span class="post__tag">{esc(tag)}</span></span>'
            f'<span class="post__title">{esc(post["title"])}</span>'
            f'<span class="post__excerpt">{esc(post["excerpt"])}</span>'
            f'<span class="post__foot"><span>{int(post["words"]):,} words</span>'
            f'<span>{int(post["minutes"])} min read</span><span class="post__go">Read →</span></span>'
            f'</a></li>'
        )
    return "".join(items)


def page(posts: list[dict]) -> str:
    stats = build_stats(posts)
    topics = len(stats["topics"])
    busiest_day, busiest_count = stats["busiest_day"]
    title = "Writing archive · Sho Byde"
    description = (
        f"Every post in Sho Byde's engineering log: {stats['count']} posts, "
        f"{stats['words']:,} words, topics, and the publication calendar."
    )
    archive_css = """
.archive-head { padding: 0.4rem 0 1.8rem; border-bottom: 1.5px solid var(--ink); }
.archive-kicker { font-family: var(--mono); font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--cobalt); margin-bottom: 0.8rem; }
.archive-head h1 { font-size: clamp(2.6rem, 6.5vw, 5.4rem); line-height: 0.86; letter-spacing: -0.055em; max-width: 12ch; }
.archive-head .lede { margin-top: 1rem; }
h2 { font-size: clamp(1.5rem, 3vw, 2.3rem); line-height: 0.94; letter-spacing: -0.04em; }
.eyebrow { display: inline-flex; align-items: center; gap: 0.45rem; font-family: var(--mono); font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--cobalt); margin: 0 0 0.6rem; }
.eyebrow::before { content: ""; width: 7px; height: 7px; background: var(--cobalt); }
.stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-top: 1.5px solid var(--ink); border-bottom: 1.5px solid var(--ink); margin: 1.4rem 0 0; }
.stat { padding: 0.85rem 0.75rem 0.9rem; border-left: 1px solid var(--line); }
.stat:first-child { border-left: 0; padding-left: 0; }
.stat__n { display: block; font-family: var(--display); font-stretch: 125%; font-weight: 800; font-size: clamp(1.45rem, 2.6vw, 2.2rem); line-height: 0.82; letter-spacing: -0.05em; }
.stat__l { display: block; margin-top: 0.35rem; font-family: var(--mono); font-size: 0.54rem; letter-spacing: 0.07em; text-transform: uppercase; color: var(--mute); }
.block { margin-top: 3rem; }
.history { display: grid; grid-template-columns: minmax(0, 1fr) 16rem; gap: 2rem; align-items: start; margin-top: 1rem; }
.cal-wrap { overflow-x: auto; padding-bottom: 0.3rem; }
.cal { display: grid; grid-template-columns: 2.2rem auto; gap: 0.25rem 0.55rem; width: max-content; }
.cal__months { grid-column: 2; display: grid; grid-template-columns: repeat(var(--weeks), 16px); gap: 3px; }
.cal__month { font-family: var(--mono); font-size: 0.54rem; color: var(--mute); text-transform: uppercase; }
.cal__spacer { grid-column: 1; grid-row: 1; }
.cal__days { grid-column: 1; display: grid; grid-template-rows: repeat(7, 16px); gap: 3px; }
.cal__day { font-family: var(--mono); font-size: 0.44rem; line-height: 16px; color: var(--mute); text-transform: uppercase; }
.cal__grid { grid-column: 2; display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 16px); grid-auto-columns: 16px; gap: 3px; }
.cal__cell { width: 16px; height: 16px; display: inline-block; }
.cal__cell.lvl-0 { background: #dde3e8; box-shadow: inset 0 0 0 1px #cfd7de; }
.cal__cell.lvl-1 { background: #b9c4ff; }
.cal__cell.lvl-2 { background: #8a9bff; }
.cal__cell.lvl-3 { background: #5c73ff; }
.cal__cell.lvl-4 { background: var(--acid-deep); }
.cal__cell.is-blank { background: transparent; box-shadow: none; }
.cal__legend { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; color: var(--mute); font-size: 0.66rem; margin: 0.8rem 0 0; }
.cal__legend .cal__cell { width: 10px; height: 10px; }
.facts { list-style: none; border-top: 1.5px solid var(--ink); }
.facts li { padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
.facts__n { display: block; font-family: var(--display); font-stretch: 120%; font-weight: 700; font-size: 1.05rem; line-height: 1; letter-spacing: -0.03em; }
.facts__l { display: block; margin-top: 0.15rem; font-size: 0.78rem; line-height: 1.4; color: var(--dim); }
.note { color: var(--mute); font-size: 0.74rem; line-height: 1.55; margin: 0.8rem 0 0; max-width: 70ch; }
.filters { display: grid; gap: 0.9rem; margin-top: 1rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 36px; background: transparent; color: var(--dim); border: 1px solid var(--line-strong); padding: 0.35rem 0.6rem; font-family: var(--mono); font-size: 0.56rem; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; }
.chip:hover { border-color: var(--ink); color: var(--ink); }
.chip[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--acid); }
.chip__n { font-family: var(--mono); font-size: 0.54rem; color: var(--mute); }
.chip[aria-pressed="true"] .chip__n { color: var(--acid); }
.row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: 0.25rem; }
.field__label { font-family: var(--mono); font-size: 0.54rem; color: var(--mute); letter-spacing: 0.07em; text-transform: uppercase; }
.search { flex: 1 1 18rem; }
.search input, .sort select { width: 100%; min-height: 42px; background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); padding: 0.55rem 0.7rem; font-family: var(--mono); font-size: 0.65rem; }
.search input:focus, .sort select:focus { outline: 2px solid var(--cobalt); outline-offset: 1px; }
.sort select { width: auto; cursor: pointer; }
.count { color: var(--mute); font-family: var(--mono); font-size: 0.56rem; letter-spacing: 0.05em; text-transform: uppercase; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.posts { list-style: none; margin: 1rem 0 0; border-top: 1.5px solid var(--ink); }
.post__link { display: grid; grid-template-columns: 8rem minmax(0, 1fr) 9rem; gap: 0.2rem 1.2rem; padding: 0.8rem 0 0.85rem; border-bottom: 1px solid var(--line); text-decoration: none; align-items: baseline; }
.post__link:hover { background: var(--surface); }
.post__meta { grid-row: 1; display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: baseline; font-family: var(--mono); font-size: 0.54rem; color: var(--mute); text-transform: uppercase; }
.post__tag { color: var(--cobalt); }
.post__title { font-family: var(--sans); font-weight: 600; font-size: 0.98rem; line-height: 1.3; letter-spacing: -0.01em; }
.post__excerpt { grid-column: 2 / 4; color: var(--dim); font-size: 0.82rem; line-height: 1.45; max-width: 80ch; }
.post__foot { grid-column: 3; grid-row: 1; display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: flex-end; font-family: var(--mono); font-size: 0.54rem; color: var(--mute); text-transform: uppercase; white-space: nowrap; }
.post__go { color: var(--cobalt); }
.post.is-hidden { display: none; }
.empty { display: none; color: var(--dim); padding: 1.2rem 0; }
.empty.is-shown { display: block; }
@media (max-width: 860px) {
  .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stat:nth-child(4) { border-left: 0; padding-left: 0; }
  .stat:nth-child(n + 4) { border-top: 1px solid var(--line); }
  .history { grid-template-columns: 1fr; gap: 1.4rem; }
  .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 1rem; }
  .post__link { grid-template-columns: 1fr; }
  .post__excerpt, .post__foot { grid-column: 1; grid-row: auto; }
  .post__foot { justify-content: flex-start; }
}
@media (max-width: 520px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat:nth-child(3) { border-left: 0; padding-left: 0; }
  .stat:nth-child(n + 3) { border-top: 1px solid var(--line); }
  .facts { grid-template-columns: 1fr; }
  .archive-head h1 { font-size: clamp(2.3rem, 12vw, 3.4rem); }
}
"""
    return f"""{head(title, description, f"{SITE}/archive/", extra_css=archive_css)}
<body>
<div class="wrap">
  <nav class="top" aria-label="Site">
    <a class="back" href="/">&larr; shobyde.com</a>
    <a class="brand" href="/">Sho Byde</a>
  </nav>

  <main>
  <header class="archive-head">
    <p class="archive-kicker">The log / every entry</p>
    <h1>Writing <span class="mark">archive</span></h1>
    <p class="lede">Every post in the daily log, with the publication history behind it. Filter by topic, search the titles, or read the numbers.</p>
  </header>

  <section class="stats" aria-label="Blog totals">
    <div class="stat"><span class="stat__n">{stats['count']}</span><span class="stat__l">posts</span></div>
    <div class="stat"><span class="stat__n">{stats['words']:,}</span><span class="stat__l">words</span></div>
    <div class="stat"><span class="stat__n">{stats['avg_minutes']:.1f} min</span><span class="stat__l">avg read</span></div>
    <div class="stat"><span class="stat__n">{topics}</span><span class="stat__l">topics</span></div>
    <div class="stat"><span class="stat__n">{stats['per_week']:.1f}</span><span class="stat__l">posts / week</span></div>
    <div class="stat"><span class="stat__n">{stats['span_days']}</span><span class="stat__l">days covered</span></div>
  </section>

  <section class="block" aria-labelledby="history">
    <p class="eyebrow" id="history">Publishing history</p>
    <h2>{pretty_date(stats['first'].isoformat())} to {pretty_date(stats['last'].isoformat())}</h2>
    <div class="history">
      {calendar_html(posts, stats)}
      <ul class="facts">
        <li><span class="facts__n">{stats['active_days']}</span><span class="facts__l">days with at least one post</span></li>
        <li><span class="facts__n">{stats['busiest_day'][1]}</span><span class="facts__l">posts on {pretty_date(stats['busiest_day'][0].isoformat())}, the busiest day</span></li>
        <li><span class="facts__n">{stats['longest_gap']} days</span><span class="facts__l">longest gap between posts</span></li>
        <li><span class="facts__n">{stats['per_week']:.1f}</span><span class="facts__l">posts per week across the span</span></li>
      </ul>
    </div>
    <p class="note">Reading time assumes 200 words per minute across prose, excluding code blocks and image captions. Counts are publication dates, not edit history: the log does not track revisions.</p>
  </section>

  <section class="block" aria-labelledby="topics">
    <p class="eyebrow" id="topics">Topics</p>
    <h2>Filter the archive</h2>
    <div class="filters" id="filters" hidden>
      <div class="chips" role="group" aria-label="Filter by topic">
        {tag_chips(posts, stats)}
      </div>
      <div class="row">
        <label class="field search"><span class="field__label">Search</span>
          <input id="q" type="search" placeholder="Title, summary, or topic" autocomplete="off" />
        </label>
        <label class="field sort"><span class="field__label">Sort</span>
          <select id="sort">
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
            <option value="long">Longest read</option>
          </select>
        </label>
      </div>
      <p class="count" id="count" role="status">{stats['count']} posts</p>
    </div>
  </section>

  <section aria-label="All posts">
    <ol class="posts" id="posts">
      {post_items(posts)}
    </ol>
    <p class="empty" id="empty">No posts match that filter. <button class="chip" type="button" id="reset">Clear filters</button></p>
  </section>

  </main>

  <footer class="footer">
    <span>{stats['count']} posts / last updated {pretty_date(stats['last'].isoformat())}</span>
    <a href="/">Back to shobyde.com</a>
  </footer>
</div>
<script>
(() => {{
  const filters = document.getElementById('filters');
  const posts = [...document.querySelectorAll('#posts .post')];
  const chips = [...document.querySelectorAll('.chip[data-tag]')];
  const q = document.getElementById('q');
  const sort = document.getElementById('sort');
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  const list = document.getElementById('posts');
  let tag = 'all';

  filters.hidden = false;

  const apply = () => {{
    const needle = q.value.trim().toLowerCase();
    let shown = 0;
    for (const el of posts) {{
      const tagOk = tag === 'all' || el.dataset.tag === tag;
      const searchOk = !needle || el.dataset.search.includes(needle);
      const visible = tagOk && searchOk;
      el.classList.toggle('is-hidden', !visible);
      if (visible) shown += 1;
    }}
    count.textContent = shown + (shown === 1 ? ' post' : ' posts');
    empty.classList.toggle('is-shown', shown === 0);
  }};

  const sortPosts = () => {{
    const mode = sort.value;
    const ordered = [...posts].sort((a, b) => {{
      if (mode === 'old') return a.dataset.date.localeCompare(b.dataset.date);
      if (mode === 'long') return (+b.dataset.words || 0) - (+a.dataset.words || 0);
      return b.dataset.date.localeCompare(a.dataset.date);
    }});
    ordered.forEach((el) => list.appendChild(el));
  }};

  chips.forEach((chip) => chip.addEventListener('click', () => {{
    tag = chip.dataset.tag;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    apply();
  }}));
  q.addEventListener('input', apply);
  sort.addEventListener('change', sortPosts);
  document.getElementById('reset').addEventListener('click', () => {{
    tag = 'all';
    q.value = '';
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.tag === 'all')));
    apply();
  }});
  apply();
}})();
</script>
</body>
</html>
"""

def main() -> None:
    posts = load_posts()
    if not posts:
        raise SystemExit("no posts in content/posts/index.json")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(page(posts), encoding="utf-8")
    print(json.dumps({"archive": str((OUT / "index.html").relative_to(ROOT)), "posts": len(posts)}))


if __name__ == "__main__":
    main()
