# DragonHub

DragonHub is a PTA (Parent Teacher Association) web application for school communities. It helps with classroom coordination, volunteer hour tracking, budget transparency, fundraiser progress, and institutional knowledge sharing.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: Neon (Serverless PostgreSQL)
- **ORM**: Drizzle ORM
- **Auth**: NextAuth.js with email magic links
- **Deployment**: Vercel
- **External APIs**: Google Calendar, Google Sheets, Google Drive

## Project Structure

```
src/
├── actions/          # Server actions for mutations
├── app/
│   ├── (app)/        # Authenticated app routes
│   ├── (auth)/       # Auth routes (sign-in, verify)
│   └── api/          # API routes (auth, cron jobs, drive)
├── components/
│   ├── ui/           # Reusable UI components
│   ├── classrooms/   # Classroom-specific components
│   ├── event-plans/  # Event planning components
│   └── budget/       # Budget display components
└── lib/
    ├── db/           # Database schema and connection
    ├── auth.ts       # Authorization helpers
    ├── sync/         # Google API sync logic
    └── google.ts     # Google API client setup
```

## Key Patterns

### Authentication & Authorization

- **Authentication**: Handled by NextAuth.js with email magic links
- **Authorization**: Application-level, enforced in server actions via helpers in `src/lib/auth.ts`
- **Roles**: `volunteer`, `room_parent`, `teacher`, `pta_board` (defined in schema as enum)
- **School scoping**: Users belong to a school; data is isolated by school

### Data Fetching

- **Server Components**: Primary method for data fetching
- **Server Actions**: Used for all mutations (in `src/actions/`)
- **No React Query**: This app uses Next.js patterns, not client-side data fetching libraries

### Database

- **Schema**: Defined in `src/lib/db/schema.ts`
- **Migrations**: Located in `drizzle/`, managed with Drizzle Kit
- **Connection**: Via `src/lib/db/index.ts`

Run migrations:
```bash
npx drizzle-kit generate  # Generate migration from schema changes
npx drizzle-kit push      # Push to database (dev)
npx drizzle-kit migrate   # Run migrations (prod)
```

IMPORTANT: Always use `npx drizzle-kit generate` to create new migrations. Then, even in dev, we should be able to run migrations in the same way as production using `npx drizzle-kit migrate`.

Migrations are synced in Neon in the table `"__drizzle_migrations"`.

**Manual migrations**: If you need PostgreSQL-specific syntax that Drizzle can't generate (e.g., `tsvector`, GIN indexes, custom functions), you must manually:
1. Create the SQL file in `drizzle/` with the next sequence number (e.g., `0011_my_migration.sql`)
2. Add an entry to `drizzle/meta/_journal.json` with the matching tag and incremented idx

### External Data Sync

Google data is synced via Vercel Cron jobs:
- `/api/cron/sync-calendar` - Syncs Google Calendar events (every 6 hours)
- `/api/cron/sync-budget` - Syncs budget data from Google Sheets (daily)
- `/api/cron/sync-fundraisers` - Syncs fundraiser data (every 12 hours)

Cron jobs are secured with `CRON_SECRET` environment variable.

## Main Features

1. **Classrooms** (`/classrooms`) - Room parent coordination with message boards and task lists
2. **Volunteer Hours** (`/volunteer-hours`) - Self-service hour logging with PTA board approval
3. **Calendar** (`/calendar`) - Aggregated view from Google Calendar
4. **Budget** (`/budget`) - Dashboard synced from Google Sheets
5. **Fundraisers** (`/fundraisers`) - Progress tracking for school fundraisers
6. **Knowledge Base** (`/knowledge`) - Searchable library linking to Google Drive docs
7. **Our Events** (`/events`) - The school's front window onto the event catalog: browse, react, raise a hand, ask to join a planning team
8. **Event Planning** (`/events/plans`) - Collaborative event planning with tasks and resources
9. **Board Onboarding** (`/onboarding`) - Role-aware onboarding hub for PTA board members

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio
npm run db:seed:demo # Rebuild the App Store reviewer's demo school (idempotent)
npm run preflight:ios # Check the iOS project before archiving
```

## Environment Variables

Required in `.env.local`:
```
DATABASE_URL=           # Neon connection string
AUTH_URL=               # App origin, e.g. https://dragonhub.shredstack.net
AUTH_SECRET=            # Auth secret

# Google APIs
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
BUDGET_SHEET_ID=
CALENDAR_IDS=           # Comma-separated

# Cron security
CRON_SECRET=
```

Optional, each all-or-nothing — the feature is off (and its button hidden) until
every variable in its group is set. See `src/lib/auth-providers.ts`.

```
# Google sign-in
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Sign in with Apple. AUTH_APPLE_ID is the Services ID, NOT the bundle ID.
# The client secret is a JWT signed at runtime from the .p8 — never paste one.
AUTH_APPLE_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=

# App Store / Play reviewer sign-in. Run `npm run db:seed:demo` after setting.
DEMO_LOGIN_EMAIL=
DEMO_LOGIN_PASSWORD=

# Push. APNS_PRODUCTION must be "true" for TestFlight/App Store builds, and
# the aps-environment entitlement must agree.
APNS_KEY_ID=  APNS_TEAM_ID=  APNS_BUNDLE_ID=  APNS_PRIVATE_KEY=  APNS_PRODUCTION=
FIREBASE_PROJECT_ID=  FIREBASE_CLIENT_EMAIL=  FIREBASE_PRIVATE_KEY=

# Where a parent (or an App Store reviewer) writes for help. Both default to
# the platform owner's inbox in src/lib/support-contact.ts; set them only to
# redirect. NEXT_PUBLIC_ because they are printed on the public legal pages and
# on the consent block of client-rendered signup forms.
NEXT_PUBLIC_SUPPORT_EMAIL=
NEXT_PUBLIC_PRIVACY_EMAIL=
```

Android also needs `android/app/google-services.json` in the repo working tree
(gitignored). **FCM is completely inert without it, with no error** — see
`mobile-shell/README.md`.

`AUTH_URL` is the public origin of the app, and every externally-shared URL is
built from it via `getAppBaseUrl()` (`src/lib/magic-link.ts`) — magic links, QR
codes for volunteer/committee/hunt signups, and invite emails. Auth.js v5
resolves it as `AUTH_URL ?? NEXTAUTH_URL`, and `getAppBaseUrl()` deliberately
matches that precedence so the two can never point at different hosts.
Production currently sets only `NEXTAUTH_URL`; either name works, but don't set
both to different values.

## Important Considerations

### Authorization Checks

Always verify authorization in server actions:
```typescript
import { assertPtaBoard, assertClassroomMember } from "@/lib/auth";

// For PTA-only actions
await assertPtaBoard(session.user.id);

