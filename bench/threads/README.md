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
- `run.mjs` — drives the site's own engine (`bench/agent-setup.mjs`), plays the
  UI's part when a tool is called, writes `results/threads-*.json`.
- `judge.py` — the LLM judge. Needs the Hermes provider resolver for its key;
  never runs in the browser.
- `history.json` — the eighteen rung suites, copied from the loop ledger with
  the release that shipped each one. Recorded, not re-run.
- `compile.mjs` — writes `labs/benchmarks/data.json`, which the page imports.

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
