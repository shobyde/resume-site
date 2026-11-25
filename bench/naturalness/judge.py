#!/usr/bin/env python3
"""Blind judge for the naturalness spike.

    python3 bench/naturalness/judge.py

Reads results/naturalness.json, shows a model two versions of the same answer in
random order, and asks which reads more like prose written by a person. The
order is randomised per case and the mapping is only revealed afterwards, so the
verdict is not anchored to "the new one".

Writes results/judged.json.
"""
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".hermes" / "hermes-agent"))
import urllib.request  # noqa: E402
from hermes_cli.runtime_provider import resolve_runtime_provider  # noqa: E402

HERE = Path(__file__).resolve().parent
MODEL = "minimax-m3.1-flash"
SYSTEM = (
    "You judge how naturally a website assistant's answer reads. Compare two answers that "
    "state the same facts. Judge flow, grammar, and whether a person would say it that way. "
    "Do not judge length, and do not assume the longer one is better. Reply with JSON only."
)
RUBRIC = """Question: {question}

Answer A: {a}

Answer B: {b}

Return exactly:
{{"a": 1-5, "b": 1-5, "prefer": "A" or "B" or "tie", "why": "<= 12 words"}}
5 = reads like a person wrote it, 3 = understandable but stiff, 1 = broken."""


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
            "x-opencode-session": "boaz-naturalness-judge",
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
        "why": str(data.get("why", ""))[:80],
    }


run = json.loads((HERE / "results" / "naturalness.json").read_text())
random.seed(7)
scored = []
for case in run["results"]:
    if case["before"] == case["after"]:
        continue
    flip = random.random() < 0.5
    first, second = (case["after"], case["before"]) if flip else (case["before"], case["after"])
    payload = RUBRIC.format(question=case["question"], a=first, b=second)
    verdict = None
    for _ in range(3):
        try:
            verdict = parse(call(payload))
        except Exception as error:  # noqa: BLE001
            print(f"  judge error: {error}", file=sys.stderr)
        if verdict:
            break
    if not verdict:
        continue
    # Map the blind scores back to before/after.
    before_score = verdict["b"] if flip else verdict["a"]
    after_score = verdict["a"] if flip else verdict["b"]
    preference = "before" if (verdict["prefer"] == "B") == flip and verdict["prefer"] != "tie" else "after"
    if verdict["prefer"] == "tie":
        preference = "tie"
    scored.append(
        {
            "question": case["question"],
            "before": before_score,
            "after": after_score,
            "prefer": preference,
            "why": verdict["why"],
        }
    )

# Score every answer on its own too, so the model's taste can be checked against
# the corpus score rather than only used as a tie-break.
SINGLE = """Question: {question}

Answer: {answer}

Return exactly:
{{"score": 1-5, "why": "<= 10 words"}}
5 = reads like a person wrote it, 3 = understandable but stiff, 1 = broken."""

single = []
for case in run["results"]:
    verdict = None
    for _ in range(3):
        try:
            raw = call(SINGLE.format(question=case["question"], answer=case["before"]))
            start = raw.find("{")
            depth = 0
            for index in range(start, len(raw)):
                if raw[index] == "{":
                    depth += 1
                elif raw[index] == "}":
                    depth -= 1
                    if depth == 0:
                        break
            data = json.loads(raw[start : index + 1])
            verdict = int(data["score"]) if "score" in data else None
        except Exception as error:  # noqa: BLE001
            print(f"  single error: {error}", file=sys.stderr)
        if verdict:
            break
    if verdict:
        single.append({"question": case["question"], "score": verdict, "lm": case["lmBefore"], "flesch": case["fleschBefore"]})

if not scored:
    print("no cases could be judged")
    raise SystemExit(1)

mean = lambda key: round(sum(row[key] for row in scored) / len(scored), 2)  # noqa: E731
def correlation(pairs):
    n = len(pairs)
    if n < 3:
        return None
    mx = sum(x for x, _ in pairs) / n
    my = sum(y for _, y in pairs) / n
    num = sum((x - mx) * (y - my) for x, y in pairs)
    dx = sum((x - mx) ** 2 for x, _ in pairs) ** 0.5
    dy = sum((y - my) ** 2 for _, y in pairs) ** 0.5
    return round(num / (dx * dy), 3) if dx and dy else None

out = {
    "judged": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    "single": single,
    "correlationLmNaturalness": correlation([(row["lm"], row["score"]) for row in single]),
    "correlationFleschNaturalness": correlation([(row["flesch"], row["score"]) for row in single]),
    "model": MODEL,
    "cases": scored,
    "before": mean("before"),
    "after": mean("after"),
    "preferBefore": sum(1 for row in scored if row["prefer"] == "before"),
    "preferAfter": sum(1 for row in scored if row["prefer"] == "after"),
    "ties": sum(1 for row in scored if row["prefer"] == "tie"),
}
(HERE / "results" / "judged.json").write_text(json.dumps(out, indent=2))
print(f"judged {len(scored)} rewritten answers")
print(f"  naturalness before {out['before']}  after {out['after']}")
print(f"  preferred: before {out['preferBefore']}, after {out['preferAfter']}, tie {out['ties']}")
for row in scored:
    print(f"  {row['prefer']:>6}  {row['question'][:38]:<38} {row['before']}->{row['after']}  {row['why'][:50]}")
