/**
 * The rules of a group mailing, client-safe.
 *
 * A group mailing is one message sent many times, once per small group, with
 * the group's own details merged in and its own recipient list. The room parent
 * onboarding email is the case that forced it: thirty classrooms, each getting
 * the same message about a different room, addressed to different people, with
 * that room's roster attached.
 *
 * **DragonHub never sends these.** It drafts and it addresses; a board member
 * sends from their own Gmail. A note from the VP of room parents should arrive
 * from her, and the replies belong in her inbox. Everything here is therefore
 * about producing a subject, a body and a To-list that a human then pastes —
 * see `gmailComposeUrl` at the bottom, which is the whole delivery mechanism.
 *
 * The form and the server actions both import this, so what the builder offers
 * and what the server will build cannot drift.
 */

// ─── Who a group is built from ───────────────────────────────────────────────

/**
 * How the school's classrooms get carved into groups — one email each.
 *
 * `dli_grade` exists because at a DLI school a grade is run as one unit: Red and
 * Blue plan together and throw the parties together, so they get one email
 * naming both teachers. `dli_split` is the other half of the same fact — an
 * all-school note about Halloween parties genuinely is two emails, because the
 * DLI rooms do it differently, and that is exactly two rather than thirty.
 */
export const MAILING_GROUPINGS = {
  classroom: "One email per classroom",
  dli_grade: "One per grade (DLI Red & Blue combined)",
  dli_split: "Two emails — DLI and non-DLI",
  single: "One email to everyone",
} as const;

export type MailingGrouping = keyof typeof MAILING_GROUPINGS;

export const MAILING_GROUPING_HINTS: Record<MailingGrouping, string> = {
  classroom:
    "Room 12 gets a Room 12 email. The usual choice for room parent onboarding.",
  dli_grade:
    "A DLI grade's Red and Blue rooms share one email naming both teachers. Non-DLI grades still get one email per room.",
  dli_split:
    "Everyone selected, in two lists. For an all-school note where the DLI grades need different wording.",
  single: "Everyone selected, in one list.",
};

/**
 * Who inside each group gets addressed. Additive — a room parent onboarding
 * email goes to the room parents, the same email about a party goes to the
 * teachers too, and the MTM committee's goes to its volunteers and the teacher.
 */
export const MAILING_RECIPIENT_ROLES = {
  teachers: "Teachers",
  room_parents: "Room parents",
  party_volunteers: "Party volunteers",
  committee_members: "Classroom committee volunteers",
} as const;

export type MailingRecipientRole = keyof typeof MAILING_RECIPIENT_ROLES;

export const MAILING_RECIPIENT_ROLE_HINTS: Record<MailingRecipientRole, string> =
  {
    teachers: "Everyone listed as a teacher of the room.",
    room_parents: "Active room parents. Waitlisted parents are not included.",
    party_volunteers: "Anyone who signed up to help with a class party.",
    committee_members:
      "Volunteers holding a seat on a classroom committee (Meet the Masters) in this room.",
  };

/**
 * Which classrooms to include at all.
 *
 * `needs_room_parents` and `needs_committee` are the reason a coverage filter
 * exists rather than a checkbox list of rooms: "email the teachers whose rooms
 * still have nobody, and ask them to nudge their families" is a recurring job
 * for the VP of room parents, and the set changes every day as people sign up.
 * Picking rooms by hand would be stale before the email went out.
 */
export const MAILING_COVERAGE_FILTERS = {
  all: "Every classroom",
  needs_room_parents: "Only rooms short on room parents",
  needs_committee: "Only rooms short on committee coverage",
  needs_any: "Only rooms short on either",
} as const;

export type MailingCoverageFilter = keyof typeof MAILING_COVERAGE_FILTERS;

export const MAILING_COVERAGE_FILTER_HINTS: Record<
  MailingCoverageFilter,
  string
> = {
  all: "Include every active classroom taking signups.",
  needs_room_parents:
    "Rooms with fewer active room parents than the school's limit.",
  needs_committee:
    "Rooms below the per-classroom limit of the committee selected above.",
  needs_any: "Rooms short on room parents, or on the selected committee.",
};

export interface MailingAudience {
  grouping: MailingGrouping;
  recipientRoles: MailingRecipientRole[];
  coverage: MailingCoverageFilter;
  /**
   * Scope to one committee. Required by the `needs_committee` filters and by
   * the `committee_members` recipient role — a per-classroom committee's seats
   * are the thing being counted, and there is more than one committee.
   */
  committeeId?: string | null;
  /**
   * Limit to specific classroom ids. Null means every room the coverage filter
   * allows. Set when a board member unticks rooms by hand.
   */
  classroomIds?: string[] | null;
}

export const DEFAULT_MAILING_AUDIENCE: MailingAudience = {
  grouping: "classroom",
  recipientRoles: ["room_parents"],
  coverage: "all",
  committeeId: null,
  classroomIds: null,
};

/** A committee is only meaningful for some of the choices above. */
export function audienceNeedsCommittee(audience: MailingAudience): boolean {
  return (
    audience.recipientRoles.includes("committee_members") ||
    audience.coverage === "needs_committee" ||
    audience.coverage === "needs_any"
  );
}

