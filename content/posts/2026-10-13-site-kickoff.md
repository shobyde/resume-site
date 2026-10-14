# Introduction to the site
This site is the first running output of an experiment: ship a personal
resume + daily log using open-weight LLMs, driven through local agent
tooling. The goal is not the novelty of AI code generation - it is building a
publishing loop where a machine drafts and I curate.

## How it's made

=======

Tag: intro
Subtitle: AI-assisted, human-curated.

---

This site is the first running output of an experiment: ship a personal
resume + daily log using open-weight LLMs, driven through local agent
tooling. The goal is not the novelty of AI code generation - it is building a
publishing loop where a machine drafts and I curate.

## How it's made

>>>>>>> b722b66 (Site updates: streaming text, cursor fix, full-page articles, daily log, diagrams)
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