// For classroom-scoped actions
await assertClassroomMember(session.user.id, classroomId);
```

### Database Migrations

- Never use `DROP` or `DELETE` without careful review
- Add indexes for columns used in WHERE clauses
- Consider data backfill for new NOT NULL columns
- Test migrations on a copy of production data when possible

### UI Components

Reusable components live in `src/components/ui/`. Check there before creating new basic components. Follow the controlled component pattern with `value`/`onChange` props.

### Emoji

There is **one** emoji chooser, `EmojiPicker` (`src/components/ui/emoji-picker.tsx`),
and every surface that stores an emoji uses it — classrooms, scavenger hunt
items, committees, important links, and the recurring event catalog (through
`IconPicker`, which layers an uploaded image over the same control). Don't
hand-roll another palette; pass `suggestions` if a surface wants its own
one-tap shortlist.

- **The full keyboard lives behind "Browse all"** — `EmojiBrowser`, searchable
  and grouped the way a phone's picker is. Its dataset is
  `src/lib/emoji-data.ts`: **generated, ~130KB, never imported statically.**
  The browser pulls it in with a lazy `import()` so a page that renders a
  picker nobody opens pays nothing. Regenerate with
  `node scripts/generate-emoji-data.mjs`, which reads Unicode's `emoji-test.txt`,
  drops skin-tone variants, and stops at E15.0 — an emoji the reader's OS font
  doesn't have renders as a tofu box.
- **`onChange` reports a `source`**: `"pick"` for the palette and the browser,
  `"input"` for typing. `IconPicker` needs the distinction — picking an emoji
  means dropping the image it would otherwise sit behind, typing beside one
  doesn't.
- **Narrow on the way in with `normalizeEmoji()`** (`src/lib/emoji.ts`) in the
  server action, not just in the form. The box takes free text, and the picker's
  warning is a courtesy, not a gate.

An event's icon is set **once, on the recurring event**, and every year's plan
inherits it: Our Events, `/events/plans`, the plan header, and the catalog all render
`EventIcon` (`src/components/events/event-icon.tsx`) off
`event_catalog.icon_emoji` / `image_url`, joined through
`event_plans.event_catalog_id`. Event plans deliberately have no icon column of
their own — Field Day should not be able to look like two different events in
two different years, and a one-off plan falls back to the generic clipboard.

### Mobile Responsiveness

This app must work on both desktop and mobile devices. Follow these patterns:

#### Layout Patterns
- **Viewport height**: Use `min-h-dvh` or `h-dvh` instead of `h-screen` (accounts for mobile browser chrome)
- **Flex direction**: Use `flex-col sm:flex-row` for layouts that should stack on mobile
- **Fixed heights**: Use `h-[Xdvh]` with `max-h-[value]` and `min-h-[value]` instead of fixed pixel heights

#### Responsive Patterns
- **Grids**: Use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- **Padding**: Use `p-4 lg:p-6` for responsive spacing

#### Responsive Tables (Card-on-Mobile Pattern)

Tables with 4+ columns should use the **card-on-mobile pattern**: show cards on mobile (`md:hidden`) and tables on desktop (`hidden md:block`).

```tsx
{/* Mobile card view */}
<div className="space-y-3 md:hidden">
  {items.map((item) => (
    <div key={item.id} className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">{item.email}</p>
        </div>
        <Actions item={item} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {/* Badges, secondary info */}
      </div>
    </div>
  ))}
</div>

{/* Desktop table view */}
<div className="hidden rounded-lg border border-border bg-card md:block">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      {/* Standard table markup */}
    </table>
  </div>
</div>
```

**Guidelines:**
- Use `md:` breakpoint (768px) as the switch point
- Mobile cards should show primary info prominently, secondary info below
- Keep actions accessible (top-right corner or below content)
- For simpler tables (3 columns), `overflow-x-auto` alone may suffice

#### Avoid
- `justify-between` without considering mobile overflow (add `flex-wrap` or stack with `flex-col sm:flex-row`)
- Fixed pixel heights for content containers (use viewport-relative units)
- Inline elements that may overflow (wrap or make scrollable)
- Tables with 4+ columns that only use `overflow-x-auto` (use card-on-mobile pattern instead)

### Board Positions

Board positions are **per-school data**, not a fixed enum. Each school owns its
slate in `board_positions` and manages it at `/admin/board/positions`: rename a
position, write a description, reorder, deactivate one it doesn't fill, or add
its own (a teacher representative, a hospitality chair).

Every table that names a position stores a **slug** (`"treasurer"`,
`"teacher_rep"`) in a `text` column — not a FK. That is deliberate:
`state_onboarding_resources` and `district_onboarding_resources` are
super-admin-managed and *not* school-scoped, so a FK into a school-scoped table
could not express "this state resource is for Treasurers."

Consequences when touching this area:

- **Slugs are immutable.** Renaming a position edits its label; the slug stays,
  because it is what every handoff note, guide and resource is filed under.
- **Retire by deactivating, not deleting.** Inactive positions drop out of
  pickers but keep resolving to a real label on historical records. Deleting is
  blocked for the standard slate and for anything still referenced.
- **Never render a position from a static map.** Use
  `getBoardPositionLabels(schoolId)` / `getBoardPositionLabel()` from
  `@/lib/board-positions` in server components and pass the result to client
  components, which resolve it with `positionLabel()` from
  `@/lib/board-positions-shared`. `PTA_BOARD_POSITIONS` in `constants.ts` is
  deprecated and correct only where no school is in scope (super admin screens).
- **New schools are seeded** with the standard slate from
  `STANDARD_BOARD_POSITIONS`; `getBoardPositionsWithSeed()` backfills lazily on
  read paths.
- AI guide generation grounds standard positions in a curated `ROLE_CONTEXT`
  blurb and school-defined ones in the description the school wrote.

### Onboarding System Architecture

The board onboarding feature uses a **regional resource hierarchy**:
1. **School-specific resources** (`onboarding_resources`) - Highest priority, managed by school admins
2. **District resources** (`district_onboarding_resources`) - Managed by super admins, automatically surfaced for schools in that district
3. **State resources** (`state_onboarding_resources`) - Managed by super admins, automatically surfaced for schools in that state

Resources from all three levels are combined and displayed to users, with source badges indicating origin. School admins can "import" regional defaults as school-specific copies if they want to customize them.

**AI Guide Generation** (`src/actions/onboarding-guides.ts`):
- Gathers context from: handoff notes (up to 3 years), Knowledge Base articles, indexed Drive files
- Uses position-specific keywords for search relevance
- Generates structured content: overview, responsibilities, first-week checklist, monthly calendar, contacts, tips, resources
- Can publish generated guide as a Knowledge Base article

**Event Catalog** (`src/actions/event-catalog.ts`):
- Events can be manually created or auto-generated from completed event plans
- Board members express interest levels: "lead", "help", or "observe"
- Interest data helps admins coordinate event assignments

### Our Events: One Catalog, Two Audiences

`event_catalog` is both the board's filing cabinet and the school's front
window. `/events` (Our Events) is the window; `/admin/board/event-catalog` and
`/onboarding/events` are the cabinet. Four rules keep them apart.

- **The member view is a projection, never a spread.** `getCatalog()` returns
  `...entry` — every column, `tips` and `estimatedBudget` and
  `sourceEventPlanIds` included — and keeps its `assertPtaBoard`. The member
  path (`src/actions/event-directory.ts`) is a *separate* function with an
  explicit `columns:` list, precisely so that adding a column to
  `event_catalog` later cannot silently publish it to the school.
  `src/lib/event-directory-shared.ts` is the readable form of that boundary.
  Plan status is filtered too: members see "planning has started" for
  `approved` / `pending_approval` / `completed` and nothing at all for `draft`
  or `rejected`.
- **Three verbs, deliberately kept apart.** *React* (an emoji, public in
  aggregate, no obligation), *raise a hand* (`event_interest`, a private signal
  to the board, instant because it grants nothing), and *ask to join planning*
  (`event_help_requests`, a **request**, because it is the only one that grants
  access — the plan's board, tasks, vendor contacts and reimbursements).
  Conflating the last two is the mistake to avoid. Reactions and hand-raises
  **never** notify anybody.
- **This is the third waitlist, and it brought none of its own.** Everything a
  parent or board member reads comes from `waitlist-shared.ts`; positions and
  queue order come from `waitlist.ts`; the tables are `WaitlistTable` /
  `WaitlistPanel`. The only new logic is `promoteFromEventHelpWaitlist`
  (`src/lib/event-help-onboarding.ts`), a deliberate *sibling* of the committee
  sweep rather than a generalization of it. `event_catalog.help_cap` is per
  event and **null means uncapped, which is never full**. A seat is the
  `event_plan_members` row, and because that row is ON DELETE **CASCADE**,
  `releaseSignupSeatsForUser()` releases it first — otherwise the seat frees and
  the line never moves.
- **Reactions store the grapheme, not a slug**, and that is not a violation of
  the Category Sets rule: an emoji has no label to rename, and a slug table
  would make custom reactions impossible. Narrow with `canonicalizeReaction()`
  (`src/lib/event-reactions-shared.ts`), which strips skin tones and adds U+FE0F
  so `❤` and `❤️` are one count. Never import `emoji-data.ts` on these surfaces.

Two other things a change here can break:

- **`/events/[slug]` carries a UUID shim.** `/events/<uuid>` is in historical
  `notifications.url` rows and in every email the app has sent; the plan moved
  to `/events/plans/[id]`, so the slug page redirects a UUID there. Catalog
  slugs are `slugify()`d titles and unique per school, so they cannot collide.
- **`schools.event_directory_settings`** follows the `moduleVisibility`
  precedent — missing column and missing key both mean the default, so no
  backfill. Read it through `getEventDirectorySettings(schoolId)`.
  `showReactorNames` is checked **on the server, in the projection**: names are
  absent from the response when it's off, because a setting enforced in the
  component is a CSS rule. Role badges (`<PersonBadges>`) stay board-side under
  every setting.

### Knowledge Base Audiences

Knowledge Base articles are **shared by role**, via `knowledge_article_audiences`
(see `src/lib/knowledge-audience.ts` for the rules and
`src/lib/knowledge-audience-shared.ts` for the client-safe types).

**The default is fail-closed: an article with no audience rows is visible to the
PTA Board and school admins only.** Sharing is always a deliberate act —
"Everyone at the school" is a grant you check in the picker, not the absence of
one. This is why articles created by AI extraction (`saveExtractedArticles`,
onboarding guide publishing) are board-only until someone shares them.

Three audience types, which OR together:

| Type | Matches |
|---|---|
| `everyone` | Any approved member of the school |
| `volunteer_role` | `room_parent` / `party_volunteer`, from active `volunteer_signups` in the current year |
| `committee` | Members of one committee, from `committee_members` |

A user may hold several at once (a room parent who is also on the Yearbook
Committee), which is why grants are additive rows rather than a single column.

Consequences to keep in mind when touching this area:

- **Non-board users only ever see `published` articles.** Drafts and archived
  articles are board-only regardless of audience.
- **Authoring is board-only.** `createArticle` / `updateArticle` /
  `publishArticle` / `archiveArticle` all assert board or school admin — a
  member-authored article would default to board-only and be invisible to its
  own author.
- **Uploads reach a role by being attached to an article**
  (`drive_file_index.knowledge_article_id`). The article's audience is the only
  thing deciding who can open the file; there is no second permission model.
  `/knowledge/documents` remains a board-only index.
- **The AI Q&A ("Ask DragonHub") is board/school-admin only** and therefore
  bypasses audience filtering entirely — the board sees everything anyway. If
  Q&A is ever opened up beyond the board, `semanticSearch` will need audience
  filtering before that ships.
- Committees surface their own articles on a **Resources tab** in the committee
  workspace, scoped to grants naming that committee.

### Important Links

The board curates a short list of destinations every family needs
(`important_links`, managed at `/admin/board/links`), rendered directly under
the hero on the dashboard. It is the one dashboard panel that isn't a task, and
it deliberately outranks the user's to-do list.

- **Every link stores an `open_mode`**: `new_tab` (the default and the only one
  guaranteed to work) or `in_app`, which frames the destination in a dialog over
  the dashboard. A site that sends `X-Frame-Options: DENY` refuses to render and
  gives cross-origin JS no way to detect it, so the dialog keeps a permanent
  "Open in new tab" escape hatch rather than pretending to detect failure. The
  admin form defaults the mode from `isLikelyEmbeddable()` — a whitelist of the
  Google hosts a PTA links to constantly, not a general test.
- **URLs go through `normalizeLinkUrl()`** before they are stored. It adds a
  missing `https://` and rejects anything that isn't http(s) — these links are
  rendered as `href`s for every family at the school, so a `javascript:` URL
  would be stored XSS.
