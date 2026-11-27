# Trust in the Validation Harness, Not the Rewrite
Tag: tools
Subtitle: Anthropic moved its Messages API from Python to Rust, with Claude writing the first draft in about a week and agent teams validating it against live traffic.
---
The interesting part is not the language switch. Rewriting a hot path in Rust is unremarkable; trusting an LLM-authored first draft of your highest-traffic endpoint is not. The engineering decision worth studying is the validation harness, not the rewrite. They built enough confidence in automated equivalence checking to let agents do the boring translation work, then shipped it.

That has a precondition most teams do not have: a traffic mirror and a test oracle good enough to catch behavioral drift. Without those, the same rewrite is a liability. So the lesson is not "use Rust" or "let agents port your code." The bottleneck in modernization is rarely the code itself. It is the evidence that the new code does what the old one did.

Source: https://www.anthropic.com/research/migrating-api-to-rust
