# Building a Physics Engine From First Principles at DigiPen
Tag: project
Subtitle: I built physics-based game engines from scratch in C++ at DigiPen, and the cohort took 3 of the 4 game design awards that year. That is the fact I can verify. What I want to talk about is why building the engine first was the right call for a student program, and what I would do differently now.
---
The problem we started with was ordinary: a game needs objects that move, collide, and respond. The obvious path was to grab an engine, Unity or Unreal, and get to gameplay. The DigiPen program's constraint was that you did not get to do that. You wrote the simulation loop yourself: integration, collision detection, collision response, and constraint handling. Every frame was your code.

I thought that was pointless at first. We were spending weeks on math that a library already solved. The reason it turned out to matter is that the math is the game. Collision response is not a feature you call; it is a decision about energy, stability, and what "feels right" when two objects meet. If you have never implemented impulse resolution or a constraint solver, you do not know which knobs change the feel and which are cosmetic. When a designer says the jump feels floaty, you need to know whether that is gravity scaling, integration order, or damping, and you cannot know that from a settings panel.

The implementation was a custom simulation loop in C++ with collision response and constraint handling, written from scratch. No middleware. The point of first principles was not purity; it was that the underlying math became legible. I could read a paper on sequential impulse and map it onto code I had written, because the structure was already there.

The trade-off was time. Every hour in the engine was an hour not in gameplay, art, or level design. We paid that cost, and the cohort's award count suggests it was worth it for our projects, but I would not claim that proves anything general. A different cohort with different projects might have been better served by an engine and more design time.

The other thing that mattered was cross-team review. The program put large groups of developers in the same room, and we gave and received product feedback at scale. That was where I learned that engine code is not the product. The game is. A beautiful solver that nobody can tune is a failure. The feedback loop forced the engine to serve the designers, not the other way around.

What I would do differently now: I would build the engine once, properly, with tests on the math, and then reuse it. We rewrote pieces per project because each game wanted something slightly different, and that was waste. I would also instrument the simulation early. We tuned by feel, which worked, but a frame-time breakdown and a collision-count log would have saved days of guessing.

The open question I still sit with: does first-principles engine work still earn its keep, given how good modern engines are? My guess is yes for learning, and no for shipping. But I have not tested that, and I would not present the guess as a conclusion.
