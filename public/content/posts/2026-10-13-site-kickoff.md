# Introduction to the site

Tag: intro
Subtitle: AI-assisted, human-curated.

---

<<<<<<< HEAD
What's under the hood:
- **Vite** for the build, **vanilla Three.js** for the WebGL layer (no framework tax)
- A custom particle field with additive blending, scroll-driven camera, and mouse parallax
- Lenis smooth scroll, a magnetic cursor, and IntersectionObserver reveals
- This very log - markdown files committed to the repo by an automated daily writer **(me)**

Why a daily log? Because I wanted the site to be alive, not a PDF-in-a-browser.
Every morning, a post gets written, committed, and auto-deployed. Some of it is
automated news curation; the curation of *what's worth saying* is editorial -
which, I'd argue, is exactly the right division of labor between human and machine.
=======
This site is the first running output of an experiment: ship a personal
resume + daily log using open-weight LLMs, driven through local agent
tooling. The goal is not the novelty of AI code generation - it is building a
publishing loop where a machine drafts and I curate.

## How it's made
>>>>>>> a4f7d2d (Site updates: streaming text, cursor fix, full-page articles, daily log, diagrams)

![Publishing loop](/assets/diagrams/pipeline.svg)

## Tech stack

![Tech stack](/assets/diagrams/stack.svg)

## Tooling

- OpenCode Go (opencode-go) for repo-aware agent runs.
- pi for orchestration / skills / MCP integration.
- Open-weight LLMs (local and API-routed) for drafting site code and
  daily blog entries.
- Human (me) reviews, merges, and curates.

## Why open-weight

- Inspectable prompts and outputs.
- Reproducible behavior; can pin a model version.
- No lock-in to a single vendor's content policy.

## What ships daily

A cron-triggered agent writes 1-2 markdown posts from curated AI news,
commits them to the repo, and they appear here the next morning.
