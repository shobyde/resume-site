# shobyde.com: design decisions

This is the decision record for the site's visual and editorial identity. When
this document and the code disagree, treat the document as the decision and the
code as an unfinished ticket, unless a section explicitly marks the doc as
pending.

Values are defined in `src/styles/main.css` `:root`. The generated reading pages
mirror those tokens in `scripts/reading_theme.py`; change both together.

## 1. Identity

**Working record / cold blueprint.** The site is a technical record with an ink
navigation rail, a graphite canvas, expanded grotesque display type, cobalt as
the interaction signal, and one acid highlight. It is not an essay on paper and
not a product landing page. The rail stays put; the record scrolls beside it.

The previous warm-paper and serif direction is retired. Do not reintroduce cream
grounds, terracotta accents, serif display faces, drop caps, paper grain, or
soft "editorial" cards. That register reads as a generic generated site and it
fights the engineering record.

**The conversation is a separate room.** The home page is the static record.
`/thread/` is the conversation surface: a real thread with typed text, tool,
and surface events, a visible trace, and follow-up suggestions. `/boaz/` is the
live console for the same engine. The home page has a starter dock at the
bottom; it submits to `/thread/?q=` and never answers in place. The rail Ask
control is the same route. No overlay, no page rewrite, no floating chat
bubble, no glass panel, no avatar.

**Labs are separate exhibits.** `/labs/ledger`, `/labs/rota` and
`/labs/runbook` carry their own colour worlds on purpose. The labs index and the
`/boaz/` product page follow the tokens here so the front door and the product
story match; the exhibits are allowed to be their own rooms.

## 2. The record is static

The front page is a prerendered record, not a Boaz surface. It does not
recompose around a question. Every section is in the initial HTML, so SEO and
no-JS visitors get the same work, history, stack, log, and contact record.

- `/thread/` owns the conversation. It uses `createConversation` from
  `@shobyde/boaz/conversation` and renders the typed stream.
- `pageIntent()` still maps a question to the thread's work, history, stack,
  log, contact, profile, and register components. It no longer rewrites the
  home page.
- `page.compose` remains a declared capability and the register viewer still
  exposes the page surface stream, but no home route calls it. The static HTML
  is the page.
- The hero is a single column: statement, lede, actions, note, and the data
  strip. There is no assistant console beside it.
- The print stylesheet prints the full record from any page.

## 3. Layout

- Desktop: a fixed ink rail `236px` wide and content to its right. The rail
  holds the brand, section index, current role/base/last-filed status, and an
  Ask link to `/thread/`. A vertical acid line on its right edge is the reading
  progress.
- Tablet and phone: the rail becomes a compact top strip with the brand and a
  horizontally scrollable index. The Ask link is hidden; the Thread link in the
  index is the route.
- Hero: a single column. The statement, lede, actions, note, and data strip are
  the record. The home starter dock sits at the bottom and starts a thread.
- `/thread/`: the same dock gets the conversation input. The home version only
  navigates; it does not stream an answer into the page.
- Sections vary deliberately. Profile is prose plus a key-value record. Work is
  a dense index with one featured row and expandable architecture rows. The
  register is a dark full-bleed band with a live surface viewer. History is a
  career chart followed by role records. Stack is a spec table. Log is a cobalt
  lead plus an index table. Contact is an acid band.
- Do not repeat the same three-card grid. Do not put a fake "SECTION 01" above a
  heading. Real labels (`Profile`, `Work`, `Register`, `History`, `Stack`, `Log`,
  `Contact`) are navigation; they stay.

## 4. Typography

| Token | Family | Role |
|---|---|---|
| `--display` | Archivo variable, width 125, weight 800 | h1, section titles, project titles, role titles |
| `--sans` | Archivo variable, width 100, weight 400/600 | body copy, summaries, forms |
| `--mono` | IBM Plex Mono | labels, dates, metadata, code, manifest rows |

- Display type is uppercase, tight (`letter-spacing: -0.045em` to `-0.055em`),
  and short-measure (`13ch` to `24ch`). It is a poster voice, not body copy.
- Body measure stays at 48ch to 68ch. Body is 17px at 1.6, article body 1.02rem
  at 1.75.
- `code.mono` keeps its original case. Package names are not headings.
- No em dashes or en dashes in interface copy. Use a period, comma, colon, or a
  hyphen for a date range. Blog prose is editorial content and is not rewritten
  by the theme.

