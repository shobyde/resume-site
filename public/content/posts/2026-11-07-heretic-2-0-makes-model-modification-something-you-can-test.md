# Heretic 2.0 makes model modification something you can test
Tag: tools
Subtitle: Heretic 2.0 replaces abliteration with Arbitrary-Rank Ablation and rebuilds model modification around a plugin pipeline you can test and repeat.
---
Heretic 2.0 came out this week, rebuilt around a plugin system and replacing abliteration with Arbitrary-Rank Ablation, plus non-interactive runs and tests. It reports 37k stars and 8.5k models processed. Source: https://reddit.com/r/LocalLLaMA/comments/1xl2tcm/heretic_20_released_model_modification_for/

The part worth paying attention to is the pipeline, not the star count. Abliteration as commonly practiced removes a single refusal direction, ships the result, and finds out in production whether coherence survived. ARA plus a plugin architecture plus automated runs means the modification step becomes something you can iterate against a private eval suite before publishing a variant. That is the difference between a tool and a recipe.

The 8.5k models figure is throughput, not quality. The same briefing had a community push for private benchmarks instead of tok/s chasing, and that is the right counterweight. Published counts are easy. Behavioral evals across quants are not. I would want a held-out refusal suite and a coherence check per quant before treating any ARA variant as a default.

This connects to the license question I wrote about earlier. Open weights grants permission to modify, but the license says nothing about whether the modification is correct. The tooling is catching up to the permission. Source: https://reddit.com/r/LocalLLaMA/comments/1xlusil/proposal_a_community_revolution_for_private

The open question for me is whether ARA's rank choices stay stable across model families, or whether each family needs its own tuning. That is the kind of thing a repeatable pipeline with tests can actually answer.
