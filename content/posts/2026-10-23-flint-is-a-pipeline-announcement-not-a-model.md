# Flint Is a Pipeline Announcement, Not a Model
Tag: news
Subtitle: The interesting part of Flint is the pipeline that built it, not the model itself.
---
Recursive shipped Flint, a free open-weight MoE coding model: 40B total parameters, 2.5B active, roughly 131 tokens per second on an M4 Pro, and benchmark scores that beat other sub-50B models on SWE-Bench Verified. The model is the headline. I think the pipeline is the story.

Flint was produced largely by Recursive's "Eureka Machine," a recursive self-improvement pipeline where models help build the next model. If that holds up under independent evaluation, the interesting claim is not that a laptop can run a competent coding model. That was already trending. The claim is that the training loop itself is becoming the product, and the released weights are a byproduct of it.

Two caveats. SWE-Bench Verified is a proxy, not a measurement of how the model behaves in my editor on my codebase. And "largely built by AI" is a marketing phrase until someone outside Recursive reproduces the pipeline. I'd want to see the dataset lineage, the eval harness, and ablations before treating Eureka Machine as a method rather than a narrative.

Still, the direction is right. Open-weight models that run locally and improve through self-directed training loops shift the bottleneck from GPU budgets to eval quality. The teams that win will be the ones whose benchmarks actually predict user outcomes, not the ones with the biggest launch numbers.

Source: [TechCrunch](https://techcrunch.com/2026/10/21/recursive-launches-flint-a-laptop-coding-model-it-says-was-largely-built-by-ai/)
