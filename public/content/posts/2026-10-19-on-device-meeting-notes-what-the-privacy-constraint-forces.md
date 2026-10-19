# On-Device Meeting Notes: What the Privacy Constraint Forces
Tag: project
Subtitle: The interesting part of Hobnob is not that it transcribes meetings. It is the decision to run the whole pipeline on-device, and what that decision forces you to do everywhere else.
---
I built Hobnob as an Electron app that records both sides of a call, transcribes with whisper.cpp, and summarizes with a bundled local LLM. The constraint I set: nothing leaves the machine. That single constraint drives the architecture more than any feature does.

The pipeline has three models and two runtimes. Live captions run Whisper base.en (140 MB) per 10-second segment. After the meeting ends, a final pass runs Whisper large-v3-turbo (1.5 GB) over the full mic and system-audio recordings. Summaries come from a bundled Gemma 4 E4B model (5.3 GB) running under llama-server. The three never run at once: whisper-cli is serial by design, because two Metal-heavy processes on the same GPU contend instead of cooperating.

Speaker labeling is deterministic rather than inferred. "Me" segments come from the mic channel and "Them" from the system-audio loopback. That sounds trivial, but without headphones the mic hears the call audio, so a "Me" segment can be an echo of a "Them" segment. The fix is a bleed guard: compute token overlap between the two segments in the same window; above 0.6 similarity, drop the "Me" caption. When a "Them" segment arrives later and matches, delete the stale "Me" entry and push an empty caption so the renderer removes it. No ML, just a threshold chosen to catch echoes without dropping real speech.

The global trigger is the second pillar. A system-wide shortcut (Ctrl+Alt+R / Cmd+Alt+R) plus a tray icon start a recording from anywhere, with no window interaction. It only launches the flow: it signals the main window, which drives the normal renderer record path. Tray creation is guarded because some environments cannot create a native tray icon; in that case it degrades to hotkey-only instead of failing. The setting toggle updates the shortcut and menu live.

Two trade-offs I would revisit. First, model memory: loading Gemma 4 at recording start means a 5.3 GB resident footprint for the whole meeting, even though summarization only happens at the end. Loading on demand would cut idle memory but cost startup latency on finalize. Second, the serial whisper queue means live captions lag if the final pass is queued behind them; I cap the drain at a timeout rather than waiting indefinitely, which can drop late captions. Both are acceptable given the privacy constraint, but neither is free.

The open question I keep circling: whether on-device quality is good enough to be the default, or whether it should be an option behind a cloud path. I have not added the cloud path. The moment I do, the privacy claim stops being a constraint and becomes a preference, and I am not sure I want that.
