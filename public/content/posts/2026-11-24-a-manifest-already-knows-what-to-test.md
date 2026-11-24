# A manifest already knows what to test
Tag: dev
Subtitle: client-agent turned this site's manifest into 113 questions and found four phrases two capabilities still fight over.
---
I added a command this morning that writes test coverage out of a manifest, because the old workflow had a hole in it. `audit` and `bench` shipped in 0.6.6 and both need a probe file. A new app never has one. The first thing anyone did was hand write twenty questions, get a few wrong because they guessed at the phrasing, and stop.

A manifest already carries the two things a probe needs. `capabilities[].title` says what the capability does. `capabilities[].keywords` says how a visitor asks for it. So `client-agent probes --generate --manifest dist/agent-manifest.json` emits `probes.generated.json`: one question per title and per keyword, each already expecting the id it came from, each grouped under that id as an `intent` so `bench` can score the copy once someone adds `must` facts.

The interesting part is what it refuses to write down.

A phrase that two capabilities in the same query class both claim is a coin flip, and a probe that records a coin flip is worse than no probe: it passes or fails depending on tie breaking you did not intend to test. On this site, `email`, `get in touch`, `hire` and `linkedin` are all claimed by both `contact.card` and `site.contact`, so the generator prints them and writes nothing for them. Four phrases, eight capabilities, one real bug in the manifest.

The second refusal is arguments. `projects.open` needs a project and a link; `projects.expand` needs a project. A phrase names what to open, not which one. Those three capabilities come back in the uncovered list with the argument names they need, which is the honest answer, and each needs a hand written probe with an `args` object.

Run against this site's own 22 capabilities, the generator produced 113 probes and covered 19 of them. Then I ran the audit on its own output: 73 of 113 passed.

The forty misses are where the numbers stopped being a scoreboard. Fourteen went to one answer rule, `posts.newest`. Seven went to `profile.who`. Nine got answered in prose. That is one finding, not forty: the manifest still lists keywords for phrasings that answer rules took over after the manifest was written. `newest post` and `who is sho` belong to those rules, and the keyword entries should go. A generated probe that fails is a claim about the manifest, which is what I wanted from it, though I expected the failures to be more evenly spread.

One library change fell out of building the page. The generator was exported from `client-agent/build`, which re-exports the source scanner, and importing that in a browser drags TypeScript into the bundle. The generator itself is a pure function over JSON, so 0.6.8 gives it its own entry, `client-agent/probes`. The page at `/labs/probe-gen/` imports that and builds to 5.86 kB, and it does the same work in the tab that the CLI does on disk: paste a manifest, read the probe list, copy the file.

Try it on your own manifest, or on this site's, at [the probe generator](/labs/probe-gen/). The release is [client-agent 0.6.8](https://github.com/shobyde/client-agent/releases/tag/v0.6.8).

The open question I have not answered: whether a generator should prefer the title or the keywords when the two disagree about how a visitor talks. Titles here read like UI labels, and keywords read like sentences, and half the misses above come from treating the label as an utterance. Filtering titles out of the default would have hidden the four contested phrases though, since those live in the keyword lists.
