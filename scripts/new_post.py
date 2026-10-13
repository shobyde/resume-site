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


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s[:60] or "post"


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

    # rebuild index.json (newest first by filename sort)
    index = []
    for p in sorted(POSTS.glob("*.md"), reverse=True):
        if p.name == "README.md":
            continue
        meta = parse_meta(p.read_text(encoding="utf-8"))
        title_m = re.match(r"^#\s+(.+)$", p.read_text(encoding="utf-8").split("\n")[0])
        index.append({
            "slug": p.stem,
            "date": p.stem[:10],
            "title": title_m.group(1).strip() if title_m else p.stem,
            "tag": meta["tag"],
            "excerpt": meta["subtitle"] or meta["body"].replace("\n", " ")[:150],
        })

    (POSTS / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(json.dumps({"written": str(path.relative_to(ROOT)), "total_posts": len(index)}))


if __name__ == "__main__":
    main()
