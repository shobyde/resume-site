#!/usr/bin/env python3
"""Fail the build when a post file is malformed.

A post is: `# Title`, `Tag: x`, optional `Subtitle: y`, one `---` rule, then the
body. The renderers treat everything after the FIRST rule as the body, so a
second rule at the end is body text, and a stray tool-call fragment renders to
the visitor. That happened once (2026-11-24): the page showed `file_path">` and
`/tmp/body.md` instead of the article, while every other check stayed green.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

POSTS = Path(__file__).resolve().parent.parent / "content" / "posts"

JUNK = re.compile(r'(file_path">|</?parameter\b|^/tmp/\S+)', re.I)
MIN_BODY = 80


def main() -> int:
    problems: list[tuple[str, str]] = []
    posts = sorted(POSTS.glob("*.md"))
    for path in posts:
        text = path.read_text(encoding="utf-8")
        if not text.startswith("# "):
            problems.append((path.name, "does not start with an H1 title"))
            continue
        parts = re.split(r"^---\s*$", text, maxsplit=1, flags=re.M)
        if len(parts) != 2:
            problems.append((path.name, "no front-matter separator"))
            continue
        head, body = parts
        if not re.search(r"^Tag:\s*\S+", head, re.M):
            problems.append((path.name, "no Tag: line"))
        body = body.strip()
        lines = body.splitlines()
        if len(body) < MIN_BODY:
            problems.append((path.name, f"body is {len(body)} characters (minimum {MIN_BODY})"))
        for number, line in enumerate(lines, 1):
            if JUNK.search(line.strip()):
                problems.append((path.name, f"tool-call fragment on body line {number}: {line.strip()[:48]}"))
            if line.strip() == "---" and number >= len(lines) - 2:
                problems.append((path.name, f"trailing '---' on body line {number}"))
        if lines and lines[-1].strip() == "---":
            problems.append((path.name, "body ends with a rule"))

    if problems:
        print("post check failed:", file=sys.stderr)
        for name, why in problems:
            print(f"  {name}: {why}", file=sys.stderr)
        print(f"\n{len(problems)} problem(s) across {len(posts)} posts.", file=sys.stderr)
        return 1
    print(f"post check: {len(posts)} posts clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
