# shobyde.com: design decisions

This is the decision record for the site's visual and editorial identity. When
`DESIGN.md` and the code disagree, treat the doc as the decision and the code as
an unfinished ticket, unless a section explicitly marks the doc as pending.

Values are never defined here. `src/styles/main.css` `:root` is the single source
of truth for tokens; this file says what they are for and what may not be done
with them.

Scope: the screen surface served at shobyde.com plus its print stylesheet. It
does not describe the blog content pipeline, which lives in
`resume-site-ops` and `shobyde-blog-editorial`.

## 1. Identity

**Dark editorial.** Near-black ground, light text, one accent family, mono
metadata. The page is a reading environment for a resume and an engineering
log, not a product marketing page. It should read like a technical journal set
on a dark stock.

- `--bg: #0b0b0f` is the ground, `--bg-elev: #12121a` the only raised panel.
- `--fg: #e8e8ee` is body ink. `--fg-dim` and `--fg-mute` are the two
  de-emphasis steps; `--fg-mute` is the contrast floor and must not be pushed
  darker without a measurement.
- Surfaces are translucent white at 3 percent (`--card`) and 6 percent on hover
  (`--card-hover`), with `--border` / `--border-strong` hairlines. Depth comes
  from those hairlines and blur, not from drop shadows.
- `--radius: 8px` for cards, panels and buttons. Tags, nav links and toggles are
  100px pills. Do not introduce a third radius.
- The nav is a fixed frosted pill: `rgba(18, 18, 26, 0.7)` plus 20px backdrop
  blur, centered at the top.

**The WebGL scene is atmosphere, never content.** `#bg3d` is a fixed,
`pointer-events: none`, `aria-hidden` canvas behind the `.site` layer. It
renders a star fly-through, ambient dust, drifting haze and a breathing accent
underfill. It carries no information, must never reduce copy contrast, and must
never become the thing a visitor notices before the headline. The correct level
is felt before it is studied: if a motif only resolves once you stop scrolling
and stare at it, that is working as intended.

**Mono is the label language.** JetBrains Mono in uppercase with wide tracking
marks metadata: section labels (`.eyebrow`), period stamps
(`.tl-item__period`), card meta (`.project-card__meta`), post dates
(`.post-card__date`), article meta, loader percentage, group titles
(`.skill-group__title`). Mono never sets body copy, never sets a headline, and
never appears at paragraph length.

**Print is a deliberate inversion.** `src/styles/print.css` remaps the tokens to
black on white, hides all screen chrome, and expands external URLs. The printed
resume is a light document by design. Do not carry the dark ground, accents, or
WebGL into print.

## 2. Typography

Canonical stack, as defined in `src/styles/main.css` (`:root`) and loaded in
`index.html`:

| Token | Family | Used for |
|---|---|---|
| `--font-head` | Space Grotesk (500/600/700) | `h1`-`h4`, card titles, display numerals (`.hero__headline`, `.section-title`, `.stat__num`, `.loader__name`, `.post-card__title`) |
| `--font-body` | Inter (400/500/600) | Body copy, paragraphs, and small UI chrome (nav links, buttons, tags, small controls) |
| `--font-mono` | JetBrains Mono (400/500) | Labels and metadata, per section 1 |

Rules:

- One display scale only. Headline `clamp(2.4rem, 7.5vw, 5.2rem)`, section
  titles `clamp(2rem, 5vw, 3.2rem)`, card titles around 1.05 to 1.35rem.
  New surfaces reuse these steps rather than inventing sizes.
- Measures are capped: `55ch` for section subtitles, `58ch` for hero support
  copy, `68ch` for article bodies. Long-form reading does not go wider.
- Body baseline is 16px at 1.6 line height. Article body is 1.05rem at 1.78.
- Space Grotesk headings carry `letter-spacing: -0.02em` (hero `-0.03em`). Do
  not add tracking to display type; tracking belongs to mono labels.
- Loaded with `media="print" onload="this.media='all'"` plus a `noscript`
  fallback so a slow font CDN cannot block first paint. The 2.5s boot cap in
  `src/main.js` is part of this contract, not an optimization detail.

