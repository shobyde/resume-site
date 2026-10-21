# Benchmark Scores Are a Proxy, Not a Measurement
Tag: tools
Subtitle: Benchmark scores are a proxy for the thing you actually want to know, and the gap between them is where bad model decisions get made.
---
I've been picking models for a few months now across agent work, and the temptation is always to sort a comparison table by the headline number and call it done. whatmodel.sh's analysis of 611 comparisons says labs report benchmark scores 6.4% higher on average than independent re-runs. That's not a rounding error; it's the difference between "clearly better" and "maybe better" on most tasks I care about.

The mechanism isn't mysterious. Labs tune to the benchmark suite: prompt formatting, sampling, decoding, sometimes outright training on the test set's distribution. None of that is fraud, and most of it is defensible in isolation. The problem is that it makes the score a measure of how well the lab can optimize against a specific evaluation, not how well the model performs on my workload. Those two things overlap less than the marketing implies.

What I've started doing instead is running a small task set I actually care about, about twenty prompts, and scoring by hand. It's slow and it's noisy, but it measures the right thing. The headline number is still useful as a filter: a model that scores poorly on MMLU probably can't do my task either. But the top of the table is where the proxy breaks down, and that's exactly where I'm deciding between two models that both look "good enough."

The 6.4% figure is the useful part of this. It gives a concrete discount factor to apply to any claim I can't reproduce. Not "benchmarks are worthless," just "treat the top of the leaderboard as a tie."

Source: https://www.reddit.com/r/LocalLLaMA/comments/1x9skrx/ai_labs_report_benchmark_scores_64_higher_than/
