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


def fmt_dt(date):
    try:
        d = datetime.strptime(date, "%Y-%m-%d")
        return d.strftime("%Y-%m-%dT08:00:00-07:00")
    except ValueError:
        return date


def md_to_html(md: str) -> str:
    return _md_to_html(md)


def _md_to_html(md: str) -> str:
    md = re.sub(r"^[\s\S]*?^---\s*$", "", md, count=1, flags=re.M)

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
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title} - Sho Byde</title>
<meta name="description" content="{desc}" />
<link rel="canonical" href="{url}" />
<meta name="author" content="{author}" />
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
<link rel="alternate" type="application/rss+xml" title="shobyde.com log" href="{SITE}/rss.xml" />
<style>
  body {{ font-family: Georgia, 'Times New Roman', serif; margin: 0; background: #0b0b0f; color: #dcdcdc; line-height: 1.65; }}
  main {{ max-width: 760px; margin: 0 auto; padding: 3rem 1.25rem 4rem; }}
  h1 {{ font-size: 2rem; margin: .2rem 0 .6rem; }}
  h2 {{ margin-top: 1.8rem; }}
  a {{ color: #9ecbff; }}
  pre {{ background: #15151b; padding: 1rem; border-radius: 8px; overflow-x: auto; }}
  code {{ font-family: ui-monospace, 'JetBrains Mono', monospace; }}
  .meta {{ color: #888; font-size: .85rem; margin-bottom: 2rem; }}
</style>
</head>
<body>
<main>
  <h1>{title}</h1>
  <div class="meta">{date} &middot; {esc(meta["tag"])} &middot; by {author}</div>
  {body_html}
  <p><a href="{SITE}/">&larr; back to shobyde.com</a></p>
</main>
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
    sitemap.append(f"<url><loc>{SITE}/</loc><lastmod>{urls[0][1] if urls else fmt_dt(datetime.now(timezone.utc).strftime('%Y-%m-%d'))}</lastmod></url>")
    for slug, dt in urls:
        sitemap.append(f"<url><loc>{SITE}/posts/{slug}/</loc><lastmod>{dt}</lastmod></url>")
    sitemap.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

    print(json.dumps({"static_pages": built, "sitemap_urls": len(urls) + 1}))


if __name__ == "__main__":
    main()
