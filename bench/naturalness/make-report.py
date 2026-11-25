#!/usr/bin/env python3
"""Builds the before/after report spec from the measured files."""
import json
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
nat = json.loads((HERE / "results" / "naturalness.json").read_text())
jud = json.loads((HERE / "results" / "judged.json").read_text())
s = nat["summary"]

elements = [
    {"type": "heading", "level": 1, "text": "Naturalness spike: an n-gram rewriter"},
    {"type": "heading", "level": 2, "text": "Before and after, with tests. Verdict: do not ship."},
    {"type": "paragraph", "text": (
        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} · boaz 0.8.5 (@shobyde/boaz) · "
        "spike branch, nothing pushed. The mechanism is a bigram model over the site's own prose, used to "
        "join two sentences that already carry the facts. It is tested, it preserves every fact, and the "
        "judge says it reads worse. This document records the numbers behind that sentence."
    )},

    {"type": "heading", "level": 2, "text": "1. What was built"},
    {"type": "paragraph", "text": (
        "A new library entry point, boaz/text, with no model file and no network:"
    )},
    {"type": "table", "header": ["API", "What it does"], "rows": [
        ["createNgramModel(texts)", "Counts bigram transitions over the host's prose; score(text) is the mean log-probability per transition, rank() and choose() order candidates, perplexity() is derived."],
        ["mergeClauses(a, b)", "Joins two label or copula sentences into one, refusing any shape it does not recognise."],
        ["mergePronounClause(a, b)", "Joins a pronoun-led sentence to the one before it, in participial or semicolon form."],
        ["reflowSentences(text, model)", "Walks an answer and applies the pronoun join, choosing a form by score."],
        ["observedConnectives(model)", "Reports which connective the corpus actually prefers, instead of inventing one."],
    ]},
    {"type": "paragraph", "text": (
        "Test suite: 16 tests, all passing (scoring determinism, corpus-vs-invented ranking, punctuation as tokens, "
        "label joins, copula joins, refusals, both reflow styles, and a word-preservation check). "
        "Command: npx vitest run test/ngram.test.ts."
    )},

    {"type": "heading", "level": 2, "text": "2. Method"},
    {"type": "paragraph", "text": (
        f"Corpus: {s['corpusSentences']} sentences and {s['vocabulary']} tokens taken from the site's posts and the "
        "project cards' own copy. Cases: 13 questions answered by the real engine, unmodified. "
        "For each answer the harness generates rewrite candidates, discards any candidate that loses a number, "
        "quoted string or capitalised name, and keeps the best-scoring survivor. "
        "Two measurements are mechanical (Flesch reading ease, mean n-gram log-probability); the third is a blind "
        f"judge ({jud['model']}): two answers, order randomised per case, 'which reads more like a person wrote it'."
    )},

    {"type": "heading", "level": 2, "text": "3. Before and after, per answer"},
    {"type": "table",
     "header": ["Question", "Sent. before", "Sent. after", "Flesch", "LM score", "Facts lost"],
     "rows": [
         [row["question"],
          str(row["sentencesBefore"]),
          str(row["sentencesAfter"]),
          f"{row['fleschBefore']} → {row['fleschAfter']}",
          f"{row['lmBefore']} → {row['lmAfter']}",
          str(len(row["lostFacts"]))]
         for row in nat["results"]
     ]},
    {"type": "paragraph", "text": (
        f"Totals: {s['mergedCases']} of {s['cases']} answers had a joinable pair; mean sentence count "
        f"{s['sentencesMeanBefore']} → {s['sentencesMeanAfter']}; mean Flesch {s['fleschMeanBefore']} → "
        f"{s['fleschMeanAfter']}; mean LM score {s['lmMeanBefore']} → {s['lmMeanAfter']}; facts lost "
        f"{s['lostFacts']}. On the joined subset only: Flesch {s['mergedOnly']['fleschBefore']} → "
        f"{s['mergedOnly']['fleschAfter']}, LM {s['mergedOnly']['lmBefore']} → {s['mergedOnly']['lmAfter']}."
    )},

    {"type": "heading", "level": 2, "text": "4. The judge"},
    {"type": "paragraph", "text": (
        f"Across the {len(jud['cases'])} rewritten answers the judge scored the original {jud['before']}/5 and the "
        f"rewrite {jud['after']}/5, and preferred the original {jud['preferBefore']} times, the rewrite "
        f"{jud['preferAfter']}, with {jud['ties']} ties. Its reasons, verbatim:"
    )},
    {"type": "table", "header": ["Question", "Before", "After", "Judge's reason"], "rows": [
        [row["question"], str(row["before"]), str(row["after"]), row["why"]] for row in jud["cases"]
    ]},
    {"type": "paragraph", "text": (
        "Representative rewrite, compare hobnob and readback. Before: “Hobnob: Meeting note-takers ship your "
        "conversations to someone else's server. It runs on Whisper (large-v3-turbo), Local GGUF LLMs, Live "
        "captions.” After: “… server, running on Whisper (large-v3-turbo), Local GGUF LLMs, Live captions.” "
        "The judge called the second one a dangling modifier and preferred the two sentences."
    )},

    {"type": "heading", "level": 2, "text": "5. Does the model's taste track the judge?"},
    {"type": "paragraph", "text": (
        f"Each of the {len(jud['single'])} answers was also scored alone by the judge (mean {round(sum(r['score'] for r in jud['single'])/len(jud['single']), 2)}/5). "
        f"The correlation between the n-gram score and judged naturalness is {jud['correlationLmNaturalness']} "
        f"(Flesch: {jud['correlationFleschNaturalness']}). With 13 cases that is not a stable estimate, and its sign "
        "is the wrong one: the more corpus-like an answer scored, the less natural the judge found it. The model "
        "is measuring topical familiarity, not prose quality."
    )},

    {"type": "heading", "level": 2, "text": "6. Decision"},
    {"type": "paragraph", "text": (
        "Do not ship the rewriter. It is not a bug: joining two sentences shortens the answer and keeps every "
        "fact, and still reads worse, because the panel's answers already carry their own clause boundaries. "
        "The mechanism stays in the spike tree, unshipped and tested, because it is the cheapest way to answer "
        "the next question (does any auto-regressive signal help?) without pretending the answer was yes."
    )},
    {"type": "paragraph", "text": (
        "What would change the verdict: (a) a corpus ten times larger with the register the panel actually "
        "writes in, not the blog's; (b) ranking candidate realisations that the phrasing layer already "
        "generates for the same question, instead of joining finished sentences; (c) a judge-in-the-loop "
        "ordering step at build time, where the model only has to be consistent, not right."
    )},

    {"type": "heading", "level": 2, "text": "7. Reproduce"},
    {"type": "paragraph", "text": (
        "node bench/naturalness/run.mjs · python3 bench/naturalness/judge.py · "
        "npx vitest run test/ngram.test.ts (in packages/boaz). "
        "Raw data: bench/naturalness/results/naturalness.json and judged.json."
    )},
]

spec = {
    "title": "boaz naturalness spike: before and after",
    "author": "Hermes, for Sho Byde",
    "elements": elements,
}
(HERE / "results" / "report-spec.json").write_text(json.dumps(spec, indent=2))
print("spec written:", len(elements), "elements")
