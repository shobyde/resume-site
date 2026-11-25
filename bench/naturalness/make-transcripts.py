#!/usr/bin/env python3
"""Full transcripts for the naturalness spike: every question, both answers, verbatim."""
import html
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
nat = json.loads((HERE / "results" / "naturalness.json").read_text())
jud = json.loads((HERE / "results" / "judged.json").read_text())
verdicts = {row["question"]: row for row in jud["cases"]}
esc = lambda value: html.escape(str(value))  # noqa: E731


def words(text):
    return len(text.split())


def avg_sentence(text):
    sentences = max(1, len([s for s in text.replace("!", ".").replace("?", ".").split(". ") if s.strip()]))
    return round(words(text) / sentences, 1)


blocks = []
for index, row in enumerate(nat["results"], 1):
    judge = verdicts.get(row["question"])
    changed = row["merged"]
    badge = (
        f'<span class="badge changed">rewritten</span>' if changed else '<span class="badge kept">unchanged, nothing to join</span>'
    )
    judge_line = (
        f'<p class="judge">Judge: before {judge["before"]}/5, after {judge["after"]}/5, preferred '
        f'<b>{judge["prefer"]}</b>. “{esc(judge["why"])}”</p>'
        if judge
        else ""
    )
    after_block = (
        f'<div class="answer after"><p class="label">After</p><p>{esc(row["after"])}</p>'
        f'<p class="m"> {words(row["after"])} words · {row["sentencesAfter"]} sentences · {avg_sentence(row["after"])} words/sentence · Flesch {row["fleschAfter"]}</p></div>'
        f'<div class="answer before"><p class="label">Before</p><p>{esc(row["before"])}</p>'
        f'<p class="m"> {words(row["before"])} words · {row["sentencesBefore"]} sentences · {avg_sentence(row["before"])} words/sentence · Flesch {row["fleschBefore"]}</p></div>'
        if changed
        else f'<div class="answer before"><p class="label">Answer</p><p>{esc(row["before"])}</p>'
        f'<p class="m"> {words(row["before"])} words · {row["sentencesBefore"]} sentences · {avg_sentence(row["before"])} words/sentence · Flesch {row["fleschBefore"]}</p></div>'
    )
    blocks.append(
        f'<section class="case">'
        f'<div class="head"><span class="num">{index:02d}</span><h2>{esc(row["question"])}</h2>{badge}</div>'
        f'{after_block}{judge_line}'
        f'</section>'
    )

DOC = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>boaz naturalness: full before and after</title>
<style>
  @page {{ size: letter; margin: 15mm 15mm 15mm 15mm; }}
  body {{ margin: 0; font-family: "Inter", "Helvetica Neue", Arial, sans-serif; color: #17171d; font-size: 9.6pt; line-height: 1.5; }}
  .kicker {{ font-family: "JetBrains Mono", monospace; font-size: 7.4pt; letter-spacing: 0.16em; text-transform: uppercase; color: #6c5ce7; margin: 0 0 5pt; }}
  h1 {{ font-size: 20pt; line-height: 1.08; letter-spacing: -0.02em; margin: 0 0 6pt; }}
  .lede {{ color: #3d3d49; margin: 0 0 6pt; max-width: 62ch; }}
  .how {{ background: #f6f4ff; border-left: 3pt solid #6c5ce7; padding: 7pt 9pt; margin: 8pt 0 4pt; font-size: 8.8pt; }}
  .case {{ break-inside: avoid; border-top: 0.6pt solid #dcdce4; padding-top: 7pt; margin-top: 11pt; }}
  .head {{ display: flex; align-items: baseline; gap: 7pt; margin-bottom: 5pt; }}
  .num {{ font-family: "JetBrains Mono", monospace; font-size: 8pt; color: #8a8a99; }}
  h2 {{ font-size: 11.4pt; margin: 0; letter-spacing: -0.01em; flex: 1; }}
  .badge {{ font-family: "JetBrains Mono", monospace; font-size: 6.6pt; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 3pt; padding: 1.5pt 4pt; }}
  .badge.changed {{ background: #efeaff; color: #5240d6; }}
  .badge.kept {{ background: #f0f0f4; color: #6c6c7c; }}
  .answer {{ margin: 3pt 0; padding-left: 7pt; border-left: 2pt solid #d9d9e2; }}
  .answer.after {{ border-left-color: #6c5ce7; }}
  .answer .label {{ font-family: "JetBrains Mono", monospace; font-size: 6.6pt; letter-spacing: 0.12em; text-transform: uppercase; color: #7a7a8a; margin: 0 0 1pt; }}
  .answer p {{ margin: 0; }}
  .answer .m {{ font-family: "JetBrains Mono", monospace; font-size: 7pt; color: #7a7a8a; margin-top: 1pt; }}
  .judge {{ font-size: 8.2pt; color: #4a4a58; margin: 4pt 0 0; }}
  .footer {{ margin-top: 14pt; border-top: 0.6pt solid #dcdce4; padding-top: 6pt; font-family: "JetBrains Mono", monospace; font-size: 7pt; color: #6f6f7e; }}
</style></head><body>
<p class="kicker">boaz · naturalness spike · full transcripts</p>
<h1>Every question, both answers, exactly as the engine produced them</h1>
<p class="lede">Thirteen questions asked of the real site engine. “After” is the same answer with a pronoun-led sentence folded
into the one before it, using the participial form the n-gram model chose. Nine answers had no joinable pair and are shown once.</p>
<div class="how"><b>What to look for.</b> In the rewritten answers the participle attaches to the nearest noun, not to the
project: “<i>… someone else's server, running on Whisper</i>” reads as if the server runs on Whisper. That is the defect the
blind judge named, and it is the reason nothing shipped.</div>
{''.join(blocks)}
<p class="footer">Judge: {esc(jud['model'])} · preferred the original {jud['preferBefore']} times, the rewrite {jud['preferAfter']}, {jud['ties']} ties ·
Flesch is a mechanical score: higher is easier. The email answer scores below zero because it is one very short sentence
containing a long address, which the syllable counter reads as many syllables per sentence.</p>
</body></html>"""

(HERE / "results" / "transcripts.html").write_text(DOC)
print("transcripts written", len(DOC))
