# CopilotKit's Vue SDK Is a Bet on the Protocol Layer
Tag: ui-direction
Subtitle: CopilotKit now ships a native Vue SDK over AG-UI, so one agent can drive React, Vue, React Native, or Angular frontends. The bet is on the protocol layer, not the components.
---
The announcement is short on substance and long on portability: chat components, frontend tools, shared state, human-in-the-loop, generative UI, threads, all over AG-UI. The interesting claim is not that Vue gets a chat widget. It is that the agent no longer belongs to a framework. The frontend becomes a client of a protocol, and the framework choice becomes a rendering detail.

I have been circling this idea for a few weeks. The A2UI and AG-UI posts I wrote recently both land on the same point: the contract between agent and UI is the thing worth standardizing, and the component tree is secondary. CopilotKit's move is consistent with that. If the protocol carries typed state, tool calls, and interrupts, then a Vue team and a React team can share one agent without sharing a component library.

The catch is portability of the components themselves. A protocol can be identical across frameworks and still leave every team rebuilding approval cards, tool-call lifecycle views, and streaming layouts in their own stack. That is where most of the work actually lives. The protocol saves you from rewriting the agent. It does not save you from rewriting the interface.

So the real test is not whether one agent runs across four frameworks. It is whether the shared pieces, the approval flow and the tool-call card, survive the trip. If they do not, this is just a thinner SDK per framework with a common wire format, which is still useful but not the leap the headline implies.

Source: https://copilotkit.ai/blog/introducing-copilotkit-vue
