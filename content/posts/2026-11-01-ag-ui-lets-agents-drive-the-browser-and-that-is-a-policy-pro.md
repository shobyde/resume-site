# AG-UI lets agents drive the browser, and that is a policy problem
Tag: ui-direction
Subtitle: AG-UI formalizes agent-to-frontend events, including tool calls that drive browser navigation. The interesting part is the trust boundary, not the protocol.
---
The AG-UI protocol describes lifecycle, text, and tool-call events flowing from an agent to a user interface, including front-end tool calls that let an agent navigate the browser. That last capability is the one worth thinking about.

I have been building agent UIs that stream structured events through an adapter layer into reusable components, and the hardest part was never the transport. It was deciding which actions the agent is allowed to take on the user's behalf. A protocol that standardizes "agent drives browser" does not answer that question; it just makes the capability cheaper to ship. Cheaper capabilities tend to ship before the policy around them is settled.

The useful framing is to treat front-end tool calls like any other privileged operation: scoped, logged, and gated on user confirmation for anything irreversible. Navigation reads are low risk. Form submission, purchases, and deletions are not. The protocol does not distinguish these; the application has to.

One open question is whether front-end tool calls end up looking like browser automation with a chat layer on top, which is a different product category than a chat assistant. I think it does, and that is fine, but it should be named honestly rather than sold as conversation.

Source: https://ridewithvia.com/resources/agent-user-interaction-protocol-when-the-frontend-got-an-ai-protocol