- **`linkPreviewUrl()`** rewrites Google Docs/Drive/Forms and YouTube URLs to
  their embeddable variants; the `/edit` URL a board member copies out of their
  address bar will not frame.
- Helpers live in `src/lib/links-shared.ts` (client-safe) so the dashboard card
  and the admin form share one set of rules;
  `src/lib/important-links-shared.ts` re-exports them alongside the
  `ImportantLink` type.

### Board-Entered Links Anywhere Else

The same two questions come up wherever someone can paste a URL, so they have
one answer each and three shared pieces. Use these rather than writing another
`<a target="_blank">`:

- **`SmartLink`** (`src/components/ui/smart-link.tsx`) renders the link the way
  it was configured — anchor for `new_tab`, framed dialog for `in_app` — and
  applies `normalizeLinkUrl` itself, rendering nothing at all for a URL that
  isn't a web address. `LinkPreviewDialog` underneath it is for a list that
  shares one dialog.
- **`LinkOpenModeField` / `LinkOpenModeBadge`**
  (`src/components/ui/link-open-mode-field.tsx`) are the admin-side choice and
  its summary badge. Default the value with `defaultOpenModeFor(url)` on change
  instead of hard-coding a mode.
- **Storing it** means a `link_open_mode` text column (or a key in a settings
  JSON blob) read back through `parseLinkOpenMode()`, which falls back to
  `new_tab` — the mode that always works — for anything unrecognized.

Current users: important links, scavenger hunt items
(`scavenger_hunt_items.link_open_mode`), and the volunteer eligibility reminder
(`schools.volunteer_settings.eligibility.openMode`). Email surfaces ignore the
mode entirely — there is no in-app anything in an inbox.

### The Weekly Email Assembles Itself

`/emails` is the secretary's tool, and the thing it optimizes for is that she
writes next week's email on a Thursday afternoon and should not have to
remember anything. Four rules carry that.

- **Content arrives on a window, not in a queue.** A submission carries
  `start_date` and `end_date` — both NOT NULL — and lands in every campaign
  whose week overlaps that window. The submitter is the one who knows the
  spirit night is on the 12th, so the dates are asked of them. Overlap, not
  containment: a one-day event mid-week and a month-long fundraiser spanning it
  are both this week's news. `isContentRelevantToWeek`
  (`src/lib/email/content-window.ts`) is the client-safe form of the same test
  `relevantContentFilter` runs in SQL.
- **Inclusion never consumes an item.** Nothing writes `status = 'included'` any
  more — an item whose window spans a month belongs in all four of that month's
  emails. `status = 'pending'` is the eligibility gate, `skipped` is the
  secretary marking something no longer relevant, and `included_in_campaign_id`
  is a record of where it last went, not a lock. Deleting a *section* takes it
  out of one email; only `skipped` takes it out of the run.
- **"Already in this email" is `email_sections.source_content_item_id`, and
  nothing else.** Because the inbox is a list of what arrived rather than a
  queue that empties, every surface that can add an item must ask that column
  first: `attachRelevantContent` filters on it, `includeContentInCampaign`
  hands back the existing section instead of a second copy, and the inbox
  renders "In this email" in place of an Add button. It is also why the AI
  generator returns a `contentItemId` per section — a drafted section that
  didn't record where it came from is one "Check submissions" away from
  duplicating itself in front of families.
