#!/usr/bin/env python3
"""Renders the before/after report as print HTML (then Chromium makes the PDF)."""
import html
import json
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
nat = json.loads((HERE / "results" / "naturalness.json").read_text())
jud = json.loads((HERE / "results" / "judged.json").read_text())
s = nat["summary"]
esc = lambda value: html.escape(str(value))  # noqa: E731

single_mean = round(sum(r["score"] for r in jud["single"]) / len(jud["single"]), 2)

rows = "\n".join(
    "<tr>"
    f"<td class='q'>{esc(row['question'])}</td>"
    f"<td class='n'>{row['sentencesBefore']}</td>"
    f"<td class='n'>{row['sentencesAfter']}</td>"
    f"<td class='n'>{row['fleschBefore']} → {row['fleschAfter']}</td>"
    f"<td class='n'>{row['lmBefore']} → {row['lmAfter']}</td>"
    f"<td class='n'>{len(row['lostFacts'])}</td>"
    "</tr>"
    for row in nat["results"]
)

judge_rows = "\n".join(
    "<tr>"
    f"<td class='q'>{esc(row['question'])}</td>"
    f"<td class='n'>{row['before']}</td>"
    f"<td class='n'>{row['after']}</td>"
    f"<td>{esc(row['why'])}</td>"
    "</tr>"
    for row in jud["cases"]
)

