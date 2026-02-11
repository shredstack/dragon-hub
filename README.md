# 🐉 Dragon Hub

**The all-in-one platform that makes PTA work actually work.**

DragonHub helps enhance the scattered spreadsheets, outdated email tools, and tribal knowledge that make PTA board transitions painful and parent engagement difficult. It gives board members modern tools to run their PTA efficiently, and gives every parent a single place to stay informed and get involved — without having to dig through their inbox every week.

---

## Mission

To eliminate the institutional knowledge gap that makes PTA onboarding and operations unnecessarily hard, by building a platform where everything a PTA board member needs to know — and everything a parent needs to stay engaged — lives in one place.

## Vision

Every school PTA should be able to operate smoothly regardless of board turnover. New board members should be able to step into their roles with confidence, backed by documented processes, historical context, and AI-assisted planning. Every parent should be able to stay connected to their school community without relying on weekly email blasts sent through outdated tools.

---

## Why DragonHub Exists

PTAs run on volunteer energy and institutional memory. When a board member's term ends, critical knowledge walks out the door: which vendors to call for the spring fundraiser, what went wrong at last year's book fair, how the budget actually works. Meanwhile, the tools PTAs rely on — mass email services with editors from 2015, shared Google Drives with hundreds of unsorted files, group texts that lose context — make an already hard job harder.

DragonHub solves this by being the operating system for your PTA. It captures institutional knowledge automatically, uses AI to surface what matters, and gives every member of the school community the right level of access to stay informed and contribute.

---

## Current Features

### For Everyone

**Dashboard** — A personalized home screen showing upcoming events, recent activity, and quick links to the things you use most.

**Calendar** — A unified calendar view that aggregates events from Google Calendar. Supports both PTA and school calendars with automatic sync every 6 hours. No more checking three different places to figure out what's happening this week.

**Classrooms** — Each classroom gets its own hub with a message board, task list with assignments, and member roster. Room parents can coordinate party planning, field trips, and volunteer needs in one place instead of scattered group texts.

**Volunteer Hours** — Parents log their own hours with a simple form. PTA board members review and approve submissions. A leaderboard shows participation by individual and classroom, and hours can be exported to CSV for year-end reporting and recognition.

**Fundraisers** — Track fundraiser progress against goals with visual progress indicators. Supports manual entry and automatic sync with 32auctions for silent auction events.

**Knowledge Base** — A searchable library of articles covering everything from event planning guides to board role resources to vendor information. Articles are organized by category and tagged for easy discovery. Content can be created manually or generated from meeting minutes by AI.

### For PTA Board Members

**Event Planning** — Collaborative event planning with task management, resource attachments from Google Drive, and an approval workflow. AI-powered recommendations analyze past event documents and knowledge base articles to suggest tasks, tips, volunteer estimates, and budget guidance. A built-in discussion board lets the planning team ask questions and get AI-assisted answers grounded in event context.

**Budget Dashboard** — Visual budget overview with category breakdowns, allocated vs. spent charts, and transaction history. Syncs automatically from a Google Sheets budget spreadsheet so the treasurer can keep working in their preferred tool while everyone else gets a clean dashboard.

**PTA Minutes** — Upload and manage meeting minutes and agendas with automatic sync from a designated Google Drive folder. AI analyzes minutes to extract key discussion items, decisions, action items, and attendee information. Minutes can be automatically converted into Knowledge Base articles to preserve institutional knowledge.

**AI-Generated Agendas** — Generate draft agendas for upcoming meetings based on historical patterns. The AI looks at minutes and agendas from the same month in previous years plus recent meeting context to suggest relevant agenda items.

**Weekly Email Builder** — Compose weekly PTA update emails with a modern editor instead of fighting with outdated third-party tools. Board members submit content items throughout the week, and AI assembles them into a polished email with calendar summaries, recurring sections, and consistent formatting. Supports separate PTA-member and school-wide audience targeting.

**PTA Board Hub** — A centralized admin dashboard for board-specific tasks including volunteer hour approvals, member management, integration settings, and tag management.

**Board Member Onboarding** — A role-aware onboarding experience for new PTA board members that combines external PTA resources, school-specific knowledge, and AI-generated role guides. Features include:
- *Onboarding Dashboard* — Personalized landing page with progress tracking, role-specific resources, and quick access to guides
- *Onboarding Checklist* — Role-specific tasks with progress tracking that persists across sessions
- *Handoff Notes* — Outgoing board members document accomplishments, ongoing projects, tips, and key contacts for their successor
- *Event Catalog* — Browse all school events with effort estimates and express interest in leading or helping with specific events
- *AI-Generated Role Guide* — A synthesized onboarding guide that pulls from handoff notes, knowledge base articles, and indexed Drive documents to create a personalized guide for each board position

### Platform Capabilities

**Multi-School Support** — DragonHub supports multiple schools from a single deployment. Each school has its own isolated data, join codes for member onboarding, and independent configuration. A super admin console manages the overall platform.

**Google Workspace Integration** — Deep integration with Google Calendar, Google Drive, and Google Sheets via service account. Includes an in-app setup guide that walks non-technical board members through the Google Cloud Console configuration step by step.

**Role-Based Access** — Four tiers of access: members see community features, room parents manage their classrooms, PTA board members access admin tools, and school admins configure integrations. Specific PTA board positions (president, treasurer, secretary, etc.) are tracked for organizational clarity.

**AI-Powered Throughout** — Claude (Anthropic) powers event recommendations, meeting minutes analysis, agenda generation, email composition, and knowledge extraction. All AI features include source attribution so users can trace recommendations back to the documents that informed them.

