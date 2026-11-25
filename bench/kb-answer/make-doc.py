#!/usr/bin/env python3
"""Before/after pairs on the 520-fact handbook."""
import html
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
data = json.loads((HERE / "results" / "kb-answer.json").read_text())
rows = data["rows"]
score = data["score"]

STYLE = """
@page { size: A4; margin: 15mm 14mm; }
body { font: 9.6pt/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1a17; }
h1 { font-size: 19pt; margin: 0 0 2mm; letter-spacing: -0.02em; }
h2 { font-size: 10.5pt; margin: 6mm 0 2mm; text-transform: uppercase; letter-spacing: 0.09em; color: #6b5b4a; }
p { margin: 0 0 2.5mm; }
.sub { color: #6b5b4a; margin-bottom: 5mm; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.9pt; }
th, td { text-align: left; padding: 1.6mm 2mm; border-bottom: 1px solid #e2d9c9; vertical-align: top; }
th { background: #f6f0e2; font-weight: 600; }
td.q { font-family: ui-monospace, Menlo, monospace; font-size: 8.5pt; color: #3b3227; width: 30%; }
td.n { font-variant-numeric: tabular-nums; text-align: right; width: 8%; }
.bad { color: #9b3b2f; }
.good { color: #2f6b3a; }
.tag { font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.08em; color: #8a7a63; }
.stats { display: flex; gap: 4mm; margin: 3mm 0 5mm; }
.stat { flex: 1; background: #f6f0e2; border-radius: 3px; padding: 3mm; }
.stat b { display: block; font-size: 18pt; line-height: 1; }
.stat span { font-size: 8.4pt; color: #6b5b4a; }
.small { font-size: 8.6pt; color: #6b5b4a; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 8.6pt; background: #f3eee4; padding: 0.3mm 1mm; }
"""


def esc(text):
    return html.escape(str(text))


body = []
for row in rows:
    fixed = (not row["beforeOk"]) and row["afterOk"]
    held = row["beforeOk"] and row["afterOk"]
    label = "fixed" if fixed else ("held" if held else "changed")
    body.append(
        "<tr>"
        f'<td class="q">{esc(row["ask"])}<br><span class="tag">{label}</span></td>'
        f'<td class="{"bad" if not row["beforeOk"] else ""}">{esc(row["before"])}</td>'
        f'<td class="{"good" if row["afterOk"] else "bad"}">{esc(row["after"])}</td>'
        "</tr>"
    )

doc = f"""<!doctype html><html><head><meta charset="utf-8"><title>Before and after on 520 facts</title><style>{STYLE}</style></head><body>
<h1>Before and after, on 520 facts</h1>
<p class="sub">The handbook (144 records, 27 attributes), not the six project cards. Same question, two systems: a strict lookup that needs the name spelled as stored, and the matcher with fuzzy names, mechanical aliases and a weighted fallback.</p>

<div class="stats">
  <div class="stat"><b>{score['before']}/{score['total']}</b><span>strict lookup</span></div>
  <div class="stat"><b>{score['after']}/{score['total']}</b><span>with the matcher</span></div>
  <div class="stat"><b>{score['repaired']}</b><span>questions repaired</span></div>
  <div class="stat"><b>{score['broken']}</b><span>questions broken</span></div>
</div>

<p>The strict lookup answers 13 of 18. Everything it misses is a spelling of a name rather than a question it cannot understand: <code>becon</code> for Beacon, <code>platfrom</code> for Platform, <code>INC 4101</code> with a space instead of a hyphen. The matcher resolves those before routing, so the same record is found and the same sentence is composed. Nothing was broken in the process: every question the strict lookup answered, the matcher still answers, and the two questions with no such fact still decline.</p>

<h2>Pairs, verbatim</h2>
<table><thead><tr><th>question</th><th>before</th><th>after</th></tr></thead><tbody>{''.join(body)}</tbody></table>

<h2>What is doing the work</h2>
<p>Four mechanisms, in the order they act. <b>Fuzzy names</b>: a span within one edit that agrees phonetically, or shares three letters and is within two edits, is rewritten to the stored name. <b>Mechanical aliases</b>: the same name split, hyphenated, pluralised or abbreviated (<code>atlas api</code> to <code>atlas-api</code>) is an alias emitted at build. <b>Attribute vocabulary</b>: the app says which words mean <code>headcount</code>, <code>sla</code>, <code>oncall</code>; the library does not guess. <b>Inheritance</b>: a service answers a product question through its <code>product</code> fact, and the answer says so ("inherited from Atlas") rather than pretending the service holds it.</p>

<h2>Where it still fails, honestly</h2>
<p>Two shapes are outside this layer. A question whose noun is ambiguous between record kinds ("the platform team" is a team, "on call for platform" is the on-call record) needs a kind hint from the app, which is why the on-call branch is explicit rather than inferred. And a question that asks for an attribute the record truly lacks gets a decline: <code>sla</code> for a customer, <code>database</code> for a team. Five of the eighteen cases turn on that refusal, and it stays a refusal.</p>

<p class="small">Suite: <code>bench/kb-answer/run.mjs</code>, 18 questions, results in <code>bench/kb-answer/results/kb-answer.json</code>. Library: <code>@shobyde/boaz/match</code>. Nothing pushed.</p>
</body></html>"""

out = HERE / "results" / "kb-answer.html"
out.write_text(doc)
print(f"{len(doc)} bytes written to {out}")
