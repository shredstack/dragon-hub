#!/usr/bin/env node
/**
 * Regenerates `src/lib/emoji-data.ts` from Unicode's own emoji-test.txt.
 *
 *   node scripts/generate-emoji-data.mjs [path-or-url]
 *
 * The picker needs a full keyboard's worth of emoji, grouped and named, and
 * that list is Unicode's to define — hand-maintaining it would drift the first
 * time a new set shipped. Committing the generated file (rather than fetching
 * at build time) keeps the build offline-safe and the payload reviewable.
 *
 * Two filters are applied deliberately:
 *  - **Skin-tone and hair variants are dropped.** They quintuple the list for a
 *    choice nobody makes on a classroom icon, and the base emoji is what gets
 *    stored either way.
 *  - **Nothing newer than E15.0.** An emoji the reader's OS font doesn't have
 *    renders as a tofu box, and a picker full of boxes is worse than a shorter
 *    picker. Raise MAX_EMOJI_VERSION once the floor moves.
 */

import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE = "https://unicode.org/Public/emoji/15.1/emoji-test.txt";
const MAX_EMOJI_VERSION = 15.0;

/**
 * Unicode's group names, in the order they appear in the file, mapped to the
 * short label and tab emoji the picker shows. A group missing from here is
 * dropped — that's how "Component" (bare skin tones and hair) stays out.
 */
const GROUPS = {
  "Smileys & Emotion": { key: "smileys", label: "Smileys", tab: "😀" },
  "People & Body": { key: "people", label: "People", tab: "👋" },
  "Animals & Nature": { key: "nature", label: "Nature", tab: "🐻" },
  "Food & Drink": { key: "food", label: "Food", tab: "🍎" },
  Activities: { key: "activities", label: "Activities", tab: "🎉" },
  "Travel & Places": { key: "places", label: "Places", tab: "🚌" },
  Objects: { key: "objects", label: "Objects", tab: "💡" },
  Symbols: { key: "symbols", label: "Symbols", tab: "❤️" },
  Flags: { key: "flags", label: "Flags", tab: "🏁" },
};

const LINE =
  /^(?<codepoints>[0-9A-F ]+?)\s*;\s*(?<status>[\w-]+)\s*#\s*(?<char>\S+)\s+E(?<version>[\d.]+)\s+(?<name>.+)$/;

async function loadSource(source) {
  if (/^https?:/.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`${source} responded ${response.status}`);
    }
    return response.text();
  }
  return readFile(source, "utf8");
}

function parse(text) {
  const groups = new Map();
  let group = null;
  let subgroup = null;

  for (const line of text.split("\n")) {
    const groupMatch = /^#\s*group:\s*(.+)$/.exec(line);
    if (groupMatch) {
      group = GROUPS[groupMatch[1].trim()] ?? null;
      continue;
    }
    const subgroupMatch = /^#\s*subgroup:\s*(.+)$/.exec(line);
    if (subgroupMatch) {
      subgroup = subgroupMatch[1].trim();
      continue;
    }
    if (!group || line.startsWith("#") || !line.trim()) continue;

    const match = LINE.exec(line);
    if (!match) continue;
    const { status, char, version, name } = match.groups;

    if (status !== "fully-qualified") continue;
    if (Number(version) > MAX_EMOJI_VERSION) continue;
    // ": light skin tone", ": medium-dark skin tone, red hair", …
    if (/skin tone|: (?:red|curly|white|bald) hair/.test(name)) continue;

    const entry = { char, name };
    // The subgroup is a second axis to search on, and a genuinely useful one:
    // "event" finds 🎉🎈🎃, "school" finds 📚✏️. Only carried when it says
    // something the name doesn't already.
    const extra = subgroup
      .split(/[-_\s]+/)
      .filter((word) => word && !name.includes(word))
      .join(" ");
    if (extra) entry.keywords = extra;

    const bucket = groups.get(group.key) ?? { ...group, emoji: [] };
    bucket.emoji.push(entry);
    groups.set(group.key, bucket);
  }

  // Emit in the order GROUPS declares, not the order the file happened to use.
  return Object.values(GROUPS)
    .map((group) => groups.get(group.key))
    .filter(Boolean);
}

function render(groups, source) {
  const total = groups.reduce((sum, group) => sum + group.emoji.length, 0);
  const body = groups
    .map((group) => {
      const entries = group.emoji
        .map(
          (entry) =>
            `      { char: ${JSON.stringify(entry.char)}, name: ${JSON.stringify(
              entry.name
            )}${
              entry.keywords
                ? `, keywords: ${JSON.stringify(entry.keywords)}`
                : ""
            } },`
        )
        .join("\n");
      return `  {
    key: ${JSON.stringify(group.key)},
    label: ${JSON.stringify(group.label)},
    tab: ${JSON.stringify(group.tab)},
    emoji: [
${entries}
    ],
  },`;
    })
    .join("\n");

  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with \`node scripts/generate-emoji-data.mjs\`, which reads
 * ${source} and applies the filters
 * documented there (no skin-tone variants, nothing newer than E${MAX_EMOJI_VERSION.toFixed(
   1
 )}).
 *
 * ${total} emoji in ${groups.length} groups. Client-safe, and deliberately
 * imported only through a lazy \`import()\` in the emoji browser so the list
 * never lands in a page's first-load bundle.
 */

export interface EmojiEntry {
  /** The emoji itself — what gets stored. */
  char: string;
  /** Unicode's own name, shown as the button's label to screen readers. */
  name: string;
  /** Extra search terms from Unicode's subgroup, when they add anything. */
  keywords?: string;
}

export interface EmojiGroup {
  key: string;
  /** Short enough for a tab on a phone. */
  label: string;
  /** The emoji standing in for the group on its tab. */
  tab: string;
  emoji: EmojiEntry[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
${body}
];

/**
 * Every emoji whose name or keywords contain all of the query's words, in
 * group order. Word-wise rather than substring so "birthday cake" and "cake
 * birthday" find the same thing, and capped because nobody scrolls past a few
 * hundred results — they type another word instead.
 */
export function searchEmoji(query: string, limit = 300): EmojiEntry[] {
  const words = query.toLowerCase().trim().split(/\\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const matches: EmojiEntry[] = [];
  for (const group of EMOJI_GROUPS) {
    for (const entry of group.emoji) {
      const haystack = entry.keywords
        ? \`\${entry.name} \${entry.keywords}\`
        : entry.name;
      if (words.every((word) => haystack.includes(word))) {
        matches.push(entry);
        if (matches.length >= limit) return matches;
      }
    }
  }
  return matches;
}
`;
}

const source = process.argv[2] ?? DEFAULT_SOURCE;
const text = await loadSource(source);
const groups = parse(text);
if (groups.length === 0) {
  throw new Error("Parsed no emoji — has the file format changed?");
}

const outputPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "emoji-data.ts"
);
await writeFile(outputPath, render(groups, DEFAULT_SOURCE), "utf8");

const total = groups.reduce((sum, group) => sum + group.emoji.length, 0);
console.log(
  `Wrote ${total} emoji in ${groups.length} groups to ${path.relative(
    process.cwd(),
    outputPath
  )}`
);