**Mobile Responsive** — Every feature works on phones and tablets with an adaptive layout that switches between sidebar navigation on desktop and a mobile-friendly hamburger menu.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Server Components, Server Actions) |
| Database | Neon (Serverless PostgreSQL) |
| ORM | Drizzle ORM |
| Auth | NextAuth.js v5 (email magic links via Resend) |
| AI | Anthropic Claude API |
| External APIs | Google Calendar, Google Drive, Google Sheets |
| UI | Tailwind CSS, Radix UI, Recharts, Lucide Icons |
| Deployment | Vercel (with Cron Jobs for data sync) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) database (free tier works)
- A [Resend](https://resend.com) account (for magic link emails)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Create a project at [neon.tech](https://neon.tech), copy the connection string |
| `AUTH_SECRET` | Run `openssl rand -base64 32` in your terminal |
| `AUTH_RESEND_KEY` | Sign up at [resend.com](https://resend.com), create an API key |
| `AUTH_URL` | `http://localhost:3000` for local development |

Google API and cron variables are optional — features work without them but won't have synced data.

### 3. Push the database schema

```bash
npx drizzle-kit push
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### 5. (Optional) Seed demo data

```bash
npm run db:seed
```

---

## Project Structure

```
src/
├── actions/           # Server actions (all mutations)
├── app/
│   ├── (auth)/        # Sign-in, verify-request, error pages
│   ├── (app)/         # Authenticated pages (sidebar layout)
│   │   ├── dashboard/
│   │   ├── classrooms/
│   │   ├── volunteer-hours/
│   │   ├── calendar/
│   │   ├── events/         # Event planning
│   │   ├── budget/
│   │   ├── fundraisers/
│   │   ├── knowledge/
│   │   ├── minutes/        # PTA minutes & agendas
│   │   ├── emails/         # Email campaign builder
│   │   ├── onboarding/     # Board member onboarding hub
│   │   └── admin/          # Board hub, school admin, integrations
│   ├── super-admin/   # Multi-school management
│   └── api/           # Auth, cron jobs, Drive API routes
├── components/
│   ├── ui/            # Reusable primitives (button, card, dialog, etc.)
│   ├── layout/        # Sidebar, header, mobile nav
│   ├── classrooms/    # Classroom-specific components
│   ├── event-plans/   # Event planning components
│   ├── budget/        # Budget charts and displays
│   ├── onboarding/    # Board member onboarding components
│   └── ...
├── lib/
│   ├── db/            # Drizzle schema, migrations, seed
│   ├── ai/            # AI client, prompts, and generators
│   ├── sync/          # Google Calendar/Sheets/Drive sync logic
│   ├── auth.ts        # NextAuth configuration
│   ├── auth-helpers.ts # Authorization helpers
│   ├── drive.ts       # Google Drive utilities
│   ├── google.ts      # Google API client setup
│   ├── nav-config.ts  # Navigation structure
│   └── constants.ts   # Roles, categories, enums
└── types/             # TypeScript types
```

---

## Development Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema to database (dev)
npm run db:studio    # Open Drizzle Studio
npm run db:seed      # Seed demo data
```

---

## Future Enhancements

### Onboarding Polish
- **Dashboard welcome banner** — A conditional banner on the main dashboard for new board members who haven't completed onboarding, linking them to the onboarding hub.
- **Admin progress visibility** — Board admins can view onboarding completion status across all board members.
- **Transition timing automation** — Surface handoff prompts to outgoing members in May/June, and activate onboarding for incoming members in July/August based on role assignments.

### Deeper AI Integration
- **Conversational PTA assistant** — A school-wide AI assistant that any member can ask questions like "When is the next PTA meeting?", "How do I sign up to volunteer for the book fair?", or "What's the school's policy on birthday celebrations?" and get answers grounded in calendar data, knowledge articles, and minutes.
- **Smart notifications** — AI-prioritized alerts that surface what actually matters to each user based on their role, classroom, and engagement patterns rather than blasting everyone with everything.
- **Automated knowledge capture** — Detect when discussions in classroom message boards or event planning threads contain useful institutional knowledge and suggest creating Knowledge Base articles.

### Communication Upgrades
- **Direct email sending** — Send the weekly email directly from DragonHub instead of copy-pasting HTML into a third-party tool, with delivery tracking and open rates.
- **Push notifications** — Mobile push notifications for time-sensitive updates (volunteer hour approvals, event changes, message board activity).
- **SMS alerts** — Opt-in text message notifications for critical announcements.

### Financial Tools
- **Expense submission & reimbursement** — Board members submit expenses with receipt photos, routed to the treasurer for approval and tracking against budget categories.
- **Fundraiser analytics** — Historical fundraiser performance comparisons, donor trend analysis, and AI-suggested fundraising strategies based on what's worked in previous years.

### Community Engagement
- **Parent directory** — Opt-in directory so parents can connect with others in their child's classroom or grade.
- **Volunteer matching** — Match volunteer opportunities with parent availability and interests, with AI-suggested scheduling to avoid burnout and ensure coverage.
- **Event RSVP & sign-ups** — Integrated RSVP and sign-up sheets for events, replacing external tools like SignUpGenius.
- **School supply lists** — Centralized, annually-updated supply lists by grade and classroom.

### Platform Growth
- **Multi-language support** — Translate the interface and AI-generated content to serve diverse school communities.
- **Open source template library** — Shareable event plan templates, email templates, and Knowledge Base starter packs that any school can adopt.
- **API for third-party integrations** — Webhooks and API endpoints for connecting with school information systems, payment processors, and communication tools.
- **Offline support** — Progressive Web App capabilities so board members can reference event plans and knowledge articles without internet access at school events.

---

