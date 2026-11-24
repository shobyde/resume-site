// How much code each project carries, measured rather than estimated.
//
// `node scripts/measure-size.mjs` produces these numbers (it is committed and
// re-runnable). The metric is non-blank lines in application source files:
// TypeScript, JavaScript, Python and friends. Stylesheets, markup, config,
// lockfiles and build output do not count, and tests do, because they live in
// the same repository.
//
// Why this file and not `src/data.js`: the card data forbids invented metrics,
// and this is not a claim about the work anyway. It is a measurement of a
// repository at a commit, which is what the panel needs to answer "which one is
// bigger" with a number. Re-run the script when a project lands a release.
export const SIZE_METRIC = 'non-blank source lines, tests included, styles and markup excluded';

export const PROJECT_SIZE = {
  Hobnob: { lines: 8142, files: 66, repo: 'shobyde/hobnob', commit: 'abf0318' },
  Readback: { lines: 7315, files: 34, repo: 'shobyde/readback', commit: 'db2c21a' },
  Groundglass: { lines: 1771, files: 15, repo: 'shobyde/groundglass', commit: '683e0dc' },
  Boaz: { lines: 11374, files: 74, repo: 'shobyde/boaz', commit: 'cf699ae' },
  'shobyde.com': { lines: 12317, files: 72, repo: 'shobyde/resume-site', commit: 'c32f02f' },
};

/** The number with thousands separators: 8142 reads as 8,142 in a sentence. */
export const withCommas = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
