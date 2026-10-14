# Daily Log articles

<<<<<<< HEAD
Hermes cron writes one markdown file per day into this folder and regenerates
`index.json`. The site fetches `/content/posts/index.json` at runtime and renders
the 6 latest posts as cards; clicking one fetches the raw `.md` and renders it
in a modal. No build step needed for new posts - Cloudflare Pages picks up the
newly committed files on push.
=======
Each post is a markdown file plus an entry in `index.json`. A Hermes agent
generates these; keep the schema stable.
>>>>>>> a4f7d2d (Site updates: streaming text, cursor fix, full-page articles, daily log, diagrams)

## Files

- `content/posts/index.json` - array of post metadata (newest first).
- `content/posts/<slug>.md` - the post body.

## index.json entry schema

```json
{
  "slug": "2026-10-13-site-kickoff",   // filename without .md
  "title": "Site kickoff",
  "date": "2026-10-13",                // ISO date (YYYY-MM-DD)
  "tag": "log",                        // label shown on card and article
  "author": "Sho Byde",                // display name
  "excerpt": "One-line summary for the card."
}
```

Allowed `tag`/label values: `log`, `news`, `notes`, `build`, `ai`. Add new
ones only if also styled in the UI.

## Markdown file format

```
# Title

Tag: log
Subtitle: optional one-liner

---

Body in markdown (paragraphs, - lists, ## headings, ```code```).
```

The first `---` marks the end of front-matter. `Date`/`Author` are taken from
`index.json`, not the markdown.

## Caps

The site shows at most the 6 newest posts (see `src/blog.js`).