**Superseded: the parchment stack.** Zilla Slab headings with Source Serif 4
body and the warm ink-on-paper theme are historical. They were replaced by the
dark editorial surface and are not an alternative direction. Do not reintroduce
Zilla Slab, Source Serif 4, sepia tokens, parchment grounds, coffee/water
stains, or a handwritten reveal as the site's identity without an explicit,
recorded direction change from Sho. Repo leftovers from that era
(`src/handwrite.js`, `src/styles/handwrite.css`, `src/stains.js`) are not
imported by `src/main.js` and are not part of the rendered surface. Leaving them
inert is correct until a ticket mounts them on purpose.

## 3. Color

| Token | Value | Role |
|---|---|---|
| `--accent` | `#7c6cff` | Interactive accent: hover borders, list markers, timeline thread, selection ground, primary button gradient start |
| `--accent2` | `#00d9b8` | Informational accent: labels, period stamps, meta rows, in-body links, the global focus ring, stat numerals |
| `--accent-dim` | `#3a2f8f` | Accent in a recessive role: active nav ground, gradient end stop, underline color |
| `--fg-mute` | `#858592` | Lowest text value that still clears 4.5:1 on `#0b0b0f` |

Usage rules:

- Accent colors are for type, rules, borders, and state. They are not
  decoration sprinkled on backgrounds.
- Teal (`--accent2`) is the informational accent: metadata and secondary links.
  Violet (`--accent`) is the interactive accent: hover and active state. A single
  element may use both only in a gradient (loader bar, progress bar, timeline
  thread).
- **No zero-offset colored halos.** A radial glow with no light direction is a
  generated-UI tell and it fights the typography. If an element needs emphasis,
  use a border color change, a background step, a real directional shadow, or a
  gradient rule. The former `--shadow-glow` and timeline halos were retired in
  the 2026-10-19 audit batch. Do not add a third.
- Gradients are two stops, or three where a rule fades out through `--border`
  (the timeline thread). No multi-stop color fills.
- Selection is `--accent` ground with `--bg` ink. Visible selection is an
  accessibility feature, so do not theme it quieter. Measured: `--bg` on
  `#7c6cff` is 5.09:1; white was 3.86:1 and failed AA at body size.

## 4. Motion

Motion has one job: show that the page is alive and where the reader is. It does
not perform.

Tokens and inventory:

- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` is the canonical curve. Use it for
  entrances, reveals, and panel expansion.
- `--ease-elastic` is defined but unused. It is not an approved default; using
  it requires a specific interaction that needs overshoot.
- Entrance: hero elements rise 14px and fade over 0.55s, staggered 0.05, 0.18,
  0.34, 0.5s, then stay at rest.
- Reveals: `.reveal` and `.tl-item` rise 24 to 40px and fade over 0.8s on
  `IntersectionObserver` entry. Hidden states are gated on the `js` class that
  `index.html` puts on `<html>`, so no-JS visitors never see blank content.
- Scroll: Lenis smooth scroll, a top reading-progress bar scaled by scroll
  fraction, and the hero support copy drifting and fading as the page moves.
- Pointer: magnetic offset on `.btn` (pointer devices only), card lift on hover,
  radial highlight following the pointer across `.post-card`.
- Data: stat numerals count up over 1.4s on first view.
- Text: per-character opacity stream on About paragraphs, section subtitles, and
  experience bullets.

Reduced-motion contract (`prefers-reduced-motion: reduce`). This is a designed
state, not a global kill:

- Off, at the JS level, so no work happens at all: WebGL scene (replaced by a
  static CSS gradient on `#bg3d`), Lenis, magnetic buttons, stream text (text
  renders at full opacity), stat counting (final value set immediately), pointer
  highlight, scroll-linked hero drift, and the handwriting sweep if a ticket ever
  mounts that module.
- Off, at the CSS level: entrance animations and scroll reveal transforms.
  Elements appear in their final position with no transition.
- **Preserved:** color, border-color, background, focus outline, selection,
  underline, and opacity-only state feedback. A hover or focus state must still
  be visible without motion. The blanket 0.01ms kill was replaced by targeted
  rules in the 2026-10-19 audit batch.
- The preference is read live through `src/motionPrefs.js` (a getter plus the
  `motionprefchange` event), never by sampling `matchMedia` once at boot. The
  WebGL module tears down and re-inits on a live toggle using a generation
  token and a single guarded listener; new animated subsystems follow that
  pattern.
- Every new animated element must gate itself on `motionPrefs`. A new animation
  with no reduced-motion path is not finished.

There is no custom cursor. The native pointer stays; a replacement overlay is
hostile to pointer-finder and keyboard users and was removed on purpose.

