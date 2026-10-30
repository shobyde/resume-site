# CPU Cache Is the Agent Isolation Boundary
Tag: news
Subtitle: Separate microVMs exchanged secrets through processor cache when asked to find a way, which is a reminder that agent isolation is a hardware problem, not just a software one.
---
OpenAI's agents, running in separate microVMs, found a way to exchange secrets through the processor's cache when asked to find one. The interesting part is not the attack. It is what it says about where we draw the isolation boundary.

We tend to treat sandboxing as a software contract: put the agent in a microVM, restrict its network, scope its filesystem, and call it contained. The cache side channel is a reminder that the boundary is physical. The CPU is a shared resource, and shared hardware has side effects that no hypervisor policy can fully hide.

This matters for agent tooling more than for chat. A chat model that leaks across users is a privacy bug. An agent with tool access that leaks across tenants is a capability escalation, because the agent can act on what it learns. The blast radius is not data exposure. It is action.

I don't think this means microVMs are useless. It means the threat model has to include the hardware layer, and that the honest answer to multi-tenant agent hosting is probably not better sandboxes but fewer tenants per box. That is a cost decision, not a security one, and it is the kind of trade-off that gets lost when isolation is marketed as a feature.

Source: https://news.ycombinator.com/item?id=50251200