/** The reasons an audience can't be built yet, for the form and the action. */
export function audienceProblems(audience: MailingAudience): string[] {
  const problems: string[] = [];
  if (audience.recipientRoles.length === 0) {
    problems.push("Pick at least one group of people to send to.");
  }
  if (audienceNeedsCommittee(audience) && !audience.committeeId) {
    problems.push(
      "Choose a committee — the selection above counts one committee's seats."
    );
  }
  return problems;
}

// ─── Recipients and groups ───────────────────────────────────────────────────

export interface MailingRecipient {
  name: string;
  email: string;
  /** Why they're on the list. Shown so a board member can spot a surprise. */
  role: MailingRecipientRole;
}

/** One email to send. Mirrors a `mailing_groups` row. */
export interface MailingGroupView {
  id: string;
  groupKey: string;
  name: string;
  classroomIds: string[];
  recipients: MailingRecipient[];
  variables: Record<string, string>;
  note: string | null;
  sortOrder: number;
  sentAt: Date | null;
}

/** Dedupe by lowercased address, keeping the first (and its stated role). */
export function dedupeRecipients(
  recipients: MailingRecipient[]
): MailingRecipient[] {
  const seen = new Set<string>();
  const out: MailingRecipient[] = [];
  for (const r of recipients) {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, email: r.email.trim() });
  }
  return out;
}

/** The To-line: comma-separated, which is what every mail client accepts. */
export function recipientList(recipients: MailingRecipient[]): string {
  return dedupeRecipients(recipients)
    .map((r) => r.email)
    .join(", ");
}

// ─── Variables ───────────────────────────────────────────────────────────────

/**
 * What a template may say. Every one of these is resolved per group, which is
 * the entire point of the tool — `{{teachers}}` is Ms. Chen in one email and
 * Ms. Patel and Mr. Ruiz in the next.
 */
export const MAILING_VARIABLES = {
  group: "The group's name — “Room 12”, “1st Grade — Red & Blue”",
  classrooms: "The classroom names in this group",
  grades: "The grade levels in this group",
  teachers: "Full teacher names, e.g. “Ms. Chen and Mr. Ruiz”",
  teacher_first_names: "Just first names, for a friendly opening",
  room_parents: "Names of this group's active room parents",
  recipient_names: "First names of everyone this email is addressed to",
  room_parent_gap: "How many room parent spots are still open",
  committee_gap: "How many committee spots are still open",
  signup_link: "Your school's volunteer signup link",
  school: "Your school's name",
  sender: "Your name",
  note: "The per-group note you can write on any group below",
} as const;

export type MailingVariable = keyof typeof MAILING_VARIABLES;

/**
 * Substitute `{{name}}` values.
 *
 * An unknown variable is left standing rather than blanked: `{{principal}}` in
 * the output is a visible mistake a board member fixes before sending, while an
 * empty gap in a sentence is one they send. Whitespace inside the braces is
 * tolerated because people type it.
 */
export function mergeTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined ? match : value;
  });
}

/**
 * The same substitution, for a template that *is* HTML.
 *
 * The template's own markup is the board member's and is left alone; every
 * value merged into it is escaped. That asymmetry is the whole point: most of
 * these values are names, and `room_parents` / `recipient_names` /
 * `teacher_first_names` come from the public, unauthenticated signup form. A
 * parent who types `<img src=x onerror=…>` as their name would otherwise get
 * that markup executed in the browser of every board member who previews the
 * group — and pasted into the email itself.
 *
 * Escaping is correct in an attribute too (`href="{{signup_link}}"` still
 * resolves), so this needs no per-variable knowledge of where it lands.
 */
export function mergeTemplateHtml(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined ? match : escapeHtml(value);
  });
}

/** Escape a plain-text value for safe interpolation into HTML text or attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Which `{{names}}` a template uses, in order of first appearance. */
export function variablesUsed(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/** Variables a template uses that nothing will fill in. */
export function unknownVariables(template: string): string[] {
  return variablesUsed(template).filter(
    (name) => !(name in MAILING_VARIABLES)
  );
}

// ─── Handing off to Gmail ────────────────────────────────────────────────────

/**
 * A Gmail compose window, pre-addressed.
 *
 * Deliberately carries only `to` and `su`. The body goes via the clipboard
 * instead, for two reasons: a URL has a practical length ceiling that a real
 * message plus thirty addresses will breach, and `body` in a compose URL is
 * plain text — it would strip every link and every bit of formatting out of a
 * message whose whole job is to carry a signup link. So the send button copies
 * the formatted body and opens this; the user presses paste.
 *
 * `authuser` is deliberately not pinned. A board member signed into both a
 * personal and a school account should land in whichever Gmail they last used,
 * and guessing wrong sends the email from the wrong address.
 */
export function gmailComposeUrl(params: {
  to: string;
  subject: string;
}): string {
  const qs = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: params.to,
    su: params.subject,
  });
  return `https://mail.google.com/mail/?${qs.toString()}`;
}

/** The same, for a default mail client rather than Gmail in a browser. */
export function mailtoUrl(params: { to: string; subject: string }): string {
  const qs = new URLSearchParams({ subject: params.subject });
  return `mailto:${encodeURIComponent(params.to)}?${qs.toString()}`;
}

/** Progress through the group list, for the header and the hub card. */
export function mailingProgress(groups: { sentAt: Date | null }[]): {
  sent: number;
  total: number;
  done: boolean;
} {
  const sent = groups.filter((g) => g.sentAt).length;
  return { sent, total: groups.length, done: groups.length > 0 && sent === groups.length };
}
