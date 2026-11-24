# Composition spikes — making the assistant sound written, not filled in

`npm run bench:composition` runs four composition strategies over the same 24 questions and scores them.
The current shipping system is one of the four (baseline), so every claim below is measured against what
visitors get today.

```
system        fidelity  similarity  openers  spread  ttr   stable  corpus  frames  follow  ms
legacy           100%        1.00     0.25     5.0  1.00    100%    1.60     100%       0   2
shipped          100%        0.48     0.67     8.2  1.00    100%    1.71      79%       0  26
A pools          100%        0.37     0.79     4.3  0.99    100%    1.87      62%       0   1
B grammar        100%        0.46     0.58     6.8  0.99    100%    1.74      62%       1   2
C voice          100%        0.25     0.58     4.7  0.99    100%    1.56      17%       0   2
D hybrid         100%        0.37     0.71     5.8  0.98    100%    1.81      67%       1   2
```

Last run: 2026-11-23, against six project cards and 59 posts. Similarity, spread and frame variety move
whenever the data changes (a new project rewords every list answer), so compare a run against the table
in this file only when the data is the same size.

`legacy` is the composer set the site shipped before this work, fed the same facts; `shipped` is the
routed system now in `src/agent/phrasing.js`. Similarity is computed with the required facts masked, so it
measures the words around the answer rather than the answer itself.

Two numbers need care. Legacy's fidelity is 100% *as a composer* — the 75% the routed system used to score
came from questions that never reached a composer (refusals on "what did he make?", "how much has he
written?"), and those keywords were fixed in the same pass. Similarity of 1.00 for legacy is the honest
headline: every phrasing of an intent produced the identical sentence.

## The question set

Six intents, four paraphrases each (24 turns): project list, "which projects use Python", post count and
newest post, email, LinkedIn, and who he is. Each intent declares the facts a correct answer must contain,
so style cannot buy its way past a wrong answer.

## What each number means

| metric | definition | reads as |
| --- | --- | --- |
| fidelity | share of turns containing every required fact | accuracy floor |
| similarity | mean character-trigram Jaccard between the four answers to one intent | **the templated-ness measure**: 1.00 = same sentence every time |
| openers | distinct first three words across all 24 answers | how often the answer starts the same way |
| spread | standard deviation of answer length in words | 0 = every reply the same size |
| ttr | mean type-token ratio inside an answer | lexical range |
| stable | identical text when the same question is asked twice | does it wobble |
| corpus | distance from the blog's own prose (sentence length, commas, contractions, em dashes) | voice match |
| frames | share of answers whose opener is a discourse frame rather than a topic claim | non-sequitur risk |
| follow | does "both?" resolve to the two things just named | discourse memory |

`frames` exists because of what spike C produced: a harvested opener carries its original subject, so
"The synthesis: Readback and Groundglass." is a confident-sounding non-sequitur. An opener that makes no
claim ("Cutting to it —", "The short version:") scores 1; one that introduces a topic the answer never
mentions scores 0. The whitelist is a proxy, not a judge.

## The four approaches

The shipped system is `src/agent/phrasing.js`: intent picks the construction, the question's hash picks the
realisation, and the rule that named the fact still owns the facts.

**A — phrase pools** (`systems/a-pools.mjs`). Each intent keeps five whole-sentence variants of the same
claim; a hash of the question picks one. Best opener variety (0.79) and 100% fidelity for two lines of code
per intent. It has no discourse: "both?" after a two-entity answer gets nothing, and the sentences never
refer back, because every variant stands alone.

**B — slot grammar** (`systems/b-grammar.mjs`). Facts fill typed slots; the question form picks the
construction (count-first for "how many", entity-first for "which"), agreement follows the count, and a
follow-up refers back ("Both of them — Readback and Groundglass."). Highest length spread (6.9) because
answers vary in how much they say, not just how they say it. Its weakness is the opposite of A's: fewer
distinct openers (0.58), since form-driven choice collapses paraphrases onto the same construction.

**C — borrowed voice** (`systems/c-voice.mjs`). Harvests sentence openers from the 59 posts (439 sentences)
and hangs facts off them. Lowest similarity (0.37) and the closest style match (1.60) — and the worst
`frames` score (17%), because the openers are topic sentences from essays: "The synthesis:", "This Week in
Agents:", "The unsolved layer is controls:". Numerically the most "human", semantically the least usable.
The lesson is that voice lives in the frame, not the facts: a harvested opener has to be filtered for
stance and topic before it can be reused.

**D — hybrid** (`systems/d-hybrid.mjs`). B's construction choice with two to three realisations per
construction, plus B's anaphora. 100% fidelity, 0.49 similarity, 0.71 openers, 6.6 spread, follow-up works,
corpus 1.75. The only approach that scores well on both variety and discourse.

## What the baseline shows

Three of the four "what has he built" phrasings return the identical sentence; the fourth refuses. All four
"what is his email" phrasings return the same 24 characters (similarity 1.00), same for LinkedIn. Only one
of four post questions is answered — "how much has he written?" fell through to a refusal and, before
boaz 0.6.2, to "No project stack lists much." because the quantifier "much" was a searchable term.
"Both?" after a two-entity answer gets nothing.

That is the templated feel: not one bad sentence, but the same good sentence every time, and no memory of
what was just said.

## Recommendation

Ship D's shape: intent picks the construction, a hash picks the realisation, and a follow-up resolves to the
nouns already on screen. Use A's pool breadth inside each construction rather than as a replacement for it.
Treat C as a source of frames only — filtered for stance and topic, or curated by hand — since its raw
output is a non-sequitur generator with excellent style.

Deliberately not done here: writing the winner into `src/agent/knowledge.js`. The spike harness is the
deliverable; porting D into the rule composers is a separate change that has to keep `npm run audit:routing`
at 43/43.

## Caveats

24 probes is a smoke test, not a corpus study. `ttr` is length-sensitive (short answers score high).
`corpus` compares sentence statistics, not meaning. `frames` uses a hand-written whitelist. There is no
model in this loop by design — the judge is arithmetic, so it can tell you the answers stopped repeating and
cannot tell you they read well.