DOC = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>boaz naturalness spike: before and after</title>
<style>
  @page {{ size: letter; margin: 16mm 15mm 16mm 15mm; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: "Inter", "Helvetica Neue", Arial, sans-serif; color: #16161c; font-size: 9.6pt; line-height: 1.45; }}
  h1 {{ font-size: 23pt; line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 4pt; }}
  h2 {{ font-size: 12.5pt; margin: 16pt 0 5pt; letter-spacing: -0.01em; border-top: 0.6pt solid #d8d8de; padding-top: 7pt; }}
  .kicker {{ font-family: "JetBrains Mono", monospace; font-size: 7.6pt; letter-spacing: 0.16em; text-transform: uppercase; color: #6c5ce7; margin: 0 0 6pt; }}
  .verdict {{ background: #f6f4ff; border-left: 3pt solid #6c5ce7; padding: 8pt 10pt; margin: 10pt 0 2pt; }}
  .verdict b {{ color: #4b3fd6; }}
  .meta {{ font-family: "JetBrains Mono", monospace; font-size: 7.4pt; color: #6f6f7e; margin: 6pt 0 0; }}
  p {{ margin: 0 0 6pt; }}
  table {{ width: 100%; border-collapse: collapse; margin: 6pt 0 8pt; font-size: 8.2pt; }}
  th {{ text-align: left; font-family: "JetBrains Mono", monospace; font-size: 6.8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6f6f7e; border-bottom: 0.7pt solid #b9b9c6; padding: 3pt 3pt; }}
  td {{ border-bottom: 0.4pt solid #e6e6ec; padding: 2.6pt 3pt; vertical-align: top; }}
  td.n {{ white-space: nowrap; font-variant-numeric: tabular-nums; }}
  td.q {{ width: 34%; }}
  .small {{ font-size: 8.4pt; color: #4a4a56; }}
  code {{ font-family: "JetBrains Mono", monospace; font-size: 8pt; background: #f2f2f6; padding: 0.4pt 2.4pt; border-radius: 2pt; }}
  ul {{ margin: 2pt 0 6pt 12pt; padding: 0; }}
  li {{ margin-bottom: 2pt; }}
  .footer {{ margin-top: 12pt; border-top: 0.6pt solid #d8d8de; padding-top: 6pt; font-family: "JetBrains Mono", monospace; font-size: 7pt; color: #6f6f7e; }}
</style></head>
<body>
  <p class="kicker">boaz · naturalness spike · not shipped</p>
  <h1>Can an autocomplete signal rewrite answers better than the panel already writes them?</h1>
  <p class="meta">{datetime.now().strftime('%Y-%m-%d %H:%M')} · boaz 0.8.5 · 16 library tests · 13 answers · blind judge</p>

  <div class="verdict">
    <b>Verdict: no.</b> The rewriter joins sentences correctly, keeps every fact, and the judge prefers the
    original in <b>{jud['preferBefore']} of {len(jud['cases'])}</b> rewritten cases
    ({jud['before']}/5 → {jud['after']}/5 on naturalness). The mechanism is tested and kept out of the release.
  </div>

  <h2>1. What was built</h2>
  <p>A new library entry point, <code>boaz/text</code>, with no model file and no network: a bigram model over the
  host's own prose, plus the one rewrite it enables. It cannot add a fact; it can only choose among wording that
  carries the facts already present.</p>
  <table>
    <tr><th>API</th><th>What it does</th></tr>
    <tr><td><code>createNgramModel(texts)</code></td><td>Counts transitions over the corpus. <code>score()</code> is mean log-probability per transition; <code>rank()</code> and <code>choose()</code> order candidates.</td></tr>
    <tr><td><code>mergeClauses(a, b)</code></td><td>Joins two label or copula sentences into one; refuses shapes it cannot parse.</td></tr>
    <tr><td><code>mergePronounClause(a, b)</code></td><td>Joins a pronoun-led sentence to the one before it, in participial or semicolon form.</td></tr>
    <tr><td><code>reflowSentences(text, model)</code></td><td>Walks an answer, joins where a pronoun allows it, chooses a form by score.</td></tr>
    <tr><td><code>observedConnectives(model)</code></td><td>Reports the connective the corpus prefers rather than inventing one.</td></tr>
  </table>
  <p class="small">Tests: 16 passing, including determinism, corpus-vs-invented ranking, punctuation as tokens, both
  join shapes, refusals for unparsed shapes, both reflow styles, and a word-preservation check.
  Run: <code>npx vitest run test/ngram.test.ts</code>.</p>

  <h2>2. Method</h2>
  <p>Corpus: <b>{s['corpusSentences']}</b> sentences, <b>{s['vocabulary']}</b> tokens, taken from the site's posts and
  the project cards' own copy. Cases: 13 questions answered by the real engine, unmodified. For each answer the
  harness generates rewrite candidates in both styles, discards any candidate that loses a number, a quoted string or
  a capitalised name, and keeps the best-scoring survivor. Flesch reading ease and the n-gram score are mechanical;
  the third measure is a blind judge ({esc(jud['model'])}), which sees both answers in randomised order.</p>

  <h2>3. Before and after, per answer</h2>
  <table>
    <tr><th>Question</th><th>Sent. before</th><th>Sent. after</th><th>Flesch</th><th>LM score</th><th>Facts lost</th></tr>
    {rows}
  </table>
  <p class="small">{s['mergedCases']} of {s['cases']} answers had a joinable pair. Mean sentences
  {s['sentencesMeanBefore']} → {s['sentencesMeanAfter']}; Flesch {s['fleschMeanBefore']} → {s['fleschMeanAfter']};
  LM score {s['lmMeanBefore']} → {s['lmMeanAfter']}; facts lost {s['lostFacts']}. On the joined subset only:
  Flesch {s['mergedOnly']['fleschBefore']} → {s['mergedOnly']['fleschAfter']}, LM {s['mergedOnly']['lmBefore']} →
  {s['mergedOnly']['lmAfter']}.</p>

  <h2>4. The judge</h2>
  <p>Original scored <b>{jud['before']}/5</b>, rewrite <b>{jud['after']}/5</b>; preferred the original
  <b>{jud['preferBefore']}</b> times, the rewrite {jud['preferAfter']}, ties {jud['ties']}. Reasons, verbatim:</p>
  <table>
    <tr><th>Question</th><th>Before</th><th>After</th><th>Judge's reason</th></tr>
    {judge_rows}
  </table>
  <p class="small">Example. Before: “Hobnob: Meeting note-takers ship your conversations to someone else's server.
  It runs on Whisper (large-v3-turbo), Local GGUF LLMs, Live captions.” After: “… server, running on Whisper
  (large-v3-turbo), Local GGUF LLMs, Live captions.” The judge called the second a dangling modifier.</p>

  <h2>5. Does the model's taste track the judge?</h2>
  <p>Each answer was also scored alone (mean {single_mean}/5). The correlation between the n-gram score and judged
  naturalness is <b>{jud['correlationLmNaturalness']}</b>; Flesch against the judge is
  <b>{jud['correlationFleschNaturalness']}</b>. With 13 cases neither is a stable estimate, and the first one's sign
  is the wrong way: the more corpus-like an answer scored, the less natural the judge found it. The model is
  measuring topical familiarity, not prose quality.</p>

  <h2>6. Decision</h2>
  <p><b>Do not ship the rewriter.</b> Joining shortens the answer and keeps every fact, and still reads worse,
  because the panel's sentences already arrive with their own boundaries. The module stays in the spike tree,
  unshipped and tested, so the next version of this question starts from evidence instead of a hunch.</p>
  <p>What would change the verdict: a corpus an order of magnitude larger and in the panel's register rather than the
  blog's; ranking the realisations the phrasing layer already generates for one question, instead of joining finished
  sentences; or a build-time judge ordering candidates, where the model must be consistent rather than right.</p>

  <h2>7. Reproduce</h2>
  <p><code>node bench/naturalness/run.mjs</code> · <code>python3 bench/naturalness/judge.py</code> ·
  <code>npx vitest run test/ngram.test.ts</code>. Raw data: <code>bench/naturalness/results/naturalness.json</code>,
  <code>judged.json</code>. Nothing in this spike is pushed.</p>

  <p class="footer">Prepared for Sho Byde · measurements from the site's own engine and corpus · judge:
  {esc(jud['model'])}</p>
</body></html>"""

(HERE / "results" / "report.html").write_text(DOC)
print("html written", len(DOC))