- **Every path builds the same email.** Blank, cloned, and AI-drafted all run
  `attachRelevantContent` then `attachRecurringSections`, in that order —
  recurring positions are relative, so "last section" is meaningless before the
  content is in. `attachRecurringSections` is idempotent by `recurring_key`,
  which is what lets a clone keep the footer it copied and still pick up a
  recurring section added since. There is exactly one implementation of "the
  board roster goes last"; the AI path used to have its own and blank emails
  had none, which is how they shipped without a sign-off.
- **The footer is the school's, and it is a snapshot like the header.** The
  block that ends every email is the `board_signoff` recurring section, written
  at `/emails/settings` through `EmailFooterEditor` and seeded lazily by
  `ensureBoardSignoffSection`, so a school that never opened that page still
  signs off. Saving it changes the emails created *from now on*; the campaign
  already on screen keeps the copy it was created with. That is why the section
  editor grew **"Use for future emails"** — the same button, for the same
  reason, as the one on the header — and why the promotion runs
  `retokenizeRecurringTemplate` (`src/lib/email/footer.ts`) instead of storing
  what it was handed: the body in the editor has the roster expanded into real
  names and the year spelled out, so saving it verbatim would freeze this
  year's board and this year's year into every future email. The
  `data-block="dh-board-roster"` wrapper is how the roster is found again, and
  is emitted even for an empty board — otherwise a school whose slate isn't
  filled in yet would lose `{{board_roster}}` the first time it promoted a
  footer, and never get the roster at all.
