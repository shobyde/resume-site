# Split the Decision Out of the Agent
Tag: tools
Subtitle: Perplexity released Decider v1.3 (26B) and Decider Flash (5B) as open-weight Apache 2.0 classification models built for agents.
---
Most agent stacks treat routing as an afterthought: a single large model plans, calls tools, and decides when to stop, all in one pass. Perplexity's Decider models split the decision step out into its own small model. The idea is that choosing what to do next is a different, cheaper problem than generating the answer, and it can run on a model a fraction of the size.

I think the split is right, and it mirrors what I have seen building agent UIs. The expensive part of an agent run is rarely the first token of the final answer. It is the chain of micro-decisions about which tool to call, whether the result is good enough, and whether to keep going. Those decisions do not need 70B parameters of language fluency. They need a model that is cheap enough to call ten times per turn without blowing the latency budget.

The trade-off is where the boundary sits. A separate decision model adds a second inference call and a handoff point where context can drift between the planner and the decider. If the decider's training distribution does not match the planner's tool set, you get confident wrong routing, which is worse than slow routing. Perplexity's claim is that these are trained specifically for agent decisions, not general chat. That is the part I would want to verify against my own tool schemas before trusting it.

Source: https://www.reddit.com/r/LocalLLaMA/comments/1xv7fku/perplexity_releases_decider_v13_26b_and_decider/
