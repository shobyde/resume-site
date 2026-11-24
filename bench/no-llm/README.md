# The no-model suites

Every claim on `/labs/no-llm/` comes from a task file in this directory: one file per task class,
one row per class on the page, one pass rate per row. The suites are plain JSON so that adding a task
never means touching the engine.

```
suites.json      the registry: class -> file, container, input field, runner, live-in-tab?
tasks.json       taxonomy (rung 1)          negation.json   reference.json  compound.json
synonyms.json    discourse.json             summarise.json  register.json   outline.json
plan.json        execute.json               recover.json    skills.json     memory.json
preferences.json actions.json               mcp.json        browser.json
grade.mjs        the grader for the five slot classes, imported by BOTH run.mjs and the page
run.mjs          the CLI runner: node bench/no-llm/run.mjs --suite negation.json
*.mjs            one harness per class, each printing its own pass rate and first failure
lint-tasks.mjs   the drift gate: runs on prebuild, exits 1 when a suite and the scorecard disagree
```

## Adding a task

1. Append the task to the class's array in its JSON file. Give it the input field the registry names
   (`q` for most, `say` for action-like classes, `text`, `query`) and an `expect` object in the shape
   the neighbouring tasks use. Do not renumber or reorder existing tasks.
2. Run the class: `npm run bench:plan`, `npm run bench:register`, `node bench/no-llm/run.mjs --suite
   reference.json`, and so on (`runner` in `suites.json` is the exact command after `node bench/no-llm/`).
   A new miss is a finding, not a failure of the run: record the input and why it missed.
3. `npm run scorecard` rewrites `labs/no-llm/scorecard.json` from the harness output, then commit the
   task file and the scorecard together.

The suite only grows. A task is never deleted or loosened to lift a rate; if it cannot be made to pass,
the miss goes into the ledger with the input and the reason, and stays in the suite as evidence.

## Task file shape

Three containers exist, because not every class is a list of sentences:

```jsonc
// "container": "tasks"  (most classes)
{ "class": "plan", "tasks": [ { "q": "open the archive and copy his email", "steps": [...] } ] }

// "container": "intents" (discourse: one intent, several phrasings of it)
{ "intents": { "projects.using": [ { "q": "which projects use python", "must": [...] } ] } }

// "container": "conversations" (memory: tasks assert a turn inside a scripted session)
{ "conversations": [ { "id": "gap", "turns": [...], "tasks": [ { "id": "g1", ... } ] } ] }
```

## What counts as a duplicate

Two tasks are the same task when they carry the same input **and** the same state. The registry
declares that state in `discriminator`, because several classes rerun one sentence under a different
condition:

| class | discriminator | why |
|---|---|---|
| register | `register`, `session` | the same sentence at three lengths is the point |
| preferences | `session`, `expect` | the answer, its trace line and the stored fact are separate claims |
| recover | `kind`, `faults` | one sentence against four injected failures |
| skills | `page` | one trigger on four pages |

A duplicate that asserts something different is not a duplicate. The first version of the gate ignored
this and flagged 28 legitimate tasks, which is why the field is in the registry rather than in the code.

## The drift gate

`node bench/no-llm/lint-tasks.mjs` runs as `prebuild`, so every build (including the Pages one) fails
when:

- a suite file is missing, unparseable, or its declared container is empty,
- a task has no input in the field the registry names,
- two tasks share an input and a state,
- a task without an utterance has no name (`id`, or `key` where the class uses a timestamp),
- the scorecard's task count for a class disagrees with the file, which is what happens when a task is
  added and `npm run scorecard` is not rerun,
- a scorecard row has no registry entry, or the registry cites a different file than the row.

It needs no `node_modules` and no browser, which is why CI can run it on a bare checkout.

## Live versus recorded

Five classes (taxonomy, negation, reference, compound, synonyms) are graded in the tab by
`grade.mjs`, the same module `run.mjs` imports, so their numbers are labelled `live here`. The rest are
recorded from their own harness on the date and library version written in `scorecard.json`. A row that
cannot be regraded in a browser says why on the page (needs Chromium, a page tree, a JSON-RPC transport,
or the site build).

Regenerating the scorecard (`npm run scorecard`, about 90 seconds) is also a regression probe: it runs
each class against the current engine, so a suite that was green and comes back red names a real change.
Do not hand-edit the numbers in `scorecard.json`; rerun the generator.
