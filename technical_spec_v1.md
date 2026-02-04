# PTA Connect - Technical Specification v1

## Tech Stack
- **Frontend/Backend**: Next.js 14+ (App Router)
- **Database**: Neon (Serverless PostgreSQL)
- **ORM**: Drizzle ORM
- **Deployment**: Vercel
- **Auth**: NextAuth.js (Auth.js)
- **Storage**: Vercel Blob (for file uploads if needed beyond Google Drive)

## Architecture Overview

```
Next.js App (Vercel)
├── Server Components (data fetching)
├── Server Actions (mutations)
├── API Routes (webhooks, external integrations)
└── Client Components (interactive UI)

Neon (Serverless PostgreSQL)
├── PostgreSQL (relational data)
├── Drizzle ORM (queries & migrations)
└── Application-level authorization (middleware)

Auth & Storage
├── NextAuth.js (user management & sessions)
└── Vercel Blob (file storage, if needed)

External Integrations
├── Google Calendar API (read-only)
├── Google Sheets API (read-only)
├── Google Drive API (read-only)
└── 32auctions API (read for fundraiser data)
```

## Database Schema

```sql
-- Users & Roles
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g., "Mrs. Smith - 5th Grade"
  grade_level TEXT,
  teacher_email TEXT,
  school_year TEXT NOT NULL, -- "2025-2026"
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE user_role AS ENUM ('teacher', 'room_parent', 'pta_board', 'volunteer');

CREATE TABLE classroom_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(classroom_id, user_id)
);

-- Room Parent Coordination
CREATE TABLE classroom_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE classroom_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  completed BOOLEAN DEFAULT false,
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Volunteer Hours
CREATE TABLE volunteer_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  date DATE NOT NULL,
  category TEXT, -- e.g., "Classroom Support", "Event Help", "Fundraising"
  notes TEXT,
  approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Events (cached from Google Calendar)
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  calendar_source TEXT, -- which Google Calendar it came from
  event_type TEXT, -- "classroom", "pta", "school"
  classroom_id UUID REFERENCES classrooms(id),
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

-- Budget Dashboard (cached from Google Sheets)
CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  allocated_amount DECIMAL(10,2),
  school_year TEXT NOT NULL,
  sheet_row_id TEXT, -- reference to Google Sheet row
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budget_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES budget_categories(id),
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL, -- negative for expenses
  date DATE NOT NULL,
  sheet_row_id TEXT,
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

-- Fundraiser Tracking (32auctions data)
CREATE TABLE fundraisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_32_id TEXT UNIQUE,
  name TEXT NOT NULL,
  goal_amount DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fundraiser_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fundraiser_id UUID REFERENCES fundraisers(id),
  total_raised DECIMAL(10,2),
  total_donors INTEGER,
  snapshot_time TIMESTAMPTZ DEFAULT NOW()
);

-- Institutional Knowledge (Google Drive links)
CREATE TABLE knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  google_drive_url TEXT NOT NULL,
  category TEXT, -- "Events", "Fundraising", "Classroom", "Policies"
  tags TEXT[], -- searchable tags
  school_year TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
```

## Feature Specifications

### 1. Room Parent Coordination

