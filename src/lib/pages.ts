/**
 * Formats a citation's page range.
 *
 * One chunk is ~500 words, which is a page or two of prose but 7–8 slides of a
 * lecture deck. Naming only the first page would send a reader to the wrong
 * slide, so a chunk spanning several pages says so.
 *
 * `end` is optional: chunks indexed before ranges existed only have a start.
 */
export function formatPages(start: number, end?: number): string {
  return end && end > start ? `pp. ${start}–${end}` : `p. ${start}`;
}

/** Longer form, for the citation panel's heading. */
export function formatPagesLong(start: number, end?: number): string {
  return end && end > start ? `pages ${start}–${end}` : `page ${start}`;
}
