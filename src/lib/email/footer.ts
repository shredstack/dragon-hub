/**
 * The block that ends every email — "Thanks again", the school's name and year,
 * and the board roster.
 *
 * It is stored as the `board_signoff` recurring section rather than as a column
 * of its own, because that is what it is: a block that gets attached to each
 * campaign at a position (last). What this module adds is the vocabulary for
 * treating that one row as *the footer* — a thing the secretary writes once —
 * instead of as row four of a list keyed `board_signoff`.
 *
 * **Snapshot, not read-through**, exactly like the header: `attachRecurringSections`
 * copies the template onto a campaign when the campaign is created, and never
 * consults it again. Rewording the footer must not rewrite the bottom of an
 * email that already went out.
 *
 * Client-safe: no db, no `server-only`, so the live preview in the browser and
 * the substitution on the server produce byte-identical HTML.
 */

export const EMAIL_FOOTER_KEY = "board_signoff";

/**
 * What a school gets before it writes its own — the wording that was hard-coded
 * in `recurring-defaults.ts` before the footer was editable, so nothing changes
 * for a school that never touches this.
 */
export const DEFAULT_EMAIL_FOOTER_HTML = `<p>Thanks again,</p>
<p>{{school_name}} PTA Board {{school_year}}</p>
{{board_roster}}`;

/**
 * Variables a footer may use. `{{board_roster}}` is the one that earns its
 * keep: it is re-rendered from `school_memberships` every time a campaign is
 * created, so a board that changes in November doesn't need every footer
 * retyped.
 */
export const EMAIL_FOOTER_VARIABLES = [
  {
    token: "{{board_roster}}",
    label: "Board roster",
    hint: "Every approved board member, two to a line, in the order your slate is arranged.",
  },
  {
    token: "{{school_name}}",
    label: "School name",
    hint: "The school's name.",
  },
  {
    token: "{{school_year}}",
    label: "School year",
    hint: "The current school year, e.g. 2026-2027.",
  },
] as const;

export interface RecurringTemplateContext {
  schoolName: string;
  schoolYear?: string | null;
  /** The roster as HTML — see `renderBoardRosterHtml`. */
  rosterHtml: string;
}

/**
 * The attribute that says "this paragraph block is the generated roster, not
 * something a person typed."
 *
 * It exists so a footer edited inside one week's email can be promoted back to
 * the template without freezing that week's board into it — see
 * `retokenizeBoardRoster`. A `<div>` survives a `contentEditable` round trip
 * where an HTML comment might not, and email clients lay it out as a plain
 * block.
 */
export const BOARD_ROSTER_MARKER = "dh-board-roster";

const BOARD_ROSTER_MARKER_RE = new RegExp(
  `<div[^>]*data-block="${BOARD_ROSTER_MARKER}"[^>]*>[\\s\\S]*?</div>`,
  "gi"
);

/**
 * Wraps rendered roster HTML in its marker.
 *
 * An empty roster still gets the wrapper — a school whose board has no
 * positions filled yet renders nothing either way, and the marker is the only
 * record of *where* the roster goes. Without it, promoting that footer back to
 * the template would drop `{{board_roster}}` for good, and the roster would
 * never appear once the board was set up.
 */
export function wrapBoardRoster(rosterHtml: string): string {
  return `<div data-block="${BOARD_ROSTER_MARKER}">${rosterHtml}</div>`;
}

/**
 * Substitutes a recurring section's template variables.
 *
 * Unknown `{{tokens}}` are left standing rather than blanked, for the same
 * reason mail merge leaves them: a visible `{{scool_name}}` gets fixed before
 * sending, an empty gap in a sentence gets sent.
 */
export function renderRecurringTemplate(
  bodyTemplate: string,
  ctx: RecurringTemplateContext
): string {
  return bodyTemplate
    .replace(/\{\{school_name\}\}/g, ctx.schoolName)
    .replace(
      /\{\{school_year\}\}/g,
      ctx.schoolYear || new Date().getFullYear().toString()
    )
    .replace(/\{\{board_roster\}\}/g, wrapBoardRoster(ctx.rosterHtml));
}

/**
 * Turns a *rendered* section body back into a template — the inverse of the
 * substitution above.
 *
 * The secretary assembles her footer in the email in front of her, where the
 * roster is already eleven real names and the year is already 2026-2027.
 * Saving that verbatim as the template would file today's board and this
 * year's year as fixed text, and both would quietly stop updating — the roster
 * the next time someone joins the board, the year every September.
 *
 * Two ways home for the roster, in order: the marker `renderRecurringTemplate`
 * left behind, and — for a footer attached before markers existed — the
 * roster's exact current HTML. `rosterLinked` reports whether the result still
 * tracks the board, so the UI can say so rather than leaving her to find out in
 * November.
 *
 * The school name and year are plain text with no marker to find, so they go
 * back by value. Putting the token back where the current value stands is safe
 * either way: it renders identically today, and correctly next year.
 */
export function retokenizeRecurringTemplate(
  body: string,
  ctx: RecurringTemplateContext
): { bodyTemplate: string; rosterLinked: boolean } {
  let bodyTemplate = body;

  if (BOARD_ROSTER_MARKER_RE.test(bodyTemplate)) {
    // `test` on a /g regex advances lastIndex; reset before replacing.
    BOARD_ROSTER_MARKER_RE.lastIndex = 0;
    bodyTemplate = bodyTemplate.replace(
      BOARD_ROSTER_MARKER_RE,
      "{{board_roster}}"
    );
  } else if (ctx.rosterHtml.trim() && bodyTemplate.includes(ctx.rosterHtml)) {
    bodyTemplate = bodyTemplate.replace(ctx.rosterHtml, "{{board_roster}}");
  }
  BOARD_ROSTER_MARKER_RE.lastIndex = 0;

  if (ctx.schoolYear?.trim()) {
    bodyTemplate = replaceAllLiteral(
      bodyTemplate,
      ctx.schoolYear,
      "{{school_year}}"
    );
  }
  if (ctx.schoolName.trim()) {
    bodyTemplate = replaceAllLiteral(
      bodyTemplate,
      ctx.schoolName,
      "{{school_name}}"
    );
  }

  return {
    bodyTemplate,
    rosterLinked: bodyTemplate.includes("{{board_roster}}"),
  };
}

/** `String.replaceAll` on a literal, without needing a regex-escaped needle. */
function replaceAllLiteral(
  haystack: string,
  needle: string,
  replacement: string
): string {
  return haystack.split(needle).join(replacement);
}
