import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy h:mm a");
}

export function formatRelativeDate(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  // Format as (XXX) XXX-XXXX for 10 digits, or +X (XXX) XXX-XXXX for 11 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Return original if not a standard US number
  return phone;
}

/**
 * Format a US phone number while the user types, e.g. "5551234567" -> "(555) 123-4567".
 * Input that isn't a US-style number is left untouched so validation can flag it.
 */
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length > 11 || (digits.length === 11 && digits[0] !== "1")) {
    return value;
  }

  const hasCountryCode = digits.length === 11;
  const prefix = hasCountryCode ? "+1 " : "";
  const local = hasCountryCode ? digits.slice(1) : digits;

  if (local.length < 4) return `${prefix}${local}`;
  if (local.length < 7) return `${prefix}(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `${prefix}(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

// Deliberately permissive: one "@", no whitespace, and a dotted domain with a
// real TLD. Catches typos like "jane@gmail" or "jane @example.com" without
// rejecting valid-but-unusual addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_PATTERN.test(email.trim());
}

export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return true; // Empty is allowed (optional field)
  const digits = phone.replace(/\D/g, "");
  // Accept 10 digits or 11 digits starting with 1
  return digits.length === 10 || (digits.length === 11 && digits[0] === "1");
}

export function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Store as just digits
  return digits;
}

/**
 * Throws unless `url` is an http(s) URL.
 *
 * Board-supplied links (e.g. an event's SignUpGenius URL) are rendered as
 * `href`s on pages parents can reach without signing in, so anything that isn't
 * a real web address — `javascript:` above all — must not make it into storage.
 */
export function assertHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Enter a full web address, starting with https://");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Enter a full web address, starting with https://");
  }
}

/**
 * Normalize a user-typed website into a storable http(s) URL, or null.
 *
 * People type "jumparound.com", not "https://jumparound.com", so a bare domain
 * gets a scheme rather than an error. Anything that already names a scheme has
 * to name a web one: these values are rendered straight into `href`, and a
 * `javascript:` "website" planted by one member runs in the browser of every
 * board member who clicks it.
 */
export function normalizeWebsiteUrl(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  assertHttpUrl(candidate);
  return candidate;
}

/**
 * Read a stored list column that may hold either a JSON array or the plain
 * newline-separated text a textarea produced.
 *
 * The catalog's `keyTasks` and `tips` columns are documented as JSON arrays and
 * are written that way by the generator, but every form that edits them submits
 * a textarea's raw value. A bare `JSON.parse` on the read side therefore throws
 * mid-render the first time a board member edits an entry — so reading tolerates
 * both shapes, and `serializeList` puts them back in one.
 */
export function parseStoredList(
  value: string | null | undefined
): string[] {
  if (!value) return [];

  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fall through to newline parsing — a truncated or hand-edited value is
      // still worth showing.
    }
  }

  return trimmed
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

/** Store a list in the JSON-array form the catalog columns are meant to hold. */
export function serializeList(
  value: string | string[] | null | undefined
): string | null {
  const items = Array.isArray(value)
    ? value.map((item) => item.trim()).filter(Boolean)
    : parseStoredList(value);
  return items.length > 0 ? JSON.stringify(items) : null;
}

/**
 * Turn a human title into a URL-friendly, stable identity key.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/**
 * Reduce a title to the words that carry meaning, for near-duplicate detection.
 *
 * "The 5th Annual Field Day!" and "Field Day 2026" both come back as {field,
 * day}, which is what lets the catalog warn before a second Field Day row is
 * created. Year numbers and ordinals are dropped precisely because they're the
 * usual way a duplicate sneaks in.
 */
const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "at", "in", "on",
  "our", "annual", "school", "pta", "event",
]);

export function titleKeywords(title: string): Set<string> {
  return new Set(
    slugify(title)
      .split("-")
      .filter(
        (word) =>
          word.length > 1 &&
          !TITLE_STOPWORDS.has(word) &&
          !/^\d+(st|nd|rd|th)?$/.test(word)
      )
  );
}

/**
 * Jaccard overlap of two titles' meaningful words, 0..1.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = titleKeywords(a);
  const right = titleKeywords(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared++;
  }
  return shared / (left.size + right.size - shared);
}
