// Turns facts into sentences.
//
// The rule that names a fact decides *what* to say; this decides *how* to say it.
// The question picks the construction (a "how many" question leads with the
// number, a "which" question leads with the names) and a hash of the question
// picks one of its realisations, so four ways of asking one thing read like four
// answers instead of one template repeated. The same question always produces
// the same sentence, so a visitor can quote what they saw.
//
// Every realisation carries the same facts, and the bench in bench/composition
// fails a system that drops one (npm run bench:composition).

const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(text).length; i += 1) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

const pick = (list, key) => list[hash(key) % list.length];

const join = (items) =>
  items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const COUNT_QUESTION = /\b(how many|how much|number of|count)\b/i;
const WHICH_QUESTION = /\b(which|what)\b.*\b(use|uses|using|built with|written in|run|runs)\b/i;

/** Short names: "Hobnob: private meeting notes, no cloud" is "Hobnob". */
export const shortName = (title) => String(title).split(':')[0].trim();

/** Which projects have public engineering notes on the page. */
const hasNotes = (projects) => projects.filter((project) => project?.details).length;

/**
 * "What has he built": every title, in an order the question asked for.
 * `projects` is the page's own records, so the extra sentence is a fact about
 * the page rather than a claim about the work.
 */
export function phraseProjectList(query, projectRecords) {
  const titles = projectRecords.map((project) => shortName(project.title));
  const n = titles.length;
  if (n === 0) return '';

  // The supporting sentence is a fact about the page, not a claim about the
  // work: how many cards carry engineering notes, and how wide the stacks run.
  const notes = hasNotes(projectRecords);
  const entries = new Set(projectRecords.flatMap((project) => project.stack ?? [])).size;
  const support = pick(
    [
      notes ? `${notes === n ? 'Each one' : `${notes} of them`} has engineering notes behind an expand button.` : '',
      `Between them the ${n === 1 ? 'one' : n} name ${entries} distinct stack entries.`,
      notes ? `Every card opens to notes except ${n - notes}.` : `Each card lists its own stack.`,
    ].filter(Boolean),
    query,
  );

  if (n === 1) return `${titles[0]} is the only project on this page. ${support}`;

  if (COUNT_QUESTION.test(query)) {
    const claim = pick(
      [
        `${count(n, 'project')}: ${join(titles)}.`,
        `${n} of them, most recently shipped last: ${join(titles)}.`,
        `That makes ${n}: ${join(titles)}.`,
      ],
      query,
    );
    return `${claim} ${support}`;
  }
  const claim = pick(
    [
      `${join(titles)}, ${n} of them, every one shipped.`,
      `${join(titles)}, which is the public list.`,
      `Everything he has shipped is public: ${join(titles)}.`,
      `${join(titles)}.`,
    ],
    query,
  );
  return `${claim} ${support}`;
}

/**
 * "Which projects use Python": the matches, never the whole list.
 * `term` is the word the visitor used, so an unknown technology still reads
 * naturally ("nothing here lists Kubernetes").
 *
 * `records` is the page's full project list. Two of its facts are worth a
 * sentence each: what the matching projects share besides the asked technology,
 * and which project comes closest without having it. Both are read off the
 * stacks, so the extra sentences cannot turn into adjectives.
 */
export function phraseProjectsUsing(query, matches, term, { records = [] } = {}) {
  const names = matches.map((match) => shortName(match.title));
  if (names.length === 0) {
    const asked = String(term || '').trim();
    if (!asked) return '';
    const total = records.length;
    const tail = total
      ? pick(
          [
            ` All ${total} stacks are on the page.`,
            ` The other ${total} projects list something else.`,
          ],
          query,
        )
      : '';
    return `No project on this page lists ${asked}.${tail}`;
  }

  const stack = matches[0]?.stack?.find((value) => new RegExp(String(term || ''), 'i').test(value));
  const named = stack ? ` (${stack})` : '';
  const claim = names.length === 1
    ? pick(
        [
          `${names[0]} is the only one: it lists ${stack ?? term}.`,
          `Just ${names[0]}${named}.`,
          `${names[0]} is the one project listing ${stack ?? term}.`,
        ],
        query,
      )
    : WHICH_QUESTION.test(query)
      ? pick(
          [
            `${join(names)}, ${count(names.length, 'project')} on ${stack ?? term}.`,
            `${join(names)} both list ${stack ?? term}.`,
            `${join(names)}: ${names.length} projects name ${stack ?? term}.`,
          ],
          query,
        )
      : pick(
          [
            `${count(names.length, 'project')} use it: ${join(names)}.`,
            `${join(names)}, ${names.length} out of the projects here.`,
            `It shows up in ${join(names)}; nothing else claims it.`,
          ],
          query,
        );

  return claim + supportSentence(query, matches, term, records) + contrastSentence(query, matches, term, records);
}

