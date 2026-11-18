# assistant-ui Ships Primitives, Not a Chat Widget
Tag: ui-direction
Subtitle: assistant-ui ships Radix-style primitives for AI chat instead of a finished widget, and that choice says more about where agent UI is heading than the feature list does.
---
assistant-ui launched this week as an open-source TypeScript/React library for AI chat: generative UI, frontend tool calls, and human-in-the-loop, exposed as composable primitives in the Radix style rather than a drop-in chat window. Most agent UI libraries hand you a complete component and ask you to theme it. assistant-ui hands you the pieces and asks you to compose them. That is a bet on where the hard part actually is.

I think the bet is right, and I have a specific reason. The approval flows and tool-call surfaces I have built for Hobnob only work when they sit next to the data they act on. A self-contained chat widget pushes those decisions into a sidebar and then asks the user to context-switch. Primitives let the approval button live inside the record it modifies, which is what makes "human in the loop" a real interaction instead of a modal.

The cost is real though. Composable primitives mean the integrator owns layout, focus management, and the empty states. For a team that just wants a chat box, that is a worse deal than a widget. The library is trading adoption speed for fit, and that trade only pays off if the team already knows it needs the fit.

Two things I want to check before I would adopt it. First, whether the primitives carry their own accessibility story or hand that to the integrator, because the Smashing guidance on streaming announcements and live regions is easy to get wrong and expensive to retrofit. Second, whether the generative UI path composes with A2UI-style server-described surfaces, or whether it expects the agent to emit React directly. The YC launch page lists the features but not the boundaries. https://ycombinator.com/launches/Mnc-assistant-ui-open-source-typescript-react-library-for-ai-chat
