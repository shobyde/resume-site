#!/usr/bin/env python3
"""Scores thread transcripts with an LLM judge.

Deterministic checks in run.mjs say whether an expected fact or tool appears.
They cannot say whether the sentence answered the question, or whether it did so
in a way a person would call readable. That is a judgement, so it is made by a
model — offline, in the lab, never in the browser.

    python3 bench/threads/judge.py            # memory run
    python3 bench/threads/judge.py --stateless

Writes bench/threads/results/judged-<mode>.json. The judge is given the question,
the prior turns, the answer and the tools called; it is not given the expected
facts, so it cannot rubber-stamp the deterministic check.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".hermes" / "hermes-agent"))
from hermes_cli.runtime_provider import resolve_runtime_provider  # noqa: E402

import urllib.request  # noqa: E402

HERE = Path(__file__).resolve().parent
MODE = "stateless" if "--stateless" in sys.argv else "memory"
MODEL = "minimax-m3.1-flash"
PROVIDER = "opencode-go"

SYSTEM = (
    "You are grading a website assistant's answer inside a conversation. "
    "Score only what is asked. Never guess facts about the person; judge whether "
    "the answer is supported by what it says and whether it addresses the question. "
    "A refusal (\"I'm not sure\", \"I can only help with...\") is not an answer. "
    "Reply with JSON only, no prose."
)

RUBRIC = """The visitor's earlier turns and the question are below, followed by the answer.
Return exactly:
{"answered": 0 or 1, "tool_ok": 0 or 1 or -1, "grounded": 0-2, "readability": 1-5, "why": "<= 14 words"}
answered: 1 if the answer actually answers the question asked (or performs the action asked for).
tool_ok: 1 if the tools called match what the question needed, 0 if they missed or were irrelevant, -1 if no tool was needed.
grounded: 2 if every claim is supported by the answer's own facts, 1 if some claim is vague, 0 if it invents something.
readability: 5 plain and natural, 3 understandable but clumsy, 1 broken or unreadable.
why: the shortest reason, no restating."""


def call(payload):
    resolved = resolve_runtime_provider(requested=PROVIDER, target_model=MODEL)
    base = resolved["base_url"].rstrip("/")
    key = resolved["api_key"]
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 900,
            "system": SYSTEM,
            "messages": [
                {"role": "user", "content": payload},
                # Prefill: the model continues from an open brace, which removes
                # the preamble that made half the replies unparseable.
                {"role": "assistant", "content": "{"},
            ],
        }
    ).encode()
    request = urllib.request.Request(
        f"{base}/v1/messages",
        data=body,
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "user-agent": "Hermes-Agent/1.0 (custom-agent)",
            "x-opencode-session": "boaz-thread-judge",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        data = json.loads(response.read())
    parts = data.get("content") or []
    # Thinking models return reasoning blocks too; only text blocks are the answer.
    return "".join(part.get("text", "") for part in parts if part.get("type") == "text")


def parse(raw):
    # Take the first balanced object: a model that thinks before answering may
    # put braces in its reasoning, and a greedy regex would swallow them.
    start = raw.find("{")
    if start < 0:
        return None
    depth = 0
    for index in range(start, len(raw)):
        char = raw[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                candidate = raw[start : index + 1]
                break
    else:
        return None
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if "answered" not in data:
        return None
    return {
        "answered": 1 if data.get("answered") in (1, True) else 0,
        "tool_ok": int(data.get("tool_ok", -1)),
        "grounded": max(0, min(2, int(data.get("grounded", 1)))),
        "readability": max(1, min(5, int(data.get("readability", 3)))),
        "why": str(data.get("why", ""))[:90],
    }


source = HERE / "results" / f"threads-{MODE}.json"
run = json.loads(source.read_text())
scored = []
for thread in run["threads"]:
    prior = []
    for turn in thread["turns"]:
        expected_tool = turn.get("expect", {}).get("tool")
        payload = "\n".join(
            [
                RUBRIC,
                "",
                "EARLIER TURNS:",
                *([f"- visitor: {q}\n- assistant: {a}" for q, a in zip(prior[::2], prior[1::2])] or ["(none)"]),
                "",
                f"QUESTION: {turn['ask']}",
                f"TOOLS CALLED: {[c['id'] for c in turn.get('calls', [])] or 'none'}",
                f"TOOL NEEDED: {expected_tool or 'none needed'}",
                f"ANSWER: {turn['text']}",
            ]
        )
        result = None
        for attempt in range(3):
            try:
                raw = call(payload)
                result = parse(raw)
                if not result:
                    with open(HERE / "results" / "judge-failures.log", "a") as log:
                        log.write(f"--- {turn['ask']!r}\n{raw[:500]}\n")
            except Exception as error:  # noqa: BLE001 - the retry is the point
                result = None
                with open(HERE / "results" / "judge-failures.log", "a") as log:
                    log.write(f"--- {turn['ask']!r} ERROR {error}\n")
            if result:
                break
        if not result:
            result = {"answered": 0, "tool_ok": -1, "grounded": 1, "readability": 3, "why": "judge failed"}
        scored.append(
            {
                "thread": thread["id"],
                "ask": turn["ask"],
                "kind": turn["kind"],
                "pass": turn["pass"],
                **result,
            }
        )
        prior.extend([turn["ask"], turn["text"]])

out = {
    "judged": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    "model": MODEL,
    "provider": PROVIDER,
    "mode": MODE,
    "turns": scored,
}
target = HERE / "results" / f"judged-{MODE}.json"
target.write_text(json.dumps(out, indent=2))

answered = sum(t["answered"] for t in scored)
needed = [t for t in scored if t["tool_ok"] != -1]
tool = sum(t["tool_ok"] for t in needed)
read = sum(t["readability"] for t in scored) / len(scored)
ground = sum(t["grounded"] for t in scored) / (2 * len(scored))
print(f"judged {len(scored)} turns with {MODEL}")
print(f"  answered   {answered}/{len(scored)}")
print(f"  tool ok    {tool}/{len(needed)} turns that needed one")
print(f"  grounded   {ground:.2f}")
print(f"  readability {read:.2f}/5")
print(f"  wrote {target.relative_to(HERE.parent.parent)}")