/** Stack entries written as words, so "Python 3.10+" answers "python". */
const stackTokens = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .split(' ')
    .filter((word) => word && !/^[0-9]+$/.test(word));

const tokenSet = (project) => new Set((project?.stack ?? []).flatMap(stackTokens));

/** What the matching projects share beyond the technology that was asked for. */
function sharedStack(matches, term) {
  if (matches.length === 0) return [];
  const asked = new Set(stackTokens(term));
  const [first, ...rest] = matches;
  const shared = (first?.stack ?? []).filter((entry) => {
    const tokens = stackTokens(entry);
    if (tokens.length === 0 || tokens.some((token) => asked.has(token))) return false;
    return rest.every((project) => tokenSet(project).has(tokens[0]));
  });
  return shared;
}

/** The sentence that says what the answer rests on, or '' when nothing does. */
function supportSentence(query, matches, term, records) {
  if (matches.length === 0) return '';
  const total = records.length;

  if (matches.length === 1) {
    if (total <= 1) return '';
    return pick(
      [
        ` It is one of ${total} projects on the page.`,
        ` The other ${total - 1} list different stacks.`,
        ` ${total} projects are listed here in all.`,
      ],
      query,
    );
  }

  const shared = sharedStack(matches, term);
  const among = `All ${matches.length === 2 ? 'both' : matches.length}`;
  if (shared.length > 0) {
    return pick(
      [
        ` ${among} also list ${join(shared.slice(0, 2))}.`,
        ` They share ${join(shared.slice(0, 2))} as well.`,
        ` ${join(shared.slice(0, 2))} shows up in ${matches.length === 2 ? 'both' : `all ${matches.length}`}.`,
      ],
      query,
    );
  }
  if (total > matches.length) {
    return pick(
      [
        ` Past ${String(term || 'that')}, ${matches.length === 2 ? 'the two stacks' : `all ${matches.length} stacks`} share nothing else.`,
        ` Those ${matches.length} stacks overlap on ${String(term || 'that')} and nothing else.`,
      ],
      query,
    );
  }
  return '';
}

/** The nearest project that does not have it, named with what it has instead. */
function contrastSentence(query, matches, term, records) {
  const matched = new Set(matches.map((project) => shortName(project.title)));
  const others = (records ?? []).filter((project) => project?.title && !matched.has(shortName(project.title)));
  if (others.length === 0) return '';

  const owned = new Set(matches.flatMap((project) => [...tokenSet(project)]));
  const asked = new Set(stackTokens(term));
  const overlap = (project) => [...tokenSet(project)].filter((token) => owned.has(token) && !asked.has(token)).length;
  const nearest = others
    .map((project) => ({ project, overlap: overlap(project) }))
    .sort((a, b) => b.overlap - a.overlap || shortName(a.project.title).localeCompare(shortName(b.project.title)))[0];

  const different = (nearest?.project?.stack ?? []).filter((entry) => {
    const tokens = stackTokens(entry);
    return tokens.length > 0 && !tokens.some((token) => owned.has(token));
  });

  if (nearest?.overlap > 0 && different.length > 0) {
    return pick(
      [
        ` ${shortName(nearest.project.title)} does not list it; its stack is ${join(different.slice(0, 2))}.`,
        ` The closest without it is ${shortName(nearest.project.title)}, on ${join(different.slice(0, 2))}.`,
        ` ${shortName(nearest.project.title)} takes the other route: ${join(different.slice(0, 2))}.`,
      ],
      query,
    );
  }
  const rest = others.length;
  return pick(
    [
      ` The other ${rest} ${rest === 1 ? 'project lists' : 'projects list'} something else.`,
      ` ${rest} other ${rest === 1 ? 'stack does' : 'stacks do'} not name it.`,
    ],
    query,
  );
}

