#!/usr/bin/env python3
"""Blind judge for the readability approaches.  python3 bench/readability/judge.py

Scores baseline vs each rewritten variant, order randomised per pair, and asks
which is easier to read and understand. Writes results/judged.json.
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".hermes" / "hermes-agent"))
import urllib.request  # noqa: E402
from hermes_cli.runtime_provider import resolve_runtime_provider  # noqa: E402

HERE = Path(__file__).resolve().parent
MODEL = "minimax-m3.1-flash"
SYSTEM = (
    "You judge how easy a website assistant's answer is to read. Compare two answers that state "
    "the same facts. Judge comprehension: sentence length, how quickly the point arrives, and "
    "whether a reader has to hold a long clause in their head. Do not reward length or extra detail. "
    "Reply with JSON only."
)
RUBRIC = """Question: {question}
Source: {source}

Answer A: {a}

Answer B: {b}

Return exactly:
{{"a": 1-5, "b": 1-5, "prefer": "A" or "B" or "tie", "why": "<= 14 words"}}
5 = easy to read and understand at a glance, 3 = readable with effort, 1 = hard to follow."""


def call(payload: str) -> str:
    resolved = resolve_runtime_provider(requested="opencode-go", target_model=MODEL)
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 900,
            "system": SYSTEM,
            "messages": [{"role": "user", "content": payload}],
        }
    ).encode()
    request = urllib.request.Request(
        f"{resolved['base_url'].rstrip('/')}/v1/messages",
        data=body,
        headers={
            "x-api-key": resolved["api_key"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "user-agent": "Hermes-Agent/1.0 (custom-agent)",
            "x-opencode-session": "boaz-readability-judge",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        data = json.loads(response.read())
    return "".join(part.get("text", "") for part in data.get("content", []) if part.get("type") == "text")


def parse(raw: str):
    start = raw.find("{")
    if start < 0:
        return None
    depth = 0
    for index in range(start, len(raw)):
        if raw[index] == "{":
            depth += 1
        elif raw[index] == "}":
            depth -= 1
            if depth == 0:
                break
    else:
        return None
    try:
        data = json.loads(raw[start : index + 1])
    except json.JSONDecodeError:
        return None
    if "a" not in data or "b" not in data:
        return None
    prefer = str(data.get("prefer", "tie")).strip().upper()[:1]
    return {
        "a": max(1, min(5, int(data["a"]))),
        "b": max(1, min(5, int(data["b"]))),
        "prefer": prefer if prefer in ("A", "B") else "tie",
        "why": str(data.get("why", ""))[:90],
    }


run = json.loads((HERE / "results" / "readability.json").read_text())
random.seed(11)
pairs = []
for row in run["rows"]:
    for name, variant in row["variants"].items():
        if not variant["changed"] or not variant["eligible"]:
            continue
        flip = random.random() < 0.5
        first, second = (variant["text"], row["answer"]) if flip else (row["answer"], variant["text"])
        verdict = None
        for _ in range(3):
            try:
                verdict = parse(
                    call(RUBRIC.format(question=row["question"], source=row["source"], a=first, b=second))
                )
            except Exception as error:  # noqa: BLE001
                print(f"  judge error: {error}", file=sys.stderr)
            if verdict:
                break
        if not verdict:
            continue
        before = verdict["b"] if flip else verdict["a"]
        after = verdict["a"] if flip else verdict["b"]
        prefer = "tie"
        if verdict["prefer"] != "tie":
            prefer = "after" if (verdict["prefer"] == "A") == flip else "before"
        pairs.append(
            {
                "approach": name,
                "question": row["question"],
                "source": row["source"],
                "before": before,
                "after": after,
                "prefer": prefer,
                "why": verdict["why"],
                "beforeText": row["answer"],
                "afterText": variant["text"],
                "beforeFlesch": row["before"]["flesch"],
                "afterFlesch": variant["metrics"]["flesch"],
            }
        )

out = {
    "judged": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    "model": MODEL,
    "pairs": pairs,
    "byApproach": {},
}
for name in {pair["approach"] for pair in pairs}:
    subset = [pair for pair in pairs if pair["approach"] == name]
    out["byApproach"][name] = {
        "pairs": len(subset),
        "before": round(sum(p["before"] for p in subset) / len(subset), 2),
        "after": round(sum(p["after"] for p in subset) / len(subset), 2),
        "preferBefore": sum(1 for p in subset if p["prefer"] == "before"),
        "preferAfter": sum(1 for p in subset if p["prefer"] == "after"),
        "ties": sum(1 for p in subset if p["prefer"] == "tie"),
    }
(HERE / "results" / "judged.json").write_text(json.dumps(out, indent=2))
print(f"judged {len(pairs)} pairs")
for name, value in out["byApproach"].items():
    print(f"  {name}: {value['before']} -> {value['after']} | preferred before {value['preferBefore']}, after {value['preferAfter']}, tie {value['ties']}")
for pair in pairs:
    print(f"    {pair['prefer']:>6} {pair['approach']:<15} {pair['before']}->{pair['after']} {pair['question'][:40]} :: {pair['why'][:50]}")
