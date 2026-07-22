/**
 * Server-assigned identities for scavenger hunt participants.
 *
 * A handle is the whole social layer of the hunt: it's what shows on the
 * leaderboard, and it's the only thing a player has to remember. Assigning it
 * from a fixed allowlist rather than letting people type one means no profanity
 * filter, no moderation queue, and no child's real name on a public board.
 */

// Hand-picked to be readable at a glance on a phone in a loud gym, and
// unambiguously school-appropriate. ~40 x ~40 gives ~1,600 combinations, which
// is comfortable headroom for the ~200 players a Back to School Night draws.
const ADJECTIVES = [
  "Turbo", "Sneaky", "Mighty", "Cosmic", "Zippy", "Brave", "Clever", "Dazzling",
  "Electric", "Fearless", "Glitter", "Happy", "Jumbo", "Kind", "Lucky", "Mega",
  "Nifty", "Orbital", "Peppy", "Quick", "Rocket", "Sunny", "Thunder", "Ultra",
  "Vivid", "Wild", "Zesty", "Bouncy", "Curious", "Daring", "Epic", "Fluffy",
  "Golden", "Heroic", "Jolly", "Nimble", "Plucky", "Radiant", "Speedy", "Witty",
];

// Each noun carries its own emoji so the leaderboard row and the handle always
// agree — "Turbo Narwhal" is never accidentally a taco.
const NOUNS: Array<{ word: string; emoji: string }> = [
  { word: "Narwhal", emoji: "🦄" },
  { word: "Otter", emoji: "🦦" },
  { word: "Dragon", emoji: "🐉" },
  { word: "Panda", emoji: "🐼" },
  { word: "Falcon", emoji: "🦅" },
  { word: "Koala", emoji: "🐨" },
  { word: "Tiger", emoji: "🐯" },
  { word: "Dolphin", emoji: "🐬" },
  { word: "Penguin", emoji: "🐧" },
  { word: "Fox", emoji: "🦊" },
  { word: "Owl", emoji: "🦉" },
  { word: "Turtle", emoji: "🐢" },
  { word: "Octopus", emoji: "🐙" },
  { word: "Whale", emoji: "🐳" },
  { word: "Hedgehog", emoji: "🦔" },
  { word: "Llama", emoji: "🦙" },
  { word: "Sloth", emoji: "🦥" },
  { word: "Bunny", emoji: "🐰" },
  { word: "Squirrel", emoji: "🐿️" },
  { word: "Bear", emoji: "🐻" },
  { word: "Lion", emoji: "🦁" },
  { word: "Monkey", emoji: "🐵" },
  { word: "Frog", emoji: "🐸" },
  { word: "Crab", emoji: "🦀" },
  { word: "Shark", emoji: "🦈" },
  { word: "Butterfly", emoji: "🦋" },
  { word: "Bee", emoji: "🐝" },
  { word: "Ladybug", emoji: "🐞" },
  { word: "Parrot", emoji: "🦜" },
  { word: "Flamingo", emoji: "🦩" },
  { word: "Peacock", emoji: "🦚" },
  { word: "Raccoon", emoji: "🦝" },
  { word: "Badger", emoji: "🦡" },
  { word: "Moose", emoji: "🫎" },
  { word: "Zebra", emoji: "🦓" },
  { word: "Giraffe", emoji: "🦒" },
  { word: "Hippo", emoji: "🦛" },
  { word: "Unicorn", emoji: "🦄" },
  { word: "Comet", emoji: "☄️" },
  { word: "Rocket", emoji: "🚀" },
];

export interface HuntHandle {
  handle: string;
  emoji: string;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * One random handle. Callers retry on the unique(huntId, handle) violation —
 * at ~200 players out of ~1,600 combinations the birthday-collision rate makes
 * a handful of attempts effectively certain to land.
 */
export function randomHandle(): HuntHandle {
  const noun = pick(NOUNS);
  return { handle: `${pick(ADJECTIVES)} ${noun.word}`, emoji: noun.emoji };
}

/**
 * Guaranteed terminator for the retry loop: a two-digit suffix turns an
 * exhausted namespace back into a fresh one ("Turbo Narwhal 47"), so starting
 * the hunt can never fail just because the dice came up unlucky.
 */
export function suffixedHandle(): HuntHandle {
  const base = randomHandle();
  const suffix = 10 + Math.floor(Math.random() * 90);
  return { handle: `${base.handle} ${suffix}`, emoji: base.emoji };
}

/** Exposed for the admin results view and for sizing sanity checks. */
export const HANDLE_COMBINATIONS = ADJECTIVES.length * NOUNS.length;
