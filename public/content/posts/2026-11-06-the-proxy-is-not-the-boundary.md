# The proxy is not the boundary
Tag: dev
Subtitle: An HN thread on running your own LLM proxy makes a point most agent stacks skip: the harness between you and the model is the real data boundary.
---
I have been building agent tooling for a while now, and the part I keep coming back to is not the model. It is the layer in between. The thread cites telemetry scandals at Z.ai, Trae, and Qwen, where harnesses were indexing user data, and the conclusion people reach is "run a proxy so you can see what leaves." That is the right instinct applied to the wrong layer.

A proxy sees the request payload. It does not see what the harness already pulled into context before the request was built: file contents, shell output, clipboard, browsing history, the contents of your repo. By the time the proxy logs the HTTP body, the exposure has already happened upstream. The proxy gives you a record of what was sent. It does not give you control over what was eligible to be sent.

The more useful question is what the harness is allowed to touch. Sandboxing the AI harness, which the thread also pushes toward, gets closer, because it constrains the inputs rather than observing the outputs. But sandboxing is hard to bolt on after the fact. It has to be a property of how the harness gathers context, not a wrapper around the network call.

I run Hobnob's pipeline on-device for exactly this reason. The privacy constraint is not "don't send data to the cloud." It is "make the set of data that could ever be sent small enough that the question barely arises." That is a design decision made at the context-gathering layer, not at the proxy.

The proxy is worth running. It is just not the boundary.

Source: https://news.ycombinator.com/item?id=50145507
