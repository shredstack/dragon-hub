# Dragon Hub

PTA Connect platform for the Draper Dragons community. Built with Next.js 15, Drizzle ORM, Neon PostgreSQL, and NextAuth.js.

## Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) database (free tier works)
- A [Resend](https://resend.com) account (for magic link emails)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env.local
```

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Create a project at [neon.tech](https://neon.tech), copy the connection string |
| `AUTH_SECRET` | Run `openssl rand -base64 32` in your terminal |
| `AUTH_RESEND_KEY` | Sign up at [resend.com](https://resend.com), create an API key |
| `AUTH_URL` | `http://localhost:3000` for local development |

The Google API and cron variables are optional — features work without them but won't have synced data.

### 3. Push the database schema

```bash
npx drizzle-kit push
```

This creates all tables in your Neon database.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
src/
├── actions/          # Server actions (mutations)
├── app/
│   ├── (auth)/       # Sign-in, verify-request, error pages
│   ├── (app)/        # Authenticated pages (sidebar layout)
│   │   ├── dashboard/
│   │   ├── classrooms/
│   │   ├── volunteer-hours/
│   │   ├── calendar/
│   │   ├── budget/
│   │   ├── fundraisers/
│   │   ├── knowledge/
│   │   └── admin/
│   └── api/          # Auth + cron API routes
├── components/
│   ├── ui/           # Reusable primitives (button, card, etc.)
│   ├── layout/       # Sidebar, header, navigation
│   ├── classrooms/   # Classroom-specific components
│   ├── budget/       # Budget charts
│   └── ...
├── lib/
│   ├── db/           # Drizzle schema and client
│   ├── sync/         # Google Calendar/Sheets sync logic
│   ├── auth.ts       # NextAuth configuration
│   ├── auth-helpers.ts # Authorization helpers
│   └── utils.ts      # Shared utilities
└── types/            # TypeScript types
```

## Features

- **Classrooms** — Message boards, task management, member rosters
- **Volunteer Hours** — Self-service logging, PTA board approval, leaderboard
- **Calendar** — Unified view with Google Calendar sync (cron)
- **Budget** — Dashboard with charts, Google Sheets sync (cron)
- **Fundraisers** — Progress tracking, manual entry or 32auctions sync
- **Knowledge Base** — Searchable article library linked to Google Drive

## Database Development

This project uses [Neon branching](https://neon.tech/docs/introduction/branching) to isolate development from production. The `dev` branch is a copy-on-write snapshot of your production database — changes to it won't affect production.

### Setup

1. Install the Neon CLI: `npm install -g neonctl`
2. Authenticate: `neonctl auth`
3. Create a dev branch:
   ```bash
   neonctl branches create --project-id ancient-rain-33709006 --name dev --org-id org-cold-paper-51221799
   ```
4. Copy the connection string from the output and set it as `DATABASE_URL` in `.env.local`
5. Seed the dev branch with test data:
   ```bash
   npm run db:seed
   ```

### Database Scripts

| Script | Description |
|---|---|
| `npm run db:push` | Push schema changes to the database |
| `npm run db:generate` | Generate a new migration file after schema changes |
| `npm run db:studio` | Open Drizzle Studio to browse/edit data |
| `npm run db:seed` | Populate the database with test data |

### Resetting the Dev Branch

To get a fresh copy of production data:

```bash
neonctl branches delete dev --project-id ancient-rain-33709006 --org-id org-cold-paper-51221799
neonctl branches create --project-id ancient-rain-33709006 --name dev --org-id org-cold-paper-51221799
# Update DATABASE_URL in .env.local with the new connection string, then:
npm run db:seed
```

### Production

The production database uses the `main` Neon branch. The connection string for production is set in Vercel's environment variables — never point your local `.env.local` at the production endpoint when developing.

## Deployment

Deploy to Vercel and set environment variables in the Vercel dashboard. Cron jobs are configured in `vercel.json`.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Neon (Serverless PostgreSQL)
- **ORM**: Drizzle ORM
- **Auth**: NextAuth.js v5 + Resend (magic links)
- **Styling**: Tailwind CSS v4
- **Charts**: Recharts
- **Icons**: Lucide React
