#!/usr/bin/env python3
"""Rebuild index.json (with word counts) and every derived page, without
touching a post.

Use after changing the index format, or when posts were added by hand.
new_post.py runs the same path for a single post.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import new_post  # noqa: E402

index = new_post.write_index()
subprocess.run(
    ["cp", "-r", str(new_post.POSTS), str(ROOT / "public" / "content")], check=True
)
for script in ("gen_archive.py", "gen_seo_pages.py"):
    path = ROOT / "scripts" / script
    if path.exists():
        subprocess.run([sys.executable, str(path)], check=True)

print(json.dumps({"posts": len(index), "words": sum(p["words"] for p in index)}))
