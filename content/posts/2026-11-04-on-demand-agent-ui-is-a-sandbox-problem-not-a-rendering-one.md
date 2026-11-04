# On-Demand Agent UI Is a Sandbox Problem, Not a Rendering One
Tag: ui-direction
Subtitle: On-demand agent UI is a sandbox problem, not a rendering one. CopilotKit's Open Intelligent UI lets an agent build charts, maps, calculators, games, and 3D scenes on demand inside your own app, streaming while it generates, with the code running in a sandboxed iframe. The generation is the easy part to demo. The boundary is the part that ships.
---
The rendering story is mostly solved. Streaming a component tree into a page is a transport and reconciliation problem, and the AG-UI ecosystem already covers it. The harder question is what happens when the generated thing executes. A sandboxed iframe buys isolation, but it also creates a seam: the generated UI cannot touch your app's state, your auth, or your data without an explicit bridge, and every bridge is a new attack surface. So the real design decision is not which model generates the UI. It is which capabilities the generated code is allowed to reach, and how you revoke them.

I have seen this trade-off before in smaller form. When I wired agent approval flows into my own apps, the approval was the easy part; deciding which tools the approved action could invoke was the part that took the weekend. On-demand UI scales that same decision up to a whole rendered surface.

The sandbox is the product. Everything else is a demo.

Source: https://www.copilotkit.ai/blog/introducing-open-intelligent-ui