- **AI suggests; it never overwrites.** `reviewEmailDraft` reads the draft and
  returns notes (Haiku — cheap, high-volume, low-judgment, and note that Haiku
  4.5 predates `output_config.effort`, so don't pass it). It writes nothing.
  The old "Regenerate" button, which replaced every hand-edited section, is
  gone deliberately and should not come back.

Three smaller things a change here can break:

- **An image's size belongs to the placement, not to the file.** The same
  banner in the media library is a full-width hero on the back-to-school email
  and a small mark beside a two-line reminder the week after, so the width is a
  slug on `email_sections.image_width` / `email_campaigns.header_image_width` /
  `email_recurring_sections.image_width` — never on `media_library`, and never
  a second upload. `src/lib/email/image-width.ts` is the one slate, and
  `ImageSizeField` is the one picker; the section editor, the header editor and
  the recurring defaults all use it, as they do for `image-position.ts`. The
  number lands in the `width` **attribute** rather than the style block because
  Outlook lays out from the attribute and ignores a CSS width — which is also
  why the sizes are a fixed slate against the 558px column instead of a free
  pixel box. `parseImageWidth()` takes its fallback explicitly, since the two
  surfaces disagree about what unset meant: a section was 500px and a header
  banner was 558px, and every pre-existing row must keep rendering as it did.
- **The header is a snapshot, not a read-through.** `email_campaigns.header_*`
  is copied from `schools.email_settings` at creation. Rewording the school
  default must not rewrite the header on an email that already went out, which
  is also why "use for future emails" is a separate button from "save".
  `null` means "never customized" and renders the built-in greeting; `""` is a
  deliberately blank header. See `src/lib/email/header.ts`.
- **An empty body is a legitimate body.** A section can be a headline and an
  image. `normalizeEditorHtml` collapses the `<br>` / `<p><br></p>` /
  `&nbsp;` residue a `contentEditable` leaves behind, so deleting the text is
  how you get no text — and new sections are seeded with `""`, never with
  placeholder copy that ships when nobody notices it.

### Group Mailings Are Drafted, Never Sent

`/admin/mailings` writes one message and addresses it to many small groups — the
room parent onboarding email that goes to each classroom separately, the note to
the teachers whose rooms are still short of volunteers. **DragonHub does not send
any of it.** A board member sends from their own Gmail, because a note from the
VP of room parents should arrive from her and the replies belong in her inbox.

That one fact shapes everything else:

- **`mailing_groups.sent_at` is a bookmark, not a receipt.** Nothing observed a
  send; a board member ticked a box. Every surface says "marked sent" for that
  reason, and `resetMailingProgress` exists so the same mailing runs again next
  term.
- **A relay changes the To line and nothing else.** Many schools have stopped
  letting the PTA email families directly — everything goes through the office
  and out on ParentSquare. `mailings.relay_to` / `relay_name` address the email
  to that person; the audience is still built, still counted, and still shown,
  because reproducing it at the other end is the office's whole job and
  DragonHub is the only thing that knows who it is. That is why the audience
  travels as `{{audience_emails}}` / `{{audience_count}}` and a copy button
  beside the To field, and why nothing filters the recipient list down to the
  relay. `renderGroup` is where the two diverge (`to` vs `audienceTo`); a blank
  `relay_to` is the ordinary behaviour. Pair it with the `single` grouping —
  one email, one audience, one roster pack.
- **The handoff is clipboard + compose URL.** `gmailComposeUrl()` carries only
  `to` and `su`; the body goes via the clipboard as both `text/html` and
  `text/plain`. A compose URL's `body` is plain text and would strip the signup
  link out of the one email that exists to deliver it, and a real message plus
  thirty addresses overruns what a URL can carry. `authuser` is deliberately
  unpinned — guessing wrong sends from the wrong account.
- **Groups are stored, not derived.** Someone works down thirty rooms across two
  sittings while parents keep signing up. `rebuildMailingGroups` therefore
  preserves `sent_at` and the hand-written `note` for any group whose
  `group_key` is unchanged, and drops groups that no longer match.
- **`recipients` is a snapshot.** A parent who signs up on Thursday must not
  appear to have received Tuesday's email.

The audience is three orthogonal questions in `src/lib/mail-merge-shared.ts` —
how to split (`MAILING_GROUPINGS`), who inside each group
(`MAILING_RECIPIENT_ROLES`), and which rooms count at all
(`MAILING_COVERAGE_FILTERS`). Coverage is the reason this isn't a checkbox list
of rooms: "email the teachers whose rooms still have nobody" is a standing job,
and the set changes daily. `dli_grade` combines a grade's Red and Blue rooms
into one email; `dli_split` is exactly two emails for an all-school note.

- **Attachments can't ride the clipboard.** Per-group rosters are generated by
  the *same* code as the classroom roster export (`buildClassroomRosterFilters`
  + `buildMemberExport`, once per room in the group), and static uploads live in
  `mailing_attachments`. Both are download buttons, and the panel says so rather
  than implying the file travels with the copied body. The roster downloads in
  two shapes — see below — and, for a group covering several rooms, in **two
  packagings**: one PDF with a page per room (`exportMailingGroupRosterPdf`) for
  an email about that group, and one PDF *per room* zipped
  (`exportMailingGroupRosterZip`) for an office that posts each room's sheet to
  that room. A room with nothing on its sheet at all is left out of the zip and
  **named in `skipped`** — a pack that quietly holds 24 files at a 28-room
  school is the failure to avoid. Rendering is sequential on purpose: thirty
  concurrent `@react-pdf` renders is how a serverless function runs out of
  memory rather than how it finishes sooner.
- **Unknown `{{variables}}` are left standing**, never blanked — a visible
  `{{teacherz}}` gets fixed before sending; an empty gap in a sentence gets sent.
- Teacher name variables prefer the **linked account's own name**, then the one
  the board typed, then the bare address. That fallback matters more here than
  on any admin screen: this one puts it in the greeting of an email to families.

### Rosters: Grid or Document

An export answers one of two questions, and they want different files. "Give me
the data" is a **grid** — `MemberExportResult.rows`, every cell a string,
straight into `toCsv`. "Give me the sheet I hand a teacher" is a **document** —
sections, coverage lines, a disclaimer in the footer. The classroom roster and
the mailing-group roster each offer both; the board's school-wide member export
offers only the grid, because a 400-row directory has no document shape.

One query serves both. `buildMemberExport` emits `assignments` alongside `rows`
— the same matched records with `type` and `status` as **slugs**, since
grouping on the display label `"Room Parent"` breaks the day someone rewords it.
`classroom-roster-document.ts` (client-safe) regroups those into a
`RosterDocument`; `src/lib/pdf/classroom-roster-pdf.tsx` is the only file in the
app that imports `@react-pdf/renderer`, and it decides nothing except how the
page looks.

- **The PDF overrides three things** (`rosterPdfFilters`): assignment format
  always, unfilled seats and every status always — "1 of 2 spots filled" is what
  the room parent VP reads the sheet for — and teachers added back to whatever
  types were asked for, because whose room it is belongs to the room's identity
  rather than to the filter. The column checkboxes are CSV-only and say so.
- **One page per room, one file.** A DLI grade's mailing goes out as one email;
  two attachments would be two chances to forget one.
- **It travels as base64 through the server action** and downloads via
  `downloadBase64`, the same anchor-and-revoke path `downloadCsv` takes. A
  streaming route handler would be tidier and is exactly what the native shell's
  WebView handles worst.
- `serverExternalPackages` in `next.config.ts` keeps the renderer out of the
  bundler. It carries its own font and layout engines; nothing client-side may
  import it, which is what the `server-only` import enforces.

### Notifications

Everything that tells a person something happened goes through **one function**:
`notify()` in `src/lib/notify.ts`. Nothing else writes `notifications`, and
nothing else calls `src/lib/push.ts`. Push is a *delivery channel* for an inbox
row, not a parallel system — a phone with notifications off still fills the
inbox, which is why the table exists rather than firing APNs and forgetting.

- **Types are a category set** (`NOTIFICATION_TYPES` in `constants.ts`), so the
  **slug is stored**, the column is `text` not a `pgEnum`, and adding a type
  needs no migration. `notification_preferences` is sparse — a missing row means
  "use the type's `defaults`" — so it needs no backfill either. That is also why
  "Reset to defaults" *deletes* rows rather than writing today's values.
- **Call it from `after()`**, never inline:
  ```ts
  await db.insert(committeeMessages).values({ ... });
  after(() => notify({ ... }));
  revalidatePath(`/committees/${committeeId}`);
  ```
  APNs is a third-party network with third-party latency, and a waitlist
  promotion must not be able to fail because Apple is having an afternoon.
  `notify()` additionally never throws.
- **`groupKey` collapses.** An unread row with the same `(user_id, group_key)`
  is rewritten in place with a bumped count, arbitrated by a partial unique
  index (migration `0070`) — so a board with eleven overnight posts is one inbox
  row and one push. Once *read*, the next post starts a fresh row. Omit the key
  for anything that must never merge (a mention).
- **Recipients come from `src/lib/notify-recipients.ts`**, and two rules there
  are load-bearing. A restricted post (`room_parents_only`, `chairsOnly`)
  notifies only who can read it — a push carries the message body to a lock
  screen, so notifying someone who cannot open the thread is a disclosure bug.
  And **virtual members are deliberately excluded**: school admins are members
  of every classroom in the auth helper, which is right for access and wrong for
  notification. Recipients come from real roster rows only.
- **A mention replaces the board's `*_message` for that person**, never adds to
  it. Two notifications for one post is the fastest way to get push switched off.
- `url` must be a **relative path**; `notify()` drops anything else, because the
  value becomes a push `url` the native shell navigates to.

### Purchase Surfaces and the Native Shell

The iOS and Android apps are Capacitor shells pointing a WebView at
`dragonhub.shredstack.net`. There is no separate mobile build — **the website
is the app**, so every page the web renders is also a page inside a store
build. That makes one rule load-bearing:

**Anything transactional must be gated on `await isNativeShell()`**
(`src/lib/native-shell.ts`). A price, a "Subscribe" or "Upgrade" button, a link
to a checkout or a pricing page — Apple Guideline 3.1.1 and Play's payments
policy both forbid steering a user to an outside purchase from inside the app,
and rejection under 3.1.1 is a *listing* problem, not a code one.

What stays allowed inside the shell is the *statement*, without the door:
"Ask DragonHub is part of your school's plan — your PTA board can check your
school's status" is fine; the same sentence with a "View pricing" link is not.

- **Server components**: `await isNativeShell()` from `@/lib/native-shell`.
- **Client components**: take a boolean prop resolved on the server, or use
  `isNativeShellUserAgent()` from `@/lib/native-shell-shared` against
  `navigator.userAgent`. Both read `NATIVE_SHELL_UA_TOKEN` from the shared
  module, matching the `appendUserAgent` value in `capacitor.config.ts`, so the
  two halves cannot drift.
- **It is a rendering hint, never an authorization check.** A user agent is
  client-controlled. It decides what to show, not what to allow.

There is no purchase UI in the app today. This section exists so the person who
adds the first plan banner reaches for the helper instead of discovering the
rule from a rejection email.

### Calendar Days vs Instants

A task due August 17 is due August 17 for everybody. It has no clock time and
no time zone, and the moment it is treated as one it moves: `new Date("2026-08-17")`
is midnight **UTC**, which is 6pm on the *16th* in Denver. Vercel runs in UTC and
a parent's phone does not, so the same due date rendered on the server and in the
browser disagreed with each other and with the form that set it.

So every value that means *a day* goes through **`src/lib/date-only.ts`**, which
parses and formats against UTC and is therefore immune to the runtime's zone:

- **Reading**: `formatDateOnly` ("Aug 17, 2026"), `formatLongDateOnly`,
  `formatWeekdayDateOnly`, `formatShortDateOnly`, `formatDateOnlyRange`.
  `formatDate()` in `utils.ts` is a thin alias for the first and stays, because
  every one of its callers was already a calendar day.
- **Writing**: `parseDateOnly()` for the `timestamptz` columns that hold a day —
  never `new Date(formValue)`. It anchors at **noon** UTC, which is invisible to
  the formatters above but keeps any surface they haven't reached (an email
  template, a stray `toLocaleDateString`) on the right day anywhere from UTC-11
  to UTC+11. A deadline — an expiry, a signup close — uses `endOfDateOnly()`
  instead, because "expires Aug 17" must not stop working on the 16th.
- **Inputs**: `toDateOnly()` produces the `YYYY-MM-DD` a date input wants, from
  either a `Date` or a string, so a form prefill can't drift from its display.
- **"Today"** is `todayDateOnly(timeZone)`, and server callers must pass the
  school's zone from `getSchoolTimeZone()` — on Vercel a Denver school is
  already tomorrow from 6pm onward.
- Day arithmetic is `addDaysToDateOnly()` / `compareDateOnly()`, which work in
  UTC and so have no DST to land in.

Anything with a **real clock time** is an instant, not a day — `created_at`, a
committee schedule slot, a Google Calendar event — and belongs in
`src/lib/time-zone.ts`, which formats against the school's zone. The two modules
are not interchangeable; pick by what the column means, not by which import is
nearer.

