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

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}" />
<link rel="canonical" href="{SITE}/archive/" />
<meta name="theme-color" content="#0b0b0f" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="{SITE}/archive/" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
<noscript><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" /></noscript>
<style>
:root {{
  --bg: #0b0b0f; --panel: #12121a;
  --fg: #e8e8ee; --dim: #b4b4c0; --mute: #9a9aa8;
  --accent: #7c6cff; --accent-text: #a79bff; --accent2: #00d9b8; --line: #2a2a3a;
  --head: 'Space Grotesk', system-ui, sans-serif;
  --body: 'Inter', system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;
}}
* {{ box-sizing: border-box; }}
html {{ color-scheme: dark; scroll-behavior: smooth; }}
body {{
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.65 var(--body);
  -webkit-font-smoothing: antialiased;
}}
a {{ color: inherit; }}
.wrap {{ max-width: 1040px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }}
.top {{ display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 3rem; }}
.back {{ font-family: var(--mono); font-size: .8rem; color: var(--dim); text-decoration: none; }}
.back:hover {{ color: var(--fg); }}
.home {{ font-family: var(--head); font-weight: 600; letter-spacing: -.02em; text-decoration: none; }}
h1 {{ font: 600 clamp(2.2rem, 6vw, 3.6rem)/1.05 var(--head); letter-spacing: -.03em; margin: 0 0 .6rem; }}
.lede {{ color: var(--dim); max-width: 62ch; margin: 0 0 2.5rem; font-size: 1.05rem; }}
h2 {{ font: 600 1.25rem/1.2 var(--head); letter-spacing: -.01em; margin: 0 0 1rem; }}
.eyebrow {{ font-family: var(--mono); font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin: 0 0 .35rem; }}

.stats {{ display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .75rem; margin-bottom: 3rem; }}
.stat {{ background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: .9rem 1rem; }}
.stat__n {{ font: 600 1.35rem/1.1 var(--head); letter-spacing: -.02em; display: block; }}
.stat__l {{ color: var(--mute); font-size: .74rem; letter-spacing: .06em; text-transform: uppercase; }}

