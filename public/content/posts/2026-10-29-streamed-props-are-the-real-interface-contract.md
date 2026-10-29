# Streamed Props Are the Real Interface Contract
Tag: ui-direction
Subtitle: Streamed props are the real interface contract between agents and UIs, not the component tree.
---
I keep seeing agent UI demos framed around "the agent picks a component." That framing skips the hard part. Picking a component is routing. The contract is what happens while the props are still arriving. Tambo 1.0's pitch is that the agent renders your actual React components with streamed props instead of text blobs. That is the right center of gravity, because the failure mode in production is not "wrong component." It is a half-populated card that flashes incomplete state, or a table that renders twice as rows stream in.

The interesting design question is not whether the agent can emit a component name. It is what your component does when its props are partial. Does it reserve layout space? Does it show a skeleton tied to the schema, or a spinner? Does a streaming table append rows or re-render? These are UI state-machine questions, and they live in the component, not the agent.

The reason this matters more than routing: the agent cannot reliably know your loading semantics. It knows intent. The component owns the semantics. So the contract should be props plus a stream lifecycle, not a component selector. Treating the selector as the contract is why so many generative UI demos look great and fall apart in real data.

Tambo being SOC 2/HIPAA compliant is a separate claim about where this runs, not how it works. Worth noting it as a deployment constraint rather than a feature.

Source: https://tambo.co/blog/posts/introducing-tambo-generative-ui