Columns currently on the date-only side: `volunteer_hours.date`,
`budget_transactions.date`, `fundraisers.start_date`/`end_date`,
`pta_minutes.meeting_date`/`ai_extracted_date`,
`email_campaigns.week_start`/`week_end`,
`email_content_items.start_date`/`end_date`,
`event_plans.event_date`, `event_plan_tasks.due_date`,
`classroom_tasks.due_date`, `committee_tasks.due_date`,
`event_plan_meetings.meeting_date`, `school_join_codes.expires_at`.

Note that a Drizzle `date` column comes back as a `"YYYY-MM-DD"` **string**, not
a `Date`. The helpers take either, which is the point — a caller shouldn't have
to know which kind of column it was handed.

### Calendar Grids Are Shared

There is **one** month/week/year grid in the app, in
`src/components/calendar/`, and it is generic over what it lays out. Two
calendars use it today — the school calendar (`/calendar`) and a committee's
shared schedule — and neither owns it.

The split is: the **grid decides which cell**, a **renderer decides what's in
the cell**. So `src/lib/calendar-view.ts` holds only date math and takes
`CalendarItem` (`id`, `title`, `startTime`, `endTime`, `allDay`, `timeZone`) —
the five fields laying something out actually needs. A concrete item type
extends it, and the grid never looks at the extra fields.

Adding a third calendar means writing a `CalendarRenderers<T>`
(`calendar-renderers.ts`): `renderChip` / `renderBlock` / `renderRow` /
`dotClassName`. See `schoolCalendarRenderers()` and
`committeeScheduleRenderers()` for the two that exist. Navigation belongs in the
renderer, which is why the grids take no `backHref` — an event chip is a link to
`/calendar/[id]`, a slot chip opens a dialog.

- **Colour by a callback, not a shared record.** `EVENT_TYPE_COLORS` is the
  school calendar's own axis (classroom/pta/school); a schedule slot's is its
  status. Folding both into one record is how these rot.
- **`buildCalendarHref` takes a `basePath`** and `calendarViewCookie(scope)`
  namespaces the remembered view, so two calendars don't fight over one
  preference.
- **`CalendarPeriodNav` / `CalendarViewToggle` render links *or* buttons.** Pass
  `hrefFor` when the view lives in the URL (its own page); pass `onSelect` when
  it's client state. The committee schedule needs the latter because it sits in
  a Radix tab whose own selection is client state — a URL change would throw the
  reader back to Messages.

**Entering a date and time** is `DateTimeRangeField`
(`src/components/ui/date-time-range-field.tsx`) plus `date-time-input.ts`, not a
raw `<input type="datetime-local">`. That input is zone-naive in both
directions, `toISOString().slice(0, 16)` is the classic bug (it renders UTC's
wall clock), and "ends before it starts" was unvalidated everywhere. Current
users: committee schedule slots, committee sign-up windows, scavenger hunt
windows.

### One Request, Many Receipts

A reimbursement request is **one check, for one event, covering as many receipts
as the errand actually produced**. The Costco run and the party-shop run for the
same class party are two receipts on one request — one approval round, one
check, one sheet in the treasurer's binder — where they used to be three of
everything.

The unit of substantiation is the receipt, so that is where the data lives:

- **`reimbursement_expenses` is one receipt** — its own vendor, purchase date,
  subtotal, sales tax and total. `reimbursement_items.expense_id` and
  `reimbursement_receipts.expense_id` say which receipt a line item was read off
  and which receipt an image is a picture of. Several images per receipt is the
  long till roll photographed in parts; several receipts per request is the
  afternoon of errands. They are different questions and different columns.
- **The request's own `vendor` / `purchase_date` / amounts are a rollup**,
  rewritten by `recalcRequestFromExpenses` on every edit — sums for the money,
  `summarizeVendors` for the label, and the **earliest** purchase for the date,
  because that is what the IRS 60-day clock runs from. Stored, not derived, so
  every list, report, export and budget total keeps reading one column, and the
  number the check is written from doesn't depend on a join.
- **One request cannot span two events.** The event is on the request, so this
  is true by construction rather than by validation — and it is the reason the
  rollup is meaningful at all.
- **Flags are asked per receipt**: totals-mismatch and possible-duplicate both
  compare receipt to receipt, because two receipts wrong in opposite directions
  sum to something that looks right, and the same $84.12 Costco run filed twice
  is a duplicate whether or not the requests around it match.
- **`replaceExpenses` is the only writer** of the receipt rows and their items,
  and it deletes a leftover only when that leftover carries no images — a
  photograph creates its receipt row before the form hears back, and a save that
  overlaps an upload must not cascade away the picture just taken. Deliberate
  removal goes through `deleteReimbursementExpense`.

**A submitter gets out two different ways, and the line between them is whether
anybody has seen it.** A `draft` is *discarded* — `deleteReimbursementDraft`
removes the row, because the wizard creates one from the first receipt photo and
an abandoned one is a record of nothing. Everything past that is *withdrawn* —
`withdrawReimbursement` sets `status = 'withdrawn'` and writes an activity row,
because by then officers have read it, it may carry a rejection reason, and a
PTA's financial records do not disappear because the person who filed one
changed their mind. Withdrawing is reachable from `submitted`,
`changes_requested` and `rejected`, and is terminal; past approval the request
is money the school has committed, and only an officer can undo it
(`clearReimbursementApprovals`, `unmarkReimbursementPaid`). The predicates are
`isWithdrawableReimbursementStatus` / `canDiscardReimbursement` in
`reimbursements-shared.ts`, so the button and the action can never disagree
about what is offered. A withdrawn request drops out of the officers' *open*
queue but stays in **All** and under its own filter, counts toward no budget or
event-plan total, and stops being a `possibleDuplicate` source — re-filing the
same receipt after taking one back is the correct thing to do, not a flag.

### Category Sets

Every fixed category list — volunteer hours, Knowledge Base, event catalog,
contacts, onboarding resources — is a **slug→label record** in
`constants.ts`, and the **slug is what's stored**. Labels are display only.

That is the whole rule, and it exists because three of these used to be arrays
of display strings whose label went into the database: renaming "Office Help"
would have orphaned every row filed under it. Migration `0068_category_slugs`
backfilled them.

- **Render with `categoryLabel(SET, value)`** (`src/lib/categories.ts`) or
  `<CategoryBadge set={SET} value={...} />`. Both fall back to the raw value, so
  a row filed under a slug that no longer exists stays readable instead of
  rendering blank.
- **Ask with `<CategorySelect set={SET} />`** (`src/components/ui/category-select.tsx`).
  `placeholder` renames the empty option ("All categories" for a filter);
  `hidePlaceholder` drops it for a field that must always have a value.
- **AI generators read the set too.** `minutes-to-articles` kept its own private
  list of category names and filed real articles under values the picker and the
  filter had never heard of. Both it and `drive-file-metadata` now build their
  JSON Schema `enum` from `categoryValues(KNOWLEDGE_CATEGORIES)` — if you add a
  generator that writes a category, do the same.
- **Slugs are immutable, like board position slugs.** Rename the label; never
  the key.

These are platform-wide slates. Anything a school needs to own its own version
of is a table (`board_positions`, `budget_categories`), not a longer constant.

### Navigation & Admin Page Organization

**IMPORTANT**: This is a PTA application. The PTA Board members ARE the admins of DragonHub. School faculty may have accounts to view PTA activities, but the PTA Board configures and manages the app.

**Admin pages should be organized as follows:**

1. **PTA Board Hub** (`/admin/board`) - The central hub for all PTA Board admin functions
   - All PTA Board admin pages should be linked from within the PTA Board Hub, NOT added directly to the sidebar navigation
   - The sidebar only shows "PTA Board Hub" as the single entry point for admin functions
   - Admin pages are organized into sections within the hub: Getting Started, Content, Secretary Tools, Finance & Fundraising, Room Parent VP Tools, Operations
   - New admin features should be added as cards within the appropriate hub section in `ADMIN_HUB_SECTIONS` (`src/lib/admin-nav.ts`)