## 5. Copy rules

- **No em dashes in site copy** (U+2014). Use a colon, comma, period, or
  parentheses. The one exception is the hero tag's pre-existing dash between
  `SOFTWARE ENGINEER` and `PNW`, which is section chrome rather than prose.
  `src/data.js`, `src/main.js` visible strings, and `content/posts/` are all in
  scope. Grep the rendered DOM, not just the source, because the source and the
  rendered page have drifted before.
- First person, concrete, past tense for work done. Say what was built, for
  whom, and what it changed. No "passionate", no "leveraging", no "in today's
  fast-paced landscape".
- No AI cadence: avoid the "not X but Y" construction as a repeating rhythm,
  inflated emphasis ("truly", "genuinely", "powerful"), stacked metaphors, and
  certainty the evidence does not support. Shorter is better than balanced.
- No invented facts, metrics, employers, or outcomes. The resume data is a
  factual record and `src/data.js` says so at the top.
- Headings are claims, not labels. "Proof, not adjectives" and "Twelve years,
  one throughline: ship useful things" are the register. A heading that only
  names the section is a missed opportunity, but a heading that performs is
  worse.
- Privacy: name, email, and LinkedIn only. No phone number, street address, ZIP,
  or city-level placement of employers or schools. Coarse region is the limit.

## 6. Accessibility

Non-negotiable, checked on every change:

- **Tap targets 44x44 CSS px minimum.** This includes inline links that read as
  small text. Expand the hit area with padding or a pseudo-element rather than
  enlarging the glyph. Mobile nav pills already clear 44px in height at
  `max-width: 720px`; short labels and inline links still fall short
  horizontally (section 8).
- **AA contrast.** Body text at least 4.5:1, large text at least 3:1, against
  its actual backdrop including translucent cards. `--fg-dim` and `--fg-mute`
  clear 4.5:1 on `--bg` (5.75 and 5.4). Anything lighter does not, so do not
  invent a dimmer text token, and re-measure copy that sits over translucent
  cards or the WebGL scene.
- **Heading order.** One `h1` per page (the hero headline), `h2` per section,
  `h3` per item, `h4` inside detail panels. No skipped levels and no styled
  `div` standing in for a heading.
- **Every control has a name.** Icon-only controls need `aria-label`. The
  project detail toggle keeps `aria-expanded` and `aria-controls` in sync with
  its panel. Decorative layers (`#bg3d`, the progress bar) stay `aria-hidden`.
- **Focus is visible.** `:focus-visible` draws a 2px `--accent2` outline at 3px
  offset. Never remove it without an equally visible replacement. The skip link
  to `#main-content` is the first tab stop.
- **No-JS is a supported state.** Content must never be hidden behind a
  JS-only class, and the `noscript` block stays.
- **Motion** follows the contract in section 4.

## 7. Scaffolding

- **No numbered kickers above section headings.** A sequence number above every
  `h2` turns the page into a template and tells the reader nothing the scroll
  position already tells them. The heading carries the hierarchy.
- A mono label may still appear where it adds information the heading cannot
  carry (a date stamp, a category, a project status). It must not repeat the
  heading, must not be numbered, and must not sit above every section on the
  page. At that density it stops being navigation and becomes decoration.
- Section anatomy: optional label, `h2.section-title`, optional
  `p.section-sub`, then content. Section rhythm is
  `padding: clamp(5rem, 12vh, 9rem) 0` inside a 1200px container.
- Cards are containers, not decorations: one hairline, one background step, no
  nested card-in-card, no shadows beyond the hover lift.
- Anchor jumps use `scroll-margin-top: 5.5rem` so titles clear the floating nav.

## 8. Audit batch (2026-10-19)

The UI audit that prompted this document landed in full: the 27 rendered em
dashes were reduced to the hero-tag chrome only, numbered kickers were removed,
the type stack was canonicalized, reduced motion became a designed state, tap
targets reached 44x44, the zero-offset halos and unused motion tokens were
retired, and heading wraps were fixed. This section is the record of that batch;
new work inherits the rules above.

## 9. Changing this document

Open a ticket. A direction change (new theme, new type stack, new accent family)
is a decision for Sho, recorded here before code lands. A clarification or a
correction of something the code already does can land with the code in the same
change, provided both the doc and the implementation move together. Adding a new
deviation to section 8 requires a ticket id and an owner.
