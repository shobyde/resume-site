#!/usr/bin/env python3
"""Judges one handbook run with an LLM, offline.

    python3 bench/kb/judge.py results/kb-hybrid-heldout2.json

Writes judged-<name>.json beside the run. Same rubric as the site bench: did it
answer, did it call the right tool, is it grounded, is it readable. The judge is
not told the expected facts.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".hermes" / "hermes-agent"))
import urllib.request  # noqa: E402
from hermes_cli.runtime_provider import resolve_runtime_provider  # noqa: E402

HERE = Path(__file__).resolve().parent
MODEL = "minimax-m3.1-flash"
SYSTEM = (
    "You grade a handbook assistant's answers. Judge only what is asked: did it "
    "answer, was the tool right, is every claim supported, is it readable. A "
    "refusal is not an answer. Reply with JSON only."
)
RUBRIC = """EARLIER TURNS:
{prior}

QUESTION: {ask}
TOOLS CALLED: {calls}
ANSWER: {text}

Return exactly:
{{"answered": 0 or 1, "tool_ok": 0 or 1 or -1, "grounded": 0-2, "readability": 1-5, "why": "<= 12 words"}}
tool_ok: -1 when the question needed no tool."""


def call(payload):
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
            "x-opencode-session": "boaz-kb-judge",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        data = json.loads(response.read())
    return "".join(part.get("text", "") for part in data.get("content", []) if part.get("type") == "text")


def parse(raw):
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
    if "answered" not in data:
        return None
    return {
        "answered": 1 if data.get("answered") in (1, True) else 0,
        "tool_ok": int(data.get("tool_ok", -1)),
        "grounded": max(0, min(2, int(data.get("grounded", 1)))),
        "readability": max(1, min(5, int(data.get("readability", 3)))),
        "why": str(data.get("why", ""))[:80],
    }


source = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "results" / "kb-hybrid-heldout2.json"
run = json.loads(source.read_text())
scored = []
prior = []
last_thread = None
for turn in run["turns"]:
    if turn["thread"] != last_thread:
        prior = []
        last_thread = turn["thread"]
    payload = RUBRIC.format(
        prior="\n".join(prior) or "(none)",
        ask=turn["ask"],
        calls=turn["calls"] or "none",
        text=turn["text"],
    )
    result = None
    for _ in range(3):
        try:
            result = parse(call(payload))
        except Exception as error:  # noqa: BLE001
            print(f"  judge error: {error}", file=sys.stderr)
        if result:
            break
    result = result or {"answered": 0, "tool_ok": -1, "grounded": 1, "readability": 3, "why": "judge failed"}
    scored.append({**{k: turn[k] for k in ("thread", "ask", "kind", "pass", "calls")}, **result})
    prior += [f"- visitor: {turn['ask']}", f"- assistant: {turn['text'][:200]}"]

out = {
    "judged": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    "model": MODEL,
    "source": source.name,
    "system": run["system"],
    "turns": scored,
}
target = HERE / "results" / f"judged-{source.stem}.json"
target.write_text(json.dumps(out, indent=2))

answered = sum(turn["answered"] for turn in scored)
needed = [turn for turn in scored if turn["tool_ok"] != -1]
read = sum(turn["readability"] for turn in scored) / len(scored)
print(f"judged {len(scored)} turns of {run['system']} from {source.name}")
print(f"  answered    {answered}/{len(scored)}")
print(f"  tool ok     {sum(t['tool_ok'] for t in needed)}/{len(needed)}")
print(f"  readability {read:.2f}/5")
print(f"  wrote {target.name}")
