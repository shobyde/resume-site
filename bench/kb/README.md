# Handbook arena

Five approaches to the same questions, over a knowledge base that is not this
site: 8 products, 14 services, 5 teams, 10 people, 8 policies, 170 facts.

```
npm run bench:kb     # fitted suite, two held-out sets, compile
npm run judge:kb     # judge the fresh set (offline, minimax-m3.1-flash)
```

## The five

| system | what it is |
| --- | --- |
| `templates` | a regex per question shape and a flat lookup |
| `bm25` | retrieve the best fact sentence and quote it |
| `rules` | join the question to the fact table by entity and attribute |
| `rules-memory` | rules plus a session: subject, last list, last action |
| `hybrid` | rules + session, retrieval as the fallback |

## The three sets

- `threads.json` (40 threads, 91 turns) is **fitted**: it was written alongside
  the systems. 91/91 is not a claim about the approach, it is a claim about the
  suite.
- `heldout.json` (23 turns) is paraphrases, used once to find vocabulary gaps.
  After that pass it is a dev set, not a held-out one.
- `heldout2.json` (14 turns) was written afterwards and nothing was tuned
  against it. This is the number to quote: **4/14** for the best system.

## What the gap means

A phrase table and a rule set know the words and shapes they were given.
"Which product has the highest SLA?" needs a comparison nobody declared, and
"what happens during a sev 1?" needs prose retrieval with a threshold that a
BM25 lookup over fact sentences does not have. An LLM would answer both. The
deterministic system declines, which is the behaviour the site's assistant
promises, and the judge scores readability 4.6/5 on the answers it does give.

## Adding a set

Write threads with `ask`, `kind` and `expect` (`include`, `exclude`, `tool`,
or `decline: true`). Run `node bench/kb/run.mjs --heldout2` after pointing the
flag at the new file, then recompile. Keep new sets untouched until the first
number is recorded.