2. **School Admin** (`/admin/school`) - The school's own side of the app
   - Only what the school genuinely owns: its administrative positions
     (`/admin/school/positions`), its staff access codes (`/admin/school/codes`),
     and a read-only school-wide member directory (`/admin/school/directory`)
   - Cards live in `SCHOOL_ADMIN_HUB_SECTIONS` (`src/lib/admin-nav.ts`)
   - Gated by `isSchoolAdminRole` — the `admin` school role or a super admin.
     PTA board members do **not** see this hub; they have their own
   - School settings, school year, and integrations used to live here and have
     moved to the board hub, because the PTA is who configures them

3. **Super Admin** (`/super-admin`) - Reserved for platform-level administration
   - Only for cross-school operations and platform management
   - Requires super admin privileges

**When adding new admin features:**
- DO NOT add new items to `adminNavItems` in `src/lib/nav-config.ts`
- DO add a card to the appropriate section of `ADMIN_HUB_SECTIONS` in `src/lib/admin-nav.ts`
- Routes should still be under `/admin/` but accessed through the hub

### Participation vs Governance (School Admins)

School staff are guests in the PTA's application. The line between them and the
board is **not** read vs write — it is *participation* vs *governance*:

- **Participation** — reading, posting, commenting, volunteering. School admins
  get this everywhere. They are **virtual members** of every classroom and every
  committee: access granted in the auth helper, never as a `classroom_members`
  or `committee_members` row. The absence of the row is the point — a real row
  would put them into roster counts, the member CSV export, and digest sends.
- **Governance** — approving, publishing, configuring, assigning roles, managing
  rosters, moving money. PTA board only.

The helpers in `src/lib/auth-helpers.ts` come in pairs along that line, and the
pairing is load-bearing. Pick a side deliberately rather than reaching for
whichever is nearby:

| Participation (admins pass) | Governance (board only) |
|---|---|
| `isSchoolLeadership` / `assertSchoolLeadership` | `isPtaBoardMember` / `assertPtaBoardMember` |
| `assertClassroomMember` (returns `null` for virtual members) | `assertClassroomRole` |
| `assertCommitteeAccess` (admins get `isChair: false`) | `assertCommitteeChair` |
| `assertEventPlanAccess` (admins resolve as `member`) | `assertPtaBoard` |

Consequences worth knowing:

- **Knowledge Base articles stay fail-closed for school admins.** An article
  with no audience rows is board-only, so a school admin sees only what has been
  explicitly shared. This is deliberate — draft minutes and handoff notes are
  where the board writes candidly.
- **`assertClassroomMember` can return `null`.** Callers that need a role off
  the row must handle it; `assertClassroomRole` deliberately does its own lookup
  rather than building on it.

### Membership Provenance and Join Codes

`schools.join_code` was only ever able to express one kind of door. Codes now
live in **`school_join_codes`** (school, code, `grants_role`, `grants_source`,
`requires_approval`, expiry, use cap), with room for the SCC code that is coming.

- `code` is **globally unique** — redemption resolves the school *from* the code.
- `schools.join_code` remains the PTA code and its display home; `syncPtaJoinCode`
  keeps the mirror row in step. Both rotation paths must call it.
- **Any code granting more than `member` lands in `pending`, not `approved`**
  (`codeRequiresApproval`). This is both because such a code gets forwarded in
  staff email and because auto-approval would route around the deliberate
  downgrade in `joinSchool`'s `removed` branch.

`school_memberships.source` records which door someone came through. It is
**NOT NULL with no default**, so a new admission path fails to compile until it
decides — provenance cannot be reconstructed after the fact.

Directory membership follows provenance, not role:

- The **PTA directory** (`/admin/members`) uses `ptaSourcedMemberFilter()`
  (`src/lib/member-directory.ts`): a PTA-sourced `source` **OR** an existing
  volunteer/committee signup row. The signup half is not redundant — memberships
  are unique on (school, user, year), so a principal who joins by staff code and
  *later* volunteers keeps his original `source`, and only the signup rows show
  he took part.
- The **school directory** (`/admin/school/directory`) shows everyone, read-only.
- The **School Staff roster** on the PTA Board Hub shows who holds school admin
  access, so the board never discovers such an account by accident.

### The Signup Row Is the Seat

Capacity is counted over `volunteer_signups` and `committee_signups` rows, never
over accounts. Both carry `user_id` as ON DELETE SET NULL, so an account going
away leaves the row behind — `active`, still holding a room parent spot or a
per-classroom committee cap, under the name the parent typed into the form.

- **Anything that ends someone's participation must release their seats**, via
  `releaseSignupSeatsForUser()` (`src/lib/signup-seats.ts`). `deleteUser` and
  `removeMember` both do. Releasing goes through `deactivateVolunteerSignup` /
  `deactivateCommitteeSignup` rather than an UPDATE, because those are what
  re-derive the membership and promote (and email) whoever is next in line. A
  seat that frees itself without promoting anyone is the bug to avoid.
- **One sign-up writes two tables.** A parent ticking Meet the Masters under
  Room 12 gets a `volunteer_signups` row *and* a `committee_signups` row scoped
  to that classroom. They are separate commitments — someone can stop being the
  room parent and keep running MTM — so `removeVolunteerSignup` takes an
  explicit list of committee seats to release, and `/admin/room-parents` shows
  those seats per room so the choice is visible rather than silent.
- **Every user FK is cascade or set null**, never NO ACTION; see the comment
  above `users` in `schema.ts`. Beware that `drizzle-kit generate` drops
  constraints by *its* name (`<table>_<col>_users_id_fk`) and silently misses
  ones `push` created (`<table>_<col>_fkey`), leaving the old rule in force —
  verify against `pg_constraint` after migrating, don't trust the success line.

### Teachers and Their Classrooms

**A room has a list of teachers, not a teacher.** A half-day room is taught by
one person in the morning and another in the afternoon, and both need the room's
message board, roster and tasks. `classroom_teachers` (classroom, name, email,
sort order) is that list; **`classrooms.teacher_email` is a deprecated mirror of
the first entry**, kept in step by `setClassroomTeachers()` for the sake of
hand-written queries and read by nothing in the app. Teachers on one room are
peers — there is no primary.

The list is **load-bearing, not decorative**. The addresses the board types into
the classroom form are what put those teachers inside the room:
`src/lib/teacher-linking.ts` is the fourth email→access linker, alongside the
volunteer, committee and event-plan ones the `auth.ts` events already ran.

- **Write it with `setClassroomTeachers()`** (`src/lib/classroom-teachers.ts`),
  which is replace-all — the form submits the list the board can see, so partial
  edits aren't expressible. It lowercases and trims on the way in, which is why
  every lookup is plain equality rather than `lower(...)`. Read it with
  `getClassroomTeachers()` / `getClassroomTeachersMap()`; the rules a form and a
  server action must share (`normalizeTeacherInputs`, `invalidTeacherEmails`,
  `formatTeacherNames`) are in `classroom-teachers-shared.ts`.
- **The `name` is display-only, and the account's own name wins.** It exists
  because until a teacher signs in there is no account to take a name from, and
  every surface was printing an email address at parents.
- **The designation is the admission.** A teacher who has never joined gets a
  `member` school membership with source **`classroom_teacher`**, so signing in
  alone is enough. It is school `member`, never `admin` or `pta_board` — the
  `teacher` role is scoped to the classroom, where it means "can post on the
  private board and run tasks", and confers no governance anywhere. A `revoked`
  membership is left alone, exactly as `linkExistingAccountToSchool` leaves it.
