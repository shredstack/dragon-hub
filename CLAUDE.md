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
7. **Event Planning** (`/events`) - Collaborative event planning with tasks and resources
8. **Board Onboarding** (`/onboarding`) - Role-aware onboarding hub for PTA board members

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio
```

## Environment Variables

Required in `.env.local`:
```
DATABASE_URL=           # Neon connection string
NEXTAUTH_URL=           # App URL
NEXTAUTH_SECRET=        # Auth secret

# Google APIs
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
BUDGET_SHEET_ID=
CALENDAR_IDS=           # Comma-separated

# Cron security
CRON_SECRET=
```

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
- Helpers live in `src/lib/important-links-shared.ts` (client-safe) so the
  dashboard card and the admin form share one set of rules.

### Navigation & Admin Page Organization

**IMPORTANT**: This is a PTA application. The PTA Board members ARE the admins of DragonHub. School faculty may have accounts to view PTA activities, but the PTA Board configures and manages the app.

**Admin pages should be organized as follows:**

1. **PTA Board Hub** (`/admin/board`) - The central hub for all PTA Board admin functions
   - All PTA Board admin pages should be linked from within the PTA Board Hub, NOT added directly to the sidebar navigation
   - The sidebar only shows "PTA Board Hub" as the single entry point for admin functions
   - Admin pages are organized into sections within the hub: Getting Started, Content, Secretary Tools, Finance & Fundraising, Room Parent VP Tools, Operations
   - New admin features should be added as cards within the appropriate hub section in `ADMIN_HUB_SECTIONS` (`src/lib/admin-nav.ts`)

2. **School Admin** (`/admin/school`) - Reserved for school-level configuration
   - Only for settings that affect the school itself (school info, integrations, etc.)
   - Accessible to users with the `admin` school role

3. **Super Admin** (`/super-admin`) - Reserved for platform-level administration
   - Only for cross-school operations and platform management
   - Requires super admin privileges

**When adding new admin features:**
- DO NOT add new items to `adminNavItems` in `src/lib/nav-config.ts`
- DO add a card to the appropriate section of `ADMIN_HUB_SECTIONS` in `src/lib/admin-nav.ts`
- Routes should still be under `/admin/` but accessed through the hub

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
