# Daily Log pipeline

Hermes cron writes one markdown file per day into this folder and regenerates
`index.json`. The site fetches `/content/posts/index.json` at runtime and renders
the 6 latest posts as cards; clicking one fetches the raw `.md` and renders it
in a modal. No build step needed for new posts - Cloudflare Pages picks up the
newly committed files on push.

## File format

`YYYY-MM-DD-slug.md`:

```md
# Title
Tag line: something short
---
Body markdown...(standard markdown)
```

## index.json

```json
[
  {
    "slug": "2026-10-13-kickoff",
    "date": "2026-10-13",
    "title": "Site kickoff",
    "tag": "dev",
    "excerpt": "Short one-liner used on the card."
  }
]
```

Brand-new entries go at the TOP of the array. Slug must match filename minus `.md`.