/**
 * "Which projects use python and sqlite": the intersection, which is a
 * different set from the union the `or` form asks for. Names both when they
 * hold, and says which one is missing when they do not, because "no project
 * lists both" is the useful half of the answer.
 */
export function phraseProjectsUsingAll(query, matches, terms, { records = [] } = {}) {
  const names = matches.map((match) => shortName(match.title));
  const pair = join(terms.map((term) => String(term).trim()));
  if (names.length === 0) {
    const asked = String(terms[0] ?? '').trim();
    const overlap = (records ?? []).filter((project) => (project.stack ?? []).some((entry) => new RegExp(asked, 'i').test(entry)));
    const only = overlap.map((project) => shortName(project.title));
    const tail = only.length
      ? ` ${join(only)} ${only.length === 1 ? 'lists' : 'list'} ${asked} without the other.`
      : '';
    return `No project on this page lists both ${pair}.${tail}`;
  }
  if (names.length === 1) {
    const claim = pick(
      [
        `${names[0]} is the only one listing both ${pair}.`,
        `Just ${names[0]}: it has ${pair} in its stack.`,
        `${names[0]}, and nothing else, lists ${pair} together.`,
      ],
      query,
    );
    return claim + supportSentence(query, matches, terms.join(' '), records);
  }
  const claim = pick(
    [
      `${join(names)} list both ${pair}.`,
      `${join(names)}: ${count(names.length, 'project')} with ${pair}.`,
      `Both ${pair} show up in ${join(names)}.`,
    ],
    query,
  );
  return claim + supportSentence(query, matches, terms.join(' '), records) + contrastSentence(query, matches, terms.join(' '), records);
}

/** "How many posts" / "what is the newest post". */
export function phraseNewestPost(query, { count: total, newest }) {
  const n = Number(total) || 0;
  const title = String(newest || '').trim();
  if (!title) return n ? `${n} posts are published.` : '';
  if (!n) return `The newest post is "${title}".`;

  if (COUNT_QUESTION.test(query)) {
    return pick(
      [
        `${n} posts so far; the newest is "${title}".`,
        `${n} of them, ending with "${title}".`,
        `That is ${n} entries, most recently "${title}".`,
      ],
      query,
    );
  }
  return pick(
    [
      `The newest is "${title}", one of ${n}.`,
      `"${title}", number ${n} if you are counting.`,
      `"${title}" is the latest; ${n} in all.`,
    ],
    query,
  );
}

/** Email and LinkedIn: the value is the answer, so it leads. */
export function phraseEmail(query, email) {
  return pick([`${email}.`, `One address: ${email}.`, `Mail goes to ${email}.`], query);
}

export function phraseLinkedin(query, url) {
  return pick([`${url}.`, `One profile: ${url}.`, `He is at ${url}.`], query);
}

/** "Who is he": the role, the years, and what he actually does. */
export function phraseProfile(query, { name, years, org, since }) {
  const first = String(name || 'He').split(' ')[0];
  const detail = org && since ? ` He has been at ${org} since ${since}.` : org ? ` He works at ${org}.` : '';
  return pick(
    [
      `${first} is an engineering manager and hands-on IC: ${years}+ years of APIs, cloud systems and client-facing apps.${detail}`,
      `${years}+ years of software, now managing engineers and still writing code.${detail}`,
      `An engineering manager who still ships: ${years}+ years across APIs, cloud systems and applications people actually use.${detail}`,
      `Manager and individual contributor, ${years}+ years in, still writing the code.${detail}`,
    ],
    query,
  );
}
