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
- **Tables**: Always wrap in `overflow-x-auto` container

#### Avoid
- `justify-between` without considering mobile overflow (add `flex-wrap` or stack with `flex-col sm:flex-row`)
- Fixed pixel heights for content containers (use viewport-relative units)
- Inline elements that may overflow (wrap or make scrollable)
