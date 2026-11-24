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
 * "What has he built" — every title, in an order the question asked for.
 * `projects` is the page's own records, so the extra sentence is a fact about
 * the page rather than a claim about the work.
 */
export function phraseProjectList(query, projectRecords) {
  const titles = projectRecords.map((project) => shortName(project.title));
  const n = titles.length;
  if (n === 0) return '';
  if (n === 1) return `${titles[0]} is the only project on this page.`;

  const notes = hasNotes(projectRecords);
  // One answer in three mentions the notes; saying it every time is its own
  // template.
  const detail = notes && hash(query) % 3 === 0
    ? ` ${notes === n ? 'Each one' : `${notes} of them`} has engineering notes behind an expand button.`
    : '';

  if (COUNT_QUESTION.test(query)) {
    return pick(
      [
        `${count(n, 'project')}: ${join(titles)}.${detail}`,
        `${n} of them, most recently shipped last: ${join(titles)}.${detail}`,
        `That makes ${n} — ${join(titles)}.${detail}`,
      ],
      query,
    );
  }
  return pick(
    [
      `${join(titles)} — ${n} of them, every one shipped.${detail}`,
      `${join(titles)}. That is the public list.${detail}`,
      `Everything he has shipped is public: ${join(titles)}.${detail}`,
      `${join(titles)}.${detail}`,
    ],
    query,
  );
}

/**
 * "Which projects use Python" — the matches, never the whole list.
 * `term` is the word the visitor used, so an unknown technology still reads
 * naturally ("nothing here lists Kubernetes").
 */
export function phraseProjectsUsing(query, matches, term) {
  const names = matches.map((match) => shortName(match.title));
  if (names.length === 0) {
    const asked = String(term || '').trim();
    return asked ? `No project on this page lists ${asked}.` : '';
  }

  const stack = matches[0]?.stack?.find((value) => new RegExp(String(term || ''), 'i').test(value));
  const named = stack ? ` (${stack})` : '';
  if (names.length === 1) {
    return pick(
      [
        `${names[0]} is the only one: it lists ${stack ?? term}.`,
        `Just ${names[0]}${named}.`,
        `${names[0]} — ${stack ?? term} is in its stack.`,
      ],
      query,
    );
  }

  if (WHICH_QUESTION.test(query)) {
    return pick(
      [
        `${join(names)} — ${count(names.length, 'project')} on ${stack ?? term}.`,
        `${join(names)} both list ${stack ?? term}.`,
        `${join(names)}: ${names.length} projects name ${stack ?? term}.`,
      ],
      query,
    );
  }
  return pick(
    [
      `${count(names.length, 'project')} use it: ${join(names)}.`,
      `${join(names)} — ${names.length} out of the projects here.`,
      `It shows up in ${join(names)}; nothing else claims it.`,
    ],
    query,
  );
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
      `"${title}" — number ${n}, if you are counting.`,
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

/** "Who is he" — the role, the years, and what he actually does. */
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
