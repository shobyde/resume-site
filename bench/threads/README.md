# Threads

Single-turn suites answer "did the right capability fire". They cannot answer
"did the second question land", because the second question only exists after
the first answer. This bench replays conversations.

```
npm run bench:threads      # run + baseline + compile the page data
npm run judge:threads      # judge both runs with minimax-m3.1-flash (offline)
```

## What is measured

- **Deterministic**, per turn: the expected facts appear, no excluded fact
  appears, the expected tool was the one called, and the reply is not a refusal.
  The refusal rule matters: before it, "I'm not sure" counted as a pass whenever
  the expected capability was the one that declined.
- **Judge**, per turn: `answered`, `tool_ok`, `grounded` (0-2) and
  `readability` (1-5). The judge is given the question, the earlier turns, the
  tools called and the answer. It is not given the expected facts.

Two systems run the same threads:

| system | what it is |
| --- | --- |
| `memory` | one engine per thread, plus the site's session layer, which rewrites "the third one" against the last list |
| `stateless` | a fresh engine every turn, no session, no rewrite |

The gap between them is the claim the page makes: a thread knows what a
sentence does not.

## Files

- `threads.json` — the suite. Twelve threads, thirty turns, three kinds
  (`knowledge`, `context`, `tool`).
- `tool-threads.json` — the continuation suite for tool-backed answers.
- `run-tool-continuation.mjs` — the four-strategy comparison and its
  `results/tool-*.json` output.
- `run.mjs` — drives the site's own engine (`bench/agent-setup.mjs`), plays the
  UI's part when a tool is called, writes `results/threads-*.json`.
- `judge.py` — the LLM judge. Needs the Hermes provider resolver for its key;
  never runs in the browser.
- `history.json` — the eighteen rung suites, copied from the loop ledger with
  the release that shipped each one. Recorded, not re-run.

## Reading it

`npm run bench:threads` prints the pass by kind. A turn that fails usually falls
into one of three bins, and they are different work:

1. **Routing**: the right rule never fired ("what can you do?" declines).
2. **Context**: the right rule fired but the referent was wrong ("and what does
   the reading one use?" rewrote to Boaz).
3. **Answering**: a tool ran and no sentence followed ("compare hobnob and
   readback" opens one card and stops).

Ceilings are recorded rather than hidden: compare, ordinal-over-an-unseen-list,
and "why not both" are known misses.

## Tool continuation

`tool-threads.json` is the continuation suite for tool-backed answers. It asks
the same operation for a new subject:

```
how many commits does Boaz have?
what about Hobnob?
and Readback?
```

`run-tool-continuation.mjs` compares four strategies against the same threads:

| strategy | what carries the referent |
| --- | --- |
| `stateless` | nothing; a fresh engine every turn |
| `pointer` | the site's existing `resolvePointer` only |
| `tool` | `WorkingMemory.followUpTool()` only |
| `tool+pointer` | the tool continuation first, then the pointer |

Every non-stateless strategy keeps one engine per thread, so the engine's own
rule memory is present in all three. The comparison is what the site's pointer
and the new tool continuation add on top of it.

The primitive lives in Boaz (`resolveToolFollowUp` / `memory.followUpTool`). It
stores the capability, arguments and effective query of the last tool turn. A
follow-up like `what about Hobnob?` becomes the previous question with the old
subject replaced; the host's normal matcher still chooses the capability and
schema. The runner mirrors the site's GitHub resolver, so the rewritten question
still has to produce `github.activity` with `repo: "hobnob"`.

Current local result:

```
stateless    4/9   context 0/5
pointer      4/9   context 0/5
tool         9/9   context 5/5
tool+pointer 9/9   context 5/5
```

Run it with `npm run bench:threads:tools`. It imports the local Boaz build from
`../../../../boaz/packages/boaz/dist/core/index.js`; set `BOAZ_MEMORY` to another
built entry point if the workspace lives elsewhere.

## Judging continuity

The deterministic checks are the floor: expected facts, expected capability,
expected arguments, no refusal. They cannot tell whether a sentence that passed
the facts check actually continued the operation instead of drifting into a
generic project summary.

`judge.py` now adds a `continuity` field for `context` turns:

- `2`: keeps the previous operation and applies it to the new subject.
- `1`: keeps part of it or asks a necessary clarification.
- `0`: changes the operation, repeats the old subject, or substitutes a generic
  summary.
- `-1`: not a context turn.

It now accepts any result file:

```
python3 bench/threads/judge.py --file results/tool-tool.json
```

The judge is given the prior turns, the previous tool calls, the current tools
and the answer. It is still not given the expected facts, so it cannot rubber
stamp the deterministic check.

For comparing two systems, use a blind pairwise judge rather than comparing
absolute scores from separate runs:

1. Pair the same thread and turn from two result files.
2. Randomize which answer is A and which is B, and never tell the judge the
   strategy.
3. Ask for `A`, `B` or `tie` on continuation only, with the prior turn and the
   current question.
4. Report wins/ties per kind, plus agreement between two judge prompts or models.
5. Keep the deterministic pass and argument check alongside it. A judge win on a
   turn that called the wrong repo is not a win.

Pairwise judging removes score drift between runs; the deterministic checks
remove the judge's ability to reward a fluent non-answer.