- **The address must be verified.** This keys off something a board member typed
  by hand, and a typo would otherwise hand a stranger the room parents' private
  board. Every sign-in path stamps `emailVerified`, so the check costs nothing.
  One teacher who hasn't signed in never holds up the room's others.
- **Two directions, and both are needed.** `linkTeacherClassroomsToUser()` runs
  on every sign-in (not just the first — an address may be named long after the
  account existed, and each school year makes a fresh classroom row).
  `syncClassroomTeacherMembership(classroomId)` runs when the board *writes* the
  list, and is the only half that can **retire a departing teacher** on a
  reassignment. It touches `role = 'teacher'` rows only, so a teacher who is
  also a room parent there keeps that seat. Call it after classroom
  create/update and after rollover — `copyClassroomsToYear` copies each room's
  teacher rows and returns `createdIds` for exactly this, and it must run
  **after** the transaction commits.
- **Current year only**, or a six-year veteran collects six rooms.
- `/admin/classrooms` shows "hasn't signed in yet" **per address**, not per
  room, so a typo in one of a half-day room's two teachers is visible instead of
  hidden behind the one that worked.
- **Every teacher-facing surface reads `classroom_teachers`, never
  `classroom_members`.** The membership row only exists once someone signs in,
  so anything built from it is empty in September — exactly when the board needs
  it. The member directory, the member export (both formats), and the mailing
  group builder therefore all start from the list on the classroom and treat the
  account as an enrichment: it supplies the name, the phone and the verified
  tick, and its absence costs nothing else. `classroom_members` is still what
  decides *access*; it is never what decides *who exists*.
- A teacher of record is **not `ptaSourced`**, so the export blanks their phone
  and board position. That is the disclosure rule, not an oversight — but it
  must not become an exclusion rule: `buildMemberExport` has an escape hatch in
  both formats letting them through on the strength of a teacher row alone.

### DLI Partner Classrooms

At a DLI school a grade is split into two homerooms — Red (Chinese) and Blue —
run as one grade: the teachers plan together and the parties most volunteering
is for are thrown together. So **a member of one reaches the other**.

**There is no partner table, deliberately.** `dli_groups` is a school-level list
of *strands*, not a per-grade pairing; the partnership is already fully
expressed by `is_dli` + `grade_level`. Two active DLI rooms, same school year,
same grade, are partners. Helpers live in `src/lib/dli-partners.ts`.

- **Match grades with `getGradeSortOrder`, never string equality.**
  `grade_level` is free text and both "1st" and "1st Grade" are alive in
  production. Sort orders 998/999 (unparseable/unset) never pair.
- **Partner access is participation, not governance** — the same line school
  admins sit on. It is granted inside `assertClassroomMember`, which returns
  `null` for a partner just as it does for leadership, so every
  `membership?.role` check refuses them the room's controls and
  `assertClassroomRole` refuses them outright. Read and post, yes; manage the
  roster, tasks or signups, no.
- **Access hops exactly once.** `isDliPartnerMember` requires a real
  `classroom_members` row in the partner, so it can't chain room to room.
- The room-parents-only board stays closed to partners; that's where a room's
  own team coordinates.

### Per-Classroom Committees Are Many Small Committees

An `all_classrooms` committee (Meet the Masters) is not one group of people. At
a 20-room school it is twenty separate pairs of parents who will never meet, and
treating it as one roster is wrong in both directions — too much contact
information shared, and the room-level facts that matter left unsaid.

- **The roster is scoped in `getCommitteeDetail`, not in the component.** A
  plain member sees the rooms they cover, plus their DLI grade partner. Chairs
  and board see everything; coordinating the whole committee is their job. The
  filtering is server-side so the other rooms' phone numbers never reach the
  payload — same reason chairs-only messages and the waitlist are filtered
  there.
- **Coverage is not contact information.** `classroomCoverage` gives *everyone*
  seats-filled per room, names excluded. "Is Room 8 covered?" is the question
  the whole committee needs answered and it needs no names to answer it.
- **The shared schedule is never scoped.** Cross-classroom visibility is the
  entire point of it — see the comment in `committee-schedule.tsx` before adding
  a filter there.
- **A classroom's own page reads `committee_signups` directly**, not
  `classroom_members`. A parent who ticks only MTM under Room 12 gets no
  membership row at all, so a roster built from memberships left them off the
  room entirely; the ones who did appear rendered as a bare "Volunteer", because
  `classroom_members.role` cannot say *which* committee. The
  `committeeVolunteers` group in `VolunteersSection` is the fix, and it is
  independent of access — appearing on a room's page and being able to open it
  are different questions.
- `grantsLinkedAccess` resolves an `all_classrooms` committee's rooms from the
  **signups**, not the committee row — the committee has no `classroomId` of its
  own. That branch was missing, which made the flag a silent no-op for the one
  scope where a signup is most clearly a commitment to a room.

### Shared Materials (Schedule Bands)

`committees.schedule_bands` says how many classrooms can be scheduled at once
and which ones compete. Meet the Masters is the case: the school owns one junior
kit (K–2) and one senior kit (3–5), so two kindergarten rooms on one morning is
a real collision and a kindergarten room plus a fourth grade room is not. A plain
overlap check cannot tell those apart.

- **Null means no constraint expressed**, and `findScheduleConflict` falls back
  to warning on any overlap — the behaviour from before bands existed. Empty
  arrays are normalized to null so "no bands" has one representation.
- **Grades are stored as `getGradeSortOrder` values**, never the labels;
  `grade_level` is free text. A grade in no band is *unconstrained*, not lumped
  into a default one.
- **Overlapping bands are rejected, not resolved by precedence** — two bands
  both claiming 2nd grade have no defensible answer, and returning whichever
  came first in the array would be a silent coin flip.
- It stays a **warning, never a block**: the board sometimes needs to record an
  overlap on purpose. Rules live in `src/lib/schedule-bands.ts`, client-safe, so
  the admin form and the server action validate identically.

### Back Navigation Out of the Hub

Because these pages aren't in the sidebar, a page with no back link is a dead
end. Don't hand-roll one — `src/lib/admin-nav.ts` is the single route map, and
the layout renders the trail from it:

- **`ADMIN_HUB_SECTIONS`** doubles as the breadcrumb registry. A new card gets
  its page a "← PTA Board Hub" trail for free; nested pages
  (`/admin/committees/[id]`) also get their section crumb.
- **Pages that aren't hub cards** (`/admin/settings`, `/admin/dli-groups`) go in
  `EXTRA_ADMIN_ROUTES`, which is also where a page whose parent isn't its URL
  parent declares one. Anything unregistered still gets a link back to its hub.
- **`HubSectionLayout`** (`src/components/layout/hub-section-layout.tsx`) is the
  default export of `layout.tsx` for each hub-owned route group — currently
  `/admin`, `/onboarding`, and `/emails`. It renders the breadcrumb plus
  `ScrollMemory`. A new group behind the hub should re-export it too, and be
  added to `HUB_SCOPED_PREFIXES`.
- **Returning to a hub or list restores it** — scroll position, and the hub's
  search box. Breadcrumb links carry `?restore=1` (`withRestoreFlag` in
  `src/lib/page-memory.ts`); links without it still land at the top, so use it
  for any "back" link you add elsewhere.

**Role-based access**: Currently all PTA Board members have full access to admin functions. Future iterations will add granular permissions based on board position (President, Treasurer, etc.).
