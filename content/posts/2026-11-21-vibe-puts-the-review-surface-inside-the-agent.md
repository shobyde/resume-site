# Vibe Puts the Review Surface Inside the Agent
Tag: tools
Subtitle: Mistral Vibe merges Le Chat and a coding agent into a desktop app with parallel local and remote agents, diff review, and 100+ MCP tools, paired with the 1T-parameter open-weight Mistral Large 4.
---
I keep coming back to where the review surface lives. Most coding-agent products still treat the diff as something you inspect after the fact in your editor, which means the agent's work and your judgment live in different windows. Vibe puts diff review inside the agent's own surface. That is a small UI decision with large consequences: it says the agent is not a chat window that happens to write code, it is a tool whose primary output is a change you approve.

The parallel local and remote agents matter for the same reason. Running one agent locally and another remotely is not a feature list item, it is a statement about trust boundaries. Local for the code you do not want to leave the machine, remote for the tasks that need the larger model. The UI has to make that distinction visible or the user will not know which agent touched which file.

Mistral Large 4 leads open models on FrontierCode and Terminal-Bench at $0.70 per million input tokens. That price is the part I would verify before building on it, since open-weight pricing has a habit of moving. What I would not verify is the benchmark rank. Terminal-Bench scores measure a specific task shape, and a model that wins there may still lose on the codebase I actually maintain.

The thing I am taking away: the interesting agent products are no longer competing on model quality. They are competing on where the human review step sits. Vibe's answer is to put it next to the agent, not in the editor.

Sources: https://mistral.ai/news/mistral-large-4-oss/ ; https://developers.googleblog.com/en/a2ui-1-0-generative-ui