## 5. Color

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#e9edf0` | page ground |
| `--surface` | `#fbfcfc` | raised plate, hover ground |
| `--ink` | `#0b1220` | body ink, the rail |
| `--dim` | `#46515f` | secondary copy |
| `--mute` | `#5f6a76` | metadata floor, 4.68:1 on canvas |
| `--cobalt` | `#1b3cff` | interaction, links, active state, the log lead |
| `--acid` | `#e4ff3d` | one highlight per view, manifest IDs, contact band |
| `--line` | `#c4ccd4` | hairlines and table rules |

Rules:

- Cobalt is for interaction and structure. Section-title emphasis is cobalt, not
  a highlighter. Acid is for one thing at a time: the hero phrase, the Ask
  control, the register headline, the profile pull quote, and the contact band.
  If acid is on every section, it stops being a signal.
- No gradients, glows, glass, or colored halos. The only pattern is the faint
  64px blueprint grid on the canvas.
- The dark register is a band, not a second theme. Its surfaces use the same
  cobalt and acid as the light page; its headline keeps the acid mark because
  cobalt would disappear on ink.
- Never put a colored border on one side of a callout or card. Use a full
  hairline, a background step, or a label.
- Contrast is measured by `python3 scripts/contrast-check.py`. Do not add a
  dimmer text token without measuring it.

## 6. Components

- **Buttons** are rectangular, 46px tall, mono uppercase, one hairline. Primary
  is ink; hover is cobalt. Destructive actions are not present on this site.
- **Tags** are rectangular hairlines, 0.5rem mono. No pills.
- **Tables** are the default composition for lists of facts: work, stack, log,
  archive, manifest. A row is a line, not a card. Hover is a surface step.
- **The composer** is the bottom dock. On `/`, five starter questions and a
  free-text input navigate to `/thread/?q=`. On `/thread/`, the same input runs
  the conversation. Both never open a dialog.
- **The thread answer** is a message: the question, a live tool card when a
  tool runs, the answer text, any A2UI surface, and the component for the
  subject. It streams typed events and keeps the trace separate from the
  sentence.
- **The work result band** belongs to the thread's work component when a filter
  is applied. The home work index is the full record and has no result band.
- **The surface viewer** in the register remains the page's one A2UI viewer.
- **The surface viewer** in the register is one panel with four tabs
  (`project_card`, `contact`, `newest_article`, `page`), a light stage, and a
  collapsible JSON stream. The `page` tab shows the current `SitePage` surface
  stream. Do not turn it into three identical cards.
- **The career chart** is data, not decoration: four bars on a 2012 to 2026
  scale, cobalt for current, acid for the teaching year, ink for earlier roles.

## 7. Motion

- One purpose: show entry and position. Scroll reveals are 8px rise plus fade,
  500ms, and are gated on `html.js`.
- The rail progress line is the only continuous motion. It is a transform on a
  2px acid rule.
- No hero entrance choreography, no magnetic buttons, no animated counters, no
  WebGL scene, no Lenis.
- `prefers-reduced-motion` removes transforms and transitions; opacity states
  remain. Every new animated element needs a reduced-motion path.

## 8. Accessibility

- Contrast: body, dim and mute all clear 4.5:1 on canvas and surface. Cobalt
  clears 4.5:1 on canvas and surface. Ink on acid clears 4.5:1.
- Target size: rail links 44px, buttons 46px, toggles and tabs at least 32px,
  chips at least 32px.
- Focus: 2px cobalt outline at 3px offset. Never remove it.
- Headings: one `h1` per page, `h2` per section, `h3` per item, `h4` inside
  expanded architecture notes.
- The rail is a `nav` with `aria-current` on the active section. The Assistant is
  a dialog with `aria-modal`, a focus trap, Escape to close, and Cmd/Ctrl+K to
  open.
- No-JS: the resume content is in the data module; the noscript block links to
  email and LinkedIn. The hero and sections are not hidden behind JS classes.

## 9. Generated reading pages

`scripts/reading_theme.py` owns the shared tokens, top bar and prose rules for
`/posts/<slug>/` and `/archive/`. `scripts/gen_seo_pages.py` and
`scripts/gen_archive.py` add only page-specific layout. Regenerate both after a
theme change:

```bash
python3 scripts/gen_seo_pages.py
python3 scripts/gen_archive.py
```

The archive's calendar uses cobalt steps with acid for the busiest day. The post
page keeps a 68ch measure and a single article column; it does not get the rail.

## 10. Changing this document

A direction change (new type stack, new ground, new accent family) is a decision
for Sho and lands here before code. A clarification that matches the code can
land together with it. The anti-slop rules are inherited from the UX/UI agent
skills doctrine: no default warm-editorial serif pages, no symmetrical card
grids, no fake section numbers, no emoji, no decorative side borders, no
invisible microcopy.
