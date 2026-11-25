"""Shared reading theme for generated post and archive pages.

The resume site is a cold working record: graphite canvas, ink, cobalt
interaction, one acid highlight, Archivo and IBM Plex Mono. These pages are
generated as standalone HTML, so the tokens live here and are mirrored in
src/styles/main.css.
"""

FONT_LINK = (
    '<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />'
)

BASE_CSS = """
:root {
  --canvas: #e9edf0;
  --canvas-2: #f3f5f6;
  --surface: #fbfcfc;
  --ink: #0b1220;
  --ink-2: #1b2635;
  --dim: #46515f;
  --mute: #5f6a76;
  --line: #c4ccd4;
  --line-strong: #8c97a3;
  --cobalt: #1b3cff;
  --cobalt-deep: #0d27c7;
  --acid: #e4ff3d;
  --acid-deep: #c6e600;
  --ink-bg: #0b1220;
  --ink-fg: #f4f6f7;
  --ink-dim: #a9b4c1;
  --display: 'Archivo', 'Arial Narrow', system-ui, sans-serif;
  --sans: 'Archivo', system-ui, -apple-system, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, monospace;
  --gutter: clamp(1.15rem, 4vw, 2.6rem);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { overflow-x: clip; scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  background-color: var(--canvas);
  background-image:
    linear-gradient(to right, rgba(11, 18, 32, 0.032) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(11, 18, 32, 0.032) 1px, transparent 1px);
  background-size: 64px 64px;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
::selection { background: var(--acid); color: var(--ink); }
:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 3px; }
a { color: inherit; }
img, svg { max-width: 100%; height: auto; }
button, input, select { font: inherit; color: inherit; }
.mono { font-family: var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
.mark { background: var(--acid); color: var(--ink); padding: 0 0.06em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.wrap { width: min(1120px, calc(100% - (var(--gutter) * 2))); margin: 0 auto; }
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1.5px solid var(--ink);
  margin-bottom: 2.2rem;
}
.back, .brand {
  font-family: var(--mono);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
}
.back { color: var(--dim); }
.back:hover { color: var(--cobalt); }
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--display);
  font-stretch: 125%;
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: -0.03em;
}
.brand::before {
  content: "SB";
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  background: var(--acid);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 0.54rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
h1, h2, h3, h4 {
  font-family: var(--display);
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 0.92;
  text-transform: uppercase;
}
.lede { max-width: 58ch; color: var(--dim); font-size: 1rem; line-height: 1.6; }
.tag {
  display: inline-block;
  border: 1px solid var(--line-strong);
  padding: 0.1rem 0.34rem 0.13rem;
  font-family: var(--mono);
  font-size: 0.54rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dim);
  line-height: 1.35;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0.55rem 0.85rem;
  border: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  font-family: var(--mono);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}
.btn:hover { background: var(--ink); color: var(--ink-fg); }
.footer {
  margin-top: 3rem;
  border-top: 1.5px solid var(--ink);
  padding: 1rem 0 2.5rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.6rem 1.2rem;
  font-family: var(--mono);
  font-size: 0.54rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mute);
}
.footer a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--cobalt); }
.footer a:hover { color: var(--cobalt); }
.prose { max-width: 68ch; font-size: 1.02rem; line-height: 1.75; color: var(--ink-2); }
.prose p { margin-bottom: 1rem; }
.prose h2 {
  font-size: clamp(1.4rem, 3vw, 2rem);
  line-height: 0.98;
  margin: 2rem 0 0.7rem;
  max-width: 26ch;
}
.prose h3 { font-size: 1.2rem; margin: 1.6rem 0 0.5rem; text-transform: none; letter-spacing: -0.02em; }
.prose ul, .prose ol { margin: 0 0 1rem 1.1rem; display: grid; gap: 0.35rem; }
.prose li { padding-left: 0.15rem; }
.prose li::marker { color: var(--cobalt); }
.prose strong { color: var(--ink); font-weight: 600; }
.prose em { font-style: italic; }
.prose a { color: var(--cobalt); text-decoration: none; border-bottom: 1px solid currentColor; }
.prose a:hover { color: var(--cobalt-deep); }
.prose code {
  font-family: var(--mono);
  font-size: 0.82em;
  color: var(--cobalt-deep);
  background: var(--canvas-2);
  border: 1px solid var(--line);
  padding: 0.05em 0.3em;
}
.prose pre {
  background: var(--ink-bg);
  color: var(--ink-fg);
  border: 1px solid var(--ink);
  padding: 0.85rem 0.95rem;
  overflow-x: auto;
  margin: 1.1rem 0;
  font-family: var(--mono);
  font-size: 0.72rem;
  line-height: 1.65;
}
.prose pre code { background: none; border: 0; color: inherit; padding: 0; font-size: inherit; }
.prose img { border: 1px solid var(--line); margin: 1rem 0; }
.prose blockquote {
  margin: 1.2rem 0;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
}
@media (max-width: 620px) {
  body { font-size: 16px; }
  .top { margin-bottom: 1.6rem; }
  .footer { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
"""


def head(title, description, canonical, extra_css="", extra_head=""):
    """One head block, so every generated page carries the same identity."""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title}</title>
<meta name="description" content="{description}" />
<link rel="canonical" href="{canonical}" />
<meta name="theme-color" content="#e9edf0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
{FONT_LINK}
{extra_head}
<style>{BASE_CSS}{extra_css}</style>
</head>"""