**Pages:**
- `/classrooms` - List of all classrooms (filtered by user's role)
- `/classrooms/[id]` - Individual classroom hub

**Classroom Hub includes:**
- Message board (real-time or polling)
- Task list with assignments
- Quick links to relevant calendar events
- Roster of room parents & teacher

**Key Functions:**
```typescript
// Server Actions
async function sendClassroomMessage(classroomId: string, message: string)
async function createTask(classroomId: string, task: TaskInput)
async function updateTaskStatus(taskId: string, completed: boolean)
async function assignTask(taskId: string, userId: string)
```

**Permissions (Application-level):**
- Users can only see classrooms they're members of
- Teachers and room parents can post messages
- Teachers can assign tasks
- Anyone in classroom can update task status if assigned to them

### 2. Volunteer Hour Tracking

**Pages:**
- `/volunteer-hours` - Personal log + leaderboard
- `/volunteer-hours/submit` - Log hours form
- `/admin/volunteer-hours` - Approval dashboard (PTA board only)

**Features:**
- Self-service hour logging
- Approval workflow for PTA board
- Exportable reports (CSV for year-end summaries)
- Optional: Leaderboard by classroom or individual

**Key Functions:**
```typescript
async function logVolunteerHours(data: VolunteerHourInput)
async function approveHours(hourId: string)
async function getVolunteerSummary(userId?: string, dateRange?: DateRange)
```

### 3. Calendar Aggregation

**Pages:**
- `/calendar` - Unified calendar view
- Filter by: classroom, event type, date range

**Sync Strategy:**
- Cron job (Vercel Cron) runs every 6 hours
- Fetches from configured Google Calendar(s) via service account
- Stores in `calendar_events` table
- Google Calendar IDs stored in environment variables

**Implementation:**
```typescript
// app/api/cron/sync-calendar/route.ts
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  await syncGoogleCalendars();
  return Response.json({ success: true });
}
```

**Google Calendar Setup:**
- Service account with Calendar API access
- Share relevant calendars with service account email
- Store credentials in Vercel environment variables

### 4. Budget Dashboard

**Pages:**
- `/budget` - Overview with category breakdowns
- Charts showing allocated vs. spent
- Transaction history

**Sync Strategy:**
- Similar cron job approach
- Google Sheets API reads designated budget sheet
- Expected sheet format:
  - Sheet 1: Budget categories (Name, Allocated Amount)
  - Sheet 2: Transactions (Date, Category, Description, Amount)

**Implementation:**
```typescript
async function syncBudgetData() {
  const sheets = google.sheets({ version: 'v4', auth });

  // Fetch budget categories
  const categoriesResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.BUDGET_SHEET_ID,
    range: 'Categories!A2:B100',
  });

  // Upsert to budget_categories table

  // Fetch transactions
  const transactionsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.BUDGET_SHEET_ID,
    range: 'Transactions!A2:D1000',
  });

  // Upsert to budget_transactions table
}
```

### 5. Fundraiser Tracking

**Pages:**
- `/fundraisers` - Active and past fundraisers
- `/fundraisers/[id]` - Individual fundraiser with progress

**32auctions Integration:**
- Research their API documentation (or web scraping if no API)
- Sync fundraiser stats periodically
- Display: goal vs. raised, donor count, progress bar

**If 32auctions has API:**
```typescript
async function sync32AuctionsData() {
  // Fetch active auctions
  const response = await fetch('https://api.32auctions.com/...');
  // Update fundraisers and fundraiser_stats tables
}
```

**If no API:**
- Manual entry by PTA board with update form
- Or simple web scraping (less reliable)

### 6. Institutional Knowledge

**Pages:**
- `/knowledge` - Searchable library
- `/knowledge/new` - Add new article (link to Google Drive)
- Filter/search by category, tags, year

**Features:**
- Store metadata + Google Drive links (not duplicate content)
- Full-text search on title, description, tags
- Categories: Events, Fundraising, Classroom Activities, Policies, Budget, etc.

**Key Functions:**
```typescript
async function createKnowledgeArticle(data: {
  title: string;
  description: string;
  googleDriveUrl: string;
  category: string;
  tags: string[];
})

async function searchKnowledge(query: string, filters?: {
  category?: string;
  schoolYear?: string;
})
```

## Authentication & Permissions

**Auth Strategy:**
- NextAuth.js (Auth.js) with email/password (Credentials provider) or Email magic links
- Initial user creation: PTA board manually invites via admin panel
- Email verification required
- Role assignment happens in `classroom_members` table
- Session management via NextAuth.js JWT or database sessions (stored in Neon)

**Application-level Authorization:**

Permissions are enforced in server actions and API routes via middleware/helper functions rather than database-level RLS:

```typescript
// lib/auth.ts - Authorization helpers
async function assertCanViewVolunteerHours(sessionUserId: string, targetUserId: string) {
  if (sessionUserId === targetUserId) return;
  const isPtaBoard = await db.query.classroomMembers.findFirst({
    where: and(eq(classroomMembers.userId, sessionUserId), eq(classroomMembers.role, 'pta_board')),
  });
  if (!isPtaBoard) throw new Error('Unauthorized');
}

async function assertClassroomMember(sessionUserId: string, classroomId: string) {
  const member = await db.query.classroomMembers.findFirst({
    where: and(eq(classroomMembers.userId, sessionUserId), eq(classroomMembers.classroomId, classroomId)),
  });
  if (!member) throw new Error('Unauthorized');
}
```

## Deployment & Configuration

### Environment Variables (Vercel)
```
# Neon Database
DATABASE_URL= # Neon PostgreSQL connection string

# NextAuth.js
NEXTAUTH_URL=
NEXTAUTH_SECRET=

# Google APIs
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
BUDGET_SHEET_ID=
CALENDAR_IDS= # comma-separated

# 32auctions
AUCTIONS_32_API_KEY= # if available

# Cron
CRON_SECRET= # for securing cron endpoints
```

### Vercel Cron Jobs (vercel.json)
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-calendar",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/sync-budget",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/sync-fundraisers",
      "schedule": "0 */12 * * *"
    }
  ]
}
```

## MVP Development Phases

**Phase 1 (Core Infrastructure):**
- Set up Next.js + Neon + Drizzle ORM
- Auth via NextAuth.js & user management
- Database schema & migrations (Drizzle Kit)
- Application-level authorization helpers

**Phase 2 (Room Parent Features):**
- Classroom hub pages
- Message board
- Task management

**Phase 3 (Transparency Features):**
- Volunteer hour tracking + approval
- Calendar sync + display
- Budget dashboard

**Phase 4 (Advanced Features):**
- Fundraiser integration
- Knowledge base
- Polish & mobile responsiveness

## Open Questions

1. **Google API Access**: Does the PTA have a Google Workspace account? Will you use a service account or OAuth for individual users?

2. **32auctions API**: Do they have a public API, or will this need creative solutions (manual updates, scraping)?

3. **User Onboarding**: Self-signup vs. admin invitation? How do you verify someone should have access?

4. **Mobile**: Does this need a responsive web app, or eventually native mobile apps?

5. **Notifications**: Email, SMS, or push notifications for new messages/tasks?

## Implementation Notes

This spec is designed to be implemented with Claude Code. To get started:

1. Initialize the Next.js project with TypeScript
2. Set up Neon database and configure Drizzle ORM with schema & migrations
3. Set up NextAuth.js for authentication
4. Configure environment variables
5. Implement features in the order of the MVP phases
6. Deploy to Vercel with proper environment configuration

Focus on getting Phase 1 and Phase 2 working first, then iterate based on actual usage patterns and feedback from room parents and teachers.

