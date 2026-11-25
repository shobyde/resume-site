# GLM-5.4's loop transformer bets refinement over depth
Tag: tools
Subtitle: GLM-5.4 is the first loop-transformer model aimed at generalized coding, and the interesting part is the architecture, not the benchmark.
---
A loop transformer reuses its own layers across multiple passes instead of growing deeper. The bet is that refinement beats depth: run the same block several times, condition on the previous pass's hidden state, and let the model correct itself before emitting. That is a different scaling axis than the one the industry has been riding. More layers cost more memory at inference. More passes cost more time at inference. Both are real costs, but they land in different places, and for a coding model that has to reason about a repository before writing a line, extra passes over a fixed depth might be the cheaper trade.

I have not run it. The claim worth testing is whether the loop helps on tasks where the first draft is wrong but the second pass catches it, the kind of work where an agent writes code, fails a test, and rewrites. If the loop buys you that without a deeper network, the architecture matters more than the parameter count.

The risk is that loops are easy to announce and hard to evaluate. A model that loops but does not actually change its answer between passes is just a deeper model with extra latency. The useful number is not the HN score. It is how much the output changes between pass one and pass four on a hard task.

Source: https://z.ai/blog/glm-5.4
