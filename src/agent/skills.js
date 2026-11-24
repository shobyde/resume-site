/* ============================================================
   Declarative skills for the site assistant.

   A skill is data: a trigger, an ordered set of capability calls where a
   later call consumes an earlier result, checks between them, and a stop
   condition. `runSkill` (boaz/core) executes it through the same capability
   path a single request uses, so validation, confirmation and navigation
   still apply.

   The first skill exists to test the honest ceiling of the shape: three
   points from the page you are reading. On a short page the check has to
   fire before the summariser pads, and on a page that repeats itself the
   diversity check has to say so rather than return the same sentence twice.
   ============================================================ */

const quote = (text) => `"${String(text).trim()}"`;

export const pageThreePoints = {
  id: 'page.three_points',
  title: 'Summarise this page in three points',
  trigger: {
    phrases: [
      'summarise this page',
      'summarize this page',
      'summarise the page',
      'summarize the page',
      'three points from this page',
      'three points from the page',
      'key points from this page',
      'tl dr this page',
      'tldr this page',
    ],
  },
  steps: [
    { id: 'sections', capabilityId: 'page.sections', title: 'Read this page' },
    {
      id: 'points',
      capabilityId: 'page.points',
      title: 'Pick three points',
      input: { step: 'sections', path: 'sentences', as: 'sentences' },
    },
  ],
  checks: [
    {
      id: 'enough',
      after: 'sections',
      kind: 'min-items',
      path: 'sentences',
      value: 6,
      message: 'This page has fewer than six sentences to choose from.',
    },
    {
      id: 'three',
      after: 'points',
      kind: 'max-items',
      path: 'points',
      value: 3,
      message: 'Three points or fewer.',
    },
    {
      id: 'distinct',
      after: 'points',
      kind: 'distinct',
      path: 'points',
      value: 0.7,
      message: 'Two of the points say the same thing.',
    },
    {
      id: 'quoted',
      after: 'points',
      kind: 'verbatim',
      path: 'points',
      against: 'text',
      message: 'A point was not in the page.',
    },
  ],
  stop: { onCheckFail: 'stop', maxSteps: 3 },
  compose: (run) => {
    const points = run.steps.find((step) => step.id === 'points')?.result?.points ?? [];
    if (run.stopped?.check === 'enough') {
      return 'This page has fewer than six sentences, so three points would be padding. The blog is where the long writing is.';
    }
    if (run.stopped?.check === 'distinct') {
      const first = points[0]?.text ? ` The first one is ${quote(points[0].text)}` : '';
      return `The points I found repeat each other, so this page holds fewer than three distinct ones.${first}`;
    }
    if (run.stopped?.check === 'quoted') {
      return 'I could not match the points back to the page, so I am not going to quote them.';
    }
    if (run.failedAt) {
      const failed = run.steps.find((step) => step.status === 'failed');
      return `Reading this page failed: ${failed?.error ?? 'unknown error'}.`;
    }
    if (points.length === 0) return 'This page did not give me anything worth quoting.';
    // Say the number it found. The summariser stops rather than pad, so "three
    // points" can honestly come back as two, and the sentence has to match.
    const counted = ['No points', 'One point', 'Two points', 'Three points'][Math.min(points.length, 3)];
    const openers = ['First', 'Second', 'Third'];
    const listed = points
      .map((point, index) => `${openers[index] ?? 'Next'}, ${quote(point.text)} (${point.source}).`)
      .join(' ');
    return `${counted} from this page, in its own words. ${listed}`;
  },
  explain: (run) => {
    const read = run.steps.find((step) => step.id === 'sections');
    const sections = read?.result?.sections?.length ?? 0;
    const sentences = read?.result?.sentences?.length ?? 0;
    const picked = run.steps.find((step) => step.id === 'points')?.result?.points?.length ?? 0;
    if (run.stopped) return `Read ${sentences} sentences from ${sections} sections, then stopped at the check on ${run.stopped.check}`;
    if (run.failedAt) return `Read ${sentences} sentences from ${sections} sections`;
    return `Read ${sentences} sentences from ${sections} sections, then picked ${picked} that do not repeat`;
  },
};

export const siteSkills = [pageThreePoints];