.history {{ display: grid; grid-template-columns: minmax(0, 1fr) 15rem; gap: 2rem; align-items: start; }}
.cal-wrap {{ overflow-x: auto; padding-bottom: .3rem; }}
.cal {{ display: grid; grid-template-columns: 2.2rem auto; gap: .25rem .55rem; width: max-content; }}
.cal__months {{ grid-column: 2; display: grid; grid-template-columns: repeat(var(--weeks), 20px); gap: 4px; }}
.cal__month {{ font: 500 .66rem var(--mono); color: var(--dim); }}
.cal__spacer {{ grid-column: 1; grid-row: 1; }}
.cal__days {{ grid-column: 1; display: grid; grid-template-rows: repeat(7, 20px); gap: 4px; }}
.cal__day {{ font: 500 .62rem/20px var(--mono); color: var(--dim); }}
.cal__grid {{ grid-column: 2; display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 20px); grid-auto-columns: 20px; gap: 4px; }}
.cal__cell {{ width: 20px; height: 20px; border-radius: 4px; display: inline-block; }}
.cal__cell.lvl-0 {{ background: #1c1c28; box-shadow: inset 0 0 0 1px #262633; }}
.cal__cell.lvl-1 {{ background: #3b3387; }}
.cal__cell.lvl-2 {{ background: #5747cf; }}
.cal__cell.lvl-3 {{ background: #8377ff; }}
.cal__cell.lvl-4 {{ background: var(--accent2); }}
.cal__cell.is-blank {{ background: transparent; box-shadow: none; }}
.cal__legend {{ display: flex; align-items: center; gap: .4rem; color: var(--mute); font-size: .75rem; margin: .9rem 0 0; }}
.cal__legend .cal__cell {{ width: 11px; height: 11px; border-radius: 3px; }}
.facts {{ list-style: none; margin: 0; padding: 0; display: grid; gap: .7rem; }}
.facts li {{ border-top: 1px solid var(--line); padding-top: .7rem; }}
.facts li:first-child {{ border-top: 0; padding-top: 0; }}
.facts__n {{ font: 600 1rem/1.2 var(--head); display: block; }}
.facts__l {{ color: var(--mute); font-size: .8rem; }}
.note {{ color: var(--mute); font-size: .8rem; margin: .8rem 0 0; }}

.block {{ margin: 3rem 0 0; }}
.filters {{ display: grid; gap: 1rem; }}
.chips {{ display: flex; flex-wrap: wrap; gap: .45rem; }}
.chip {{
  display: inline-flex; align-items: center; gap: .45rem;
  background: var(--panel); color: var(--dim); border: 1px solid var(--line);
  border-radius: 999px; padding: .4rem .8rem; font: 500 .82rem var(--body);
  cursor: pointer; min-height: 40px;
}}
.chip:hover {{ color: var(--fg); border-color: #3a3a52; }}
.chip[aria-pressed="true"] {{ color: #fff; background: #2a2360; border-color: var(--accent); }}
.chip__n {{ font-family: var(--mono); font-size: .72rem; color: var(--mute); }}
.chip[aria-pressed="true"] .chip__n {{ color: #cfcaff; }}
.row {{ display: flex; flex-wrap: wrap; gap: .75rem; align-items: flex-end; }}
.field {{ display: flex; flex-direction: column; gap: .3rem; }}
.field__label {{ font: .72rem var(--mono); color: var(--mute); letter-spacing: .06em; text-transform: uppercase; }}
.search {{ flex: 1 1 18rem; }}
.search input, .sort select {{
  width: 100%; background: var(--panel); color: var(--fg); border: 1px solid var(--line);
  border-radius: 10px; padding: .7rem .9rem; font: 400 .92rem var(--body); min-height: 44px;
}}
.search input::placeholder {{ color: var(--mute); }}
.sort select {{ width: auto; cursor: pointer; }}
.count {{ color: var(--dim); font: .78rem var(--mono); margin: 0; }}
.sr-only {{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }}

.posts {{ list-style: none; margin: 1.2rem 0 0; padding: 0; display: grid; gap: .6rem; }}
.post__link {{
  display: grid; grid-template-columns: 9.5rem 1fr auto; gap: .3rem 1.2rem;
  padding: 1rem 1.15rem; background: var(--panel); border: 1px solid var(--line);
  border-radius: 12px; text-decoration: none; transition: border-color .18s, transform .18s;
}}
.post__link:hover {{ border-color: var(--accent); transform: translateY(-2px); }}
.post__meta {{ grid-row: 1; display: flex; gap: .6rem; align-items: baseline; font: .76rem var(--mono); color: var(--mute); }}
.post__tag {{ color: var(--accent2); }}
.post__title {{ font: 600 1.02rem/1.35 var(--head); }}
.post__excerpt {{ grid-column: 2 / 4; color: var(--dim); font-size: .9rem; }}
.post__foot {{ grid-column: 3; grid-row: 1; display: flex; gap: .8rem; align-items: baseline; font: .76rem var(--mono); color: var(--mute); white-space: nowrap; }}
.post__go {{ color: var(--accent-text); }}
.post.is-hidden {{ display: none; }}
.empty {{ display: none; color: var(--dim); padding: 1.4rem 0; }}
.empty.is-shown {{ display: block; }}
footer {{ margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--line); color: var(--mute); font-size: .82rem; display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }}
footer a {{ color: var(--dim); }}

@media (max-width: 860px) {{
  .stats {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
  .history {{ grid-template-columns: 1fr; gap: 1.5rem; }}
  .facts {{ grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem 1.2rem; }}
  .post__link {{ grid-template-columns: 1fr; }}
  .post__excerpt, .post__foot {{ grid-column: 1; grid-row: auto; }}
  .post__foot {{ justify-content: space-between; }}
}}
@media (max-width: 520px) {{
  .stats {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .cal {{ grid-template-columns: 2rem auto; }}
  .facts {{ grid-template-columns: 1fr; }}
}}
@media (prefers-reduced-motion: reduce) {{
  html {{ scroll-behavior: auto; }}
  .post__link {{ transition: none; }}
  .post__link:hover {{ transform: none; }}
}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <a class="back" href="/">← shobyde.com</a>
    <a class="home" href="/">Sho Byde</a>
  </div>

  <h1>Writing archive</h1>
  <p class="lede">Every post in the daily log, with the publication history behind it. Filter by topic, search the titles, or read the numbers.</p>

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

  <footer>
    <span>{stats['count']} posts · last updated {pretty_date(stats['last'].isoformat())}</span>
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
