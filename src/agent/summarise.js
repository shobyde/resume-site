/* ============================================================
   The corpus a summary question is answered from.

   The blog list ships one excerpt per post, which is enough to rank
   posts and not enough to summarise: a summary has to choose between
   sentences inside the posts it picked. So the pipeline is
   retrieve (rank posts by the question) -> read (those posts' own
   markdown, already served at /content/posts/) -> split sentences ->
   pick three with `summarise()`.

   Kept free of DOM access so bench/no-llm/summarise.mjs runs the same
   functions over the files on disk that the panel runs over fetches.
   ============================================================ */

import { analyzeQuestion, summarise, splitSentences, tokenize } from 'boaz/core';

/**
 * The words worth summarising around. A summary question names the thing it
 * wants ("...about sqlite") and spends the rest of the sentence on the frame
 * (what does he write about). `analyzeQuestion` already separates those: the
 * frame fills `slots.attribute`, and whatever it could not account for arrives
 * in `slots.mentions`. Ranking sentences on the frame word "write" is what
 * returns essays that never mention the subject.
 */
export function contentTerms(query) {
  const analysis = analyzeQuestion(String(query || ''));
  const mentions = analysis.slots?.mentions ?? [];
  return mentions.length ? mentions.join(' ') : '';
}

/** How many posts a summary question reads. Eight is enough to cover a
 *  subject twice over at this corpus size, and small enough that the fetch
 *  is invisible on the first answer. */
export const SUMMARY_DOCS = 8;

/** Drop front matter, fenced code, headings, images and link syntax. */
export function stripMarkdown(markdown) {
  return String(markdown || '')
    // Posts start with the front matter (# Title / Tag / Subtitle) and close it
    // with a horizontal rule; everything before that rule is metadata, not prose.
    .replace(/^[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    // Inline code reads as a backtick in a quoted sentence.
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rank posts against the question, using only what the blog list ships. */
export function rankPosts(posts, query, limit = SUMMARY_DOCS) {
  const terms = tokenize(query);
  if (terms.length === 0) return posts.slice(0, limit);

  const scored = posts.map((post) => {
    const words = new Set(
      [...tokenize(post.title || ''), ...tokenize(post.excerpt || ''), ...tokenize(post.tag || '')],
    );
    const overlap = terms.filter((term) => words.has(term)).length;
    return { post, overlap };
  });

  const hits = scored.filter((row) => row.overlap > 0).sort((a, b) => b.overlap - a.overlap);
  const rest = scored.filter((row) => row.overlap === 0);
  // A question that names nothing still deserves a summary of the newest
  // writing rather than an empty read.
  return [...hits, ...rest].slice(0, limit).map((row) => row.post);
}

/** Sentences from the documents that were read, tagged with their source. */
export function corpusFrom(documents) {
  const sentences = [];
  for (const document of documents) {
    const prose = stripMarkdown(document.markdown);
    for (const [index, text] of splitSentences(prose).entries()) {
      if (text.length < 40) continue;
      sentences.push({
        id: `${document.slug}#${index}`,
        text,
        source: document.slug,
        sourceTitle: document.title,
        group: document.tag,
      });
    }
  }
  return sentences;
}

/** The whole pipeline over documents that are already in hand. */
export function summariseDocuments(query, documents, options = {}) {
  const terms = contentTerms(query);
  const guided = tokenize(terms).length > 0;
  // An unguided question ("what does he write about") has nothing to rank on,
  // so it summarises the openings instead: each post's first claim is its
  // thesis, and three of those answer the question without an adjective.
  const sentences = guided ? corpusFrom(documents) : thesesFrom(documents);
  const result = summarise(sentences, {
    query: terms,
    k: options.k ?? 3,
    lambda: options.lambda ?? 0.7,
    maxPerSource: 1,
  });
  return { ...result, terms: tokenize(terms), sentences: sentences.length, documents: documents.length, guided };
}

/** The first claim of each document: what the post argues, in its own words. */
export function thesesFrom(documents) {
  const theses = [];
  for (const document of documents) {
    const [first, second] = splitSentences(stripMarkdown(document.markdown));
    const text = [first, second].filter((sentence) => sentence && sentence.length >= 40).join(' ');
    if (!text) continue;
    theses.push({
      id: `${document.slug}#thesis`,
      text,
      source: document.slug,
      sourceTitle: document.title,
      group: document.tag,
    });
  }
  return theses;
}

const trimStop = (text) => String(text).replace(/\s+/g, ' ').replace(/[.!?]$/, '');

/** One paragraph, three quoted claims, each naming the post it came from. */
export function phraseSummary(result, { query } = {}) {
  const picks = result.picks ?? [];
  if (picks.length === 0) {
    return 'There is nothing published to summarise yet.';
  }

  const read = `Read ${result.documents} ${result.documents === 1 ? 'post' : 'posts'}`;
  const terms = result.terms ?? tokenize(query || '');
  const frame = terms.length
    ? `On ${terms.slice(0, 3).join(', ')}, he writes:`
    : 'The blog, in his own sentences:';

  const quotes = picks.map(
    (pick) => `"${trimStop(pick.text)}" (${pick.sourceTitle})`,
  );

  return `${frame} ${quotes.join(' ')}`;
}
