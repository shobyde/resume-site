#!/usr/bin/env python3
"""
Daily log pipeline helper.

Usage:
  echo "Body markdown here..." | python scripts/new_post.py --title "Title" [--tag dev]

Front-matter format (written by this script, rendered by blog.js):
  # Title
  Tag: <tag>
  Subtitle: <one-liner>
  ---
  body markdown...
"""
import argparse, json, re, sys, unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "content" / "posts"

WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’.\-]*")
WORDS_PER_MINUTE = 200


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s[:60] or "post"


def body_words(body: str) -> int:
    """Prose word count, excluding fenced code and markup noise.

    Reading time should reflect what a reader actually reads; a post with a
    long code block should not be priced as if the code were prose. Image alt
    text and link URLs are stripped for the same reason.
    """
    text = re.sub(r"```.*?```", " ", body, flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[*_`>#|~]", " ", text)
    return len(WORD_RE.findall(text))


def reading_minutes(words: int) -> int:
    return max(1, round(words / WORDS_PER_MINUTE)) if words else 0


def build_index() -> list[dict]:
    """Rebuild index.json from the markdown files, newest first."""
    index = []
    for p in sorted(POSTS.glob("*.md"), reverse=True):
        if p.name == "README.md":
            continue
        text = p.read_text(encoding="utf-8")
        meta = parse_meta(text)
        title_m = re.match(r"^#\s+(.+)$", text.split("\n")[0])
        words = body_words(meta["body"])
        index.append({
            "slug": p.stem,
            "date": p.stem[:10],
            "title": title_m.group(1).strip() if title_m else p.stem,
            "tag": meta["tag"],
            "excerpt": meta["subtitle"] or meta["body"].replace("\n", " ")[:150],
            "words": words,
            "minutes": reading_minutes(words),
        })
    return index


def write_index() -> list[dict]:
    index = build_index()
    (POSTS / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    return index


def parse_meta(text: str) -> dict:
    """Extract Tag/Subtitle from front-matter block."""
    head, sep, body = text.partition("\n---")
    meta = {"tag": "log", "subtitle": "", "body": (body[len(sep):] if sep else text).strip()}
    for line in head.split("\n"):
        m = re.match(r"^(Tag|Subtitle):\s*(.+)$", line)
        if m:
            meta[m.group(1).lower()] = m.group(2).strip()
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True)
    ap.add_argument("--tag", default="log")
    ap.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    ap.add_argument("--file", help="markdown body file; else stdin")
    args = ap.parse_args()

    body = Path(args.file).read_text() if args.file else sys.stdin.read()
    body = body.strip()
    if not body:
        print("error: empty body", file=sys.stderr)
        sys.exit(1)

    # Treat the first plain line as a subtitle if present
    lines = body.split("\n")
    subtitle = ""
    if len(lines) > 1 and lines[0].strip() and not lines[0].startswith(("#", "-", "*", "```", "Tag:", "Subtitle:")):
        subtitle = lines[0].strip()
        body = "\n".join(lines[1:]).strip()

    slug = f"{args.date}-{slugify(args.title)}"
    path = POSTS / f"{slug}.md"
    path.write_text(
        f"# {args.title}\nTag: {args.tag}\n"
        + (f"Subtitle: {subtitle}\n" if subtitle else "")
        + f"---\n{body}\n",
        encoding="utf-8",
    )

    # rebuild index.json (newest first by filename sort) with stats
    index = write_index()
    print(json.dumps({"written": str(path.relative_to(ROOT)), "total_posts": len(index)}))

    # refresh public/content copy + archive page + static SEO pages
    import subprocess
    pub = ROOT / "public"
    pub.mkdir(exist_ok=True)
    subprocess.run(["cp", "-r", str(POSTS), str(pub / "content" if (pub / "content").exists() else pub)], check=True)
    archive = ROOT / "scripts" / "gen_archive.py"
    if archive.exists():
        subprocess.run([sys.executable, str(archive)], check=True)
    seo = ROOT / "scripts" / "gen_seo_pages.py"
    if seo.exists():
        subprocess.run([sys.executable, str(seo)], check=True)


if __name__ == "__main__":
    main()
