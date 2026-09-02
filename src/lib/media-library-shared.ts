/**
 * Client-safe half of the media library — the shape of a usage count and the
 * one place it turns into English, so the badge on a card and the sentence in
 * the delete dialog can never disagree about what "in use" means.
 *
 * The server half (counting, recording, deleting) is `src/lib/media-library.ts`.
 */

export interface MediaUsage {
  sections: number;
  headers: number;
  contentImages: number;
  recurring: number;
  schoolHeaderDefault: boolean;
  total: number;
}

export type MediaUsageMap = Record<string, MediaUsage>;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "2 emails, 1 submission" — the places this image is still rendered, longest
 * first. Empty string when nothing uses it.
 */
export function describeMediaUsage(usage: MediaUsage | undefined): string {
  if (!usage || usage.total === 0) return "";

  const parts: string[] = [];
  const emails = usage.sections + usage.headers;
  if (emails > 0) parts.push(plural(emails, "email", "emails"));
  if (usage.contentImages > 0) {
    parts.push(plural(usage.contentImages, "submission", "submissions"));
  }
  if (usage.recurring > 0) {
    parts.push(plural(usage.recurring, "recurring section", "recurring sections"));
  }
  if (usage.schoolHeaderDefault) parts.push("the default email header");

  return parts.join(", ");
}

/**
 * What deleting this image will actually do. An image still on an email that
 * already went out keeps its file — the library is a catalog, and removing a
 * card from a catalog must not blank the picture in someone's inbox.
 */
export function describeMediaDeletion(usage: MediaUsage | undefined): string {
  const where = describeMediaUsage(usage);
  if (!where) {
    return "Nothing is using this image, so it is removed from the library and deleted from storage.";
  }
  return `This image is used in ${where}. It is removed from the library, but the file stays so those keep showing it.`;
}
