#!/usr/bin/env python3
"""
SEO generator: turns content/posts/*.md into real crawlable static pages.

Writes:
  public/posts/<slug>/index.html   - full prerendered post page (title/desc/OG/JSON-LD + body HTML)
  public/sitemap.xml               - all static post URLs + home
Run AFTER new_post.py and the content/ -> public/content copy, BEFORE `npm run build`
(vite copies public/* into dist/).

Usage: python3 scripts/gen_seo_pages.py
"""
import html
import json
import re
import sys

from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "content" / "posts"
OUT = ROOT / "public"
SITE = "https://shobyde.com"

from reading_theme import head  # noqa: E402  (sibling module, run as a script)


def fmt_dt(date):
    try:
        d = datetime.strptime(date, "%Y-%m-%d")
        return d.strftime("%Y-%m-%dT08:00:00-07:00")
    except ValueError:
        return date


def md_to_html(md: str) -> str:
    return _md_to_html(md)


def _md_to_html(md: str) -> str:
    """Render a post body. It is already the body: do not strip again.

    The old strip removed everything up to the first "---" LINE, which is right
    for a whole file and wrong for a body containing a horizontal rule. A post
    whose body had a "---" survived as its trailing lines only (2026-11-24
    queued-chat post rendered as "file_path"> /tmp/body.md"). Strip only when the
    text really starts with front matter.
    """
    head = re.match(r"^\s*(#[^\n]*\n)?[^\n]*(Tag|Subtitle):[^\n]*\n[\s\S]*?^---\s*$", md, re.M)
    if head:
        md = md[head.end():]

    def esc(s):
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def esc_code(s):
        return esc(s)

    md = re.sub(
        r"```(\w*)\n([\s\S]*?)```",
        lambda m: f"<pre><code class=\"lang-{m.group(1)}\">{esc_code(m.group(2).strip())}</code></pre>",
        md,
    )

    def inline(s):
        s = esc(s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"<em>\1</em>", s)
        s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
        s = re.sub(r"!\[(.+?)\]\((.+?)\)", r'<img src="\2" alt="\1" loading="lazy" />', s)
        s = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2">\1</a>', s)
        return s

    out, in_list = [], False
    for line in md.split("\n"):
        is_li = line.startswith(("- ", "* "))
        if is_li and not in_list:
            out.append("<ul>")
            in_list = True
        elif not is_li and in_list:
            out.append("</ul>")
            in_list = False
        if is_li:
            out.append(f"<li>{inline(line[2:])}</li>")
        elif line.startswith("## "):
            out.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.startswith("# "):
            out.append(f"<h2>{inline(line[2:])}</h2>")
        elif line.strip():
            out.append(f"<p>{inline(line)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def parse_post(text: str) -> dict:
    head, sep, body = text.partition("\n---")
    meta = {"tag": "log", "subtitle": "", "body": (body if sep else text).strip()}
    title_m = re.search(r"^#\s+(.+)$", head, re.M)
    meta["title"] = title_m.group(1).strip() if title_m else "Untitled"
    for line in head.split("\n"):
        m = re.match(r"^(Tag|Subtitle):\s*(.+)$", line)
        if m:
            meta[m.group(1).lower()] = m.group(2).strip()
    return meta


def build_page(slug: str, meta: dict, body_html: str) -> str:
    esc = html.escape
    title = esc(meta["title"])
    desc = esc((meta["subtitle"] or meta["body"].replace("\n", " ")[:155]).strip())
    url = f"{SITE}/posts/{slug}/"
    date = slug[:10]
    author = "Sho Byde"
    post_css = """
.post-head { padding-bottom: 1.35rem; border-bottom: 1.5px solid var(--ink); margin-bottom: 1.6rem; }
.post-meta { font-family: var(--mono); font-size: 0.55rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cobalt); margin-bottom: 0.65rem; }
.post-title { font-size: clamp(2.15rem, 5vw, 4rem); line-height: 0.9; letter-spacing: -0.05em; max-width: 24ch; }
.post-lede { margin-top: 0.8rem; max-width: 60ch; color: var(--dim); font-size: 0.98rem; line-height: 1.6; }
.post-foot { margin-top: 2.4rem; padding-top: 1rem; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.6rem 1.4rem; font-family: var(--mono); font-size: 0.55rem; letter-spacing: 0.05em; text-transform: uppercase; }
.post-foot a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--cobalt); }
.post-foot a:hover { color: var(--cobalt); }
@media (max-width: 620px) { .post-title { font-size: clamp(2rem, 10vw, 3rem); } }
"""
    extra_head = f"""<meta name="author" content="{author}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{desc}" />
<meta property="og:url" content="{url}" />
<meta property="og:site_name" content="shobyde.com" />
<meta property="article:published_time" content="{fmt_dt(date)}" />
<meta property="article:author" content="{author}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="{title}" />
<meta name="twitter:description" content="{desc}" />
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": {json.dumps(meta["title"])},
  "description": {json.dumps(desc)},
  "url": "{url}",
  "datePublished": "{fmt_dt(date)}",
  "author": {{"@type": "Person", "name": "{author}", "url": "{SITE}/"}},
  "keywords": {json.dumps(meta["tag"])}
}}
</script>
<link rel="alternate" type="application/rss+xml" title="shobyde.com log" href="{SITE}/rss.xml" />"""
    lede = esc(meta["subtitle"]) if meta.get("subtitle") else ""
    return f"""{head(f"{title} - Sho Byde", desc, url, extra_css=post_css, extra_head=extra_head)}
<body>
<div class="wrap">
  <nav class="top" aria-label="Site">
    <a class="back" href="/">&larr; shobyde.com</a>
    <a class="brand" href="/">Sho Byde</a>
  </nav>
  <main>
  <article>
    <header class="post-head">
      <p class="post-meta">{date} / {esc(meta["tag"])} / by {author}</p>
      <h1 class="post-title">{title}</h1>
      {f'<p class="post-lede">{lede}</p>' if lede else ''}
    </header>
    <div class="prose">
      {body_html}
    </div>
    <footer class="post-foot">
      <a href="/">&larr; Back to shobyde.com</a>
      <a href="/archive/">All writing</a>
    </footer>
  </article>
  </main>
</div>
</body>
</html>
"""

def main() -> None:
    index = json.loads((POSTS / "index.json").read_text())
    known = {p["slug"] for p in index}
    urls = []
    built = 0
    for p in sorted(POSTS.glob("*.md"), reverse=True):
        slug = p.stem
        if slug in ("index", "README") or slug not in known:
            continue
        meta = parse_post(p.read_text(encoding="utf-8"))
        body_html = _md_to_html(meta["body"])
        d = OUT / "posts" / slug
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(build_page(slug, meta, body_html), encoding="utf-8")
        built += 1
        urls.append((slug, fmt_dt(slug[:10])))

    # prune stale generated dirs no longer backed by a post
    if (OUT / "posts").exists():
        for d in (OUT / "posts").iterdir():
            if d.is_dir() and d.name not in known:
                for f in d.glob("*.html"):
                    f.unlink()
                d.rmdir()

    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    latest = urls[0][1] if urls else fmt_dt(datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    sitemap.append(f"<url><loc>{SITE}/</loc><lastmod>{latest}</lastmod></url>")
    sitemap.append(f"<url><loc>{SITE}/archive/</loc><lastmod>{latest}</lastmod></url>")
    sitemap.append(f"<url><loc>{SITE}/boaz/</loc><lastmod>{latest}</lastmod></url>")
    for slug, dt in urls:
        sitemap.append(f"<url><loc>{SITE}/posts/{slug}/</loc><lastmod>{dt}</lastmod></url>")
    sitemap.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

    print(json.dumps({"static_pages": built, "sitemap_urls": len(urls) + 3}))


if __name__ == "__main__":
    main()
