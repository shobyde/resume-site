import json
import subprocess
from datetime import datetime
from pathlib import Path

repo = Path.home() / "projects" / "client-agent"
raw = subprocess.run(
    ["gh", "release", "list", "-R", "shobyde/boaz", "--limit", "40", "--json", "tagName,publishedAt"],
    cwd=repo, capture_output=True, text=True, check=True,
).stdout
releases = sorted(
    ((datetime.fromisoformat(r["publishedAt"].replace("Z", "+00:00")), r["tagName"]) for r in json.loads(raw)),
    key=lambda pair: pair[0],
)

path = Path.home() / "projects" / "resume-site" / "bench" / "threads" / "history.json"
data = json.loads(path.read_text())

for rung in data["rungs"]:
    at = datetime.fromisoformat(rung["date"].replace("Z", "+00:00"))
    current = [tag for stamp, tag in releases if stamp <= at]
    rung["release"] = current[-1] if current else "dev"

# suites at 90%+, by the release each row was recorded under
series = []
for stamp, tag in releases:
    seen = [r for r in data["rungs"] if r["release"] == tag or any(
        (s <= stamp and t == r["release"]) for s, t in releases
    )]
    at = [r for r in data["rungs"] if r["release"] == tag and r["after"] >= 90]
    if not at:
        continue
    running = [r for r in data["rungs"] if r["after"] >= 90 and releases.index((next(s for s, t in releases if t == r["release"]), r["release"])) <= releases.index((stamp, tag))]
    series.append({"version": tag.lstrip("v"), "suites_at_90": len(running), "note": ", ".join(r["id"] for r in at)})

data["releases"] = [{"version": "0.6.8", "suites_at_90": 0, "note": "before the campaign"}] + series
path.write_text(json.dumps(data, indent=2) + "\n")
print("ladder releases:")
for rung in data["rungs"]:
    print(f"  {rung['release']:8} {rung['id']}")
print("series:", [(r["version"], r["suites_at_90"]) for r in data["releases"]])
