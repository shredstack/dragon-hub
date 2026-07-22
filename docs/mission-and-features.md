# DragonHub — Mission & Feature Overview

_Last reviewed: 2026-07-22_

A plain-language overview of what DragonHub does, who it serves, and which manual PTA
processes it replaces. Written for board members, prospective schools, and anyone
onboarding to the project. For setup and tech-stack details, see [the README](../README.md).

---

## Mission

Utah PTA's mission — adopted verbatim from National PTA — is _"to make every child's
potential a reality by engaging and empowering families and communities to advocate for
all children."_ DragonHub's
contribution to that mission is removing the friction that stops willing families from
engaging and stops capable boards from being effective.

> **DragonHub exists to make every child's potential a reality by removing the friction
> between a family's willingness to help and their ability to.**
>
> We do that by giving PTAs one place where institutional knowledge is preserved instead
> of lost, where volunteering takes a scan and a minute instead of an email chain, and
> where every incoming board member inherits everything their predecessor knew. When the
> work of running a PTA gets easier, more families say yes — and more of them stay.

**Short form** (landing page, app header, flyers):

> **Turning potential into reality — by making it easy for every family to show up.**

**Alternates**, depending on the audience:

- _Engagement-first:_ "Every family has something to give. DragonHub makes it easy to give it."
- _Continuity-first:_ "No PTA should have to start over every year. DragonHub remembers,
  so families can focus on the kids."

### Where the mission shows up in the product

All mission copy lives in [`src/lib/mission.ts`](../src/lib/mission.ts) — one source of
truth, so the wording stays identical everywhere. Edit it there, not in the pages.

| Surface | What it shows | Why it belongs there |
|---|---|---|
| [Landing page](../src/app/page.tsx) | Tagline, full statement, quoted PTA mission, three pillars | First impression |
| [Room parent signup](../src/app/volunteer-signup/%5Bcode%5D/page.tsx) | `MissionNote` below the form | The moment a parent decides whether to say yes |
| [Volunteer interest campaigns](../src/app/volunteer-interest/%5Bcode%5D/page.tsx) | `MissionNote` below the form | Same |
| [Board onboarding hub](../src/components/onboarding/onboarding-dashboard.tsx) | `MISSION_BOARD_NOTE` banner above the checklist | The moment a new board member decides whether they're in over their head |

The quoted mission is attributed to **National PTA**, whose wording state PTAs (including
Utah) adopt verbatim — so it reads correctly for every school on the platform, not just
Utah ones.

---

## What DragonHub is

A PTA operating system. It replaces the three things every PTA runs on — scattered
spreadsheets, a 2015-era mass-email tool, and tribal knowledge that walks out the door
every June — with one school-scoped app that has both a parent-facing side and a
board-facing side.

The architecture reflects a specific insight: **most PTA pain isn't doing the work, it's
re-learning the work.** So much of the app is machinery for capturing knowledge as a side
effect of normal activity, then serving it back to whoever needs it next.

---

## For parents and members

| Feature | Manual process it replaces |
|---|---|
| **Dashboard + unified Calendar** (Google Calendar sync every 6h) | Checking the school calendar, the PTA calendar, and the weekly email |
| **Classrooms** — message board, task list, roster, room-parent coordination | Group texts that lose context; a shared doc nobody can find |
| **Volunteer Hours** — self-log, board approves, leaderboard, CSV export | Paper sign-in sheets and a treasurer's tally spreadsheet |
| **Budget & Fundraisers** — synced from Google Sheets / 32auctions | "Can someone send me the current budget?" |
| **Knowledge Base + Ask-a-Question** — semantic search with cited sources | Emailing last year's chair and hoping they reply |
| **QR-code signup flows** — volunteer campaigns and room parent signup | Clipboards at Back to School Night, then hand-typing 200 names |
| **Mobile app** (Capacitor iOS/Android, push notifications) | Email-only reach |

Two details worth calling out, because they do most of the work of turning interest into
participation:

- **No-account signup.** A parent scans a QR code, fills a form, and gets a one-click
  magic sign-in link. They're attached to the school for the current year automatically
  ([`volunteer-onboarding.ts`](../src/lib/volunteer-onboarding.ts)). There is nearly zero
  friction between "I'd help" and being in the system.
- **Eligibility notices** ([`volunteer-eligibility.ts`](../src/lib/volunteer-eligibility.ts)).
  Every new volunteer sees the district background-check requirement at signup and in the
  welcome email, configurable per school without a deploy. That annual renewal is the #1
  thing that silently blocks a willing parent from ever making it on campus.

---

## For the board

### Institutional memory, automated

- **Handoff notes** — outgoing officers document accomplishments, open projects, contacts,
  and gotchas; AI summarizes across up to three years.
- **AI role guides** ([`onboarding-guides.ts`](../src/actions/onboarding-guides.ts)) — a new
  Treasurer gets a synthesized guide built from handoff notes, Knowledge Base articles, and
  indexed Drive files: overview, responsibilities, first-week checklist, month-by-month
  calendar, key contacts, tips. Can be published back to the Knowledge Base.
- **Minutes → knowledge** ([`minutes-to-articles.ts`](../src/lib/ai/minutes-to-articles.ts)) —
  meeting minutes sync from Drive, get analyzed for decisions and action items, and are
  converted into Knowledge Base articles. Knowledge accrues without anyone doing
  "documentation work."
- **Event wrap-ups fold back into the catalog** (`event_plan_wrap_ups` in
  [`schema.ts`](../src/lib/db/schema.ts)) — what worked, what to change, actual cost, actual
  volunteers — merged into the catalog entry so next year's chair starts from truth rather
  than from a guess someone typed once.
- **Whiteboard transcription** ([`whiteboard-transcription.ts`](../src/lib/ai/whiteboard-transcription.ts)) —
  photograph a planning meeting whiteboard, get structured notes and action items back.
- **Regional resource hierarchy** — state → district → school onboarding resources, so a new
  school inherits a working baseline on day one and can customize from there.

### Operations, de-manualized

- **Weekly email builder** — board members drop content in all week; AI assembles a polished
  email with calendar summaries and recurring sections, with separate PTA-member and
  school-wide audience targeting.
- **AI agendas** — drafted from the same month in prior years plus recent meeting context.
- **Event planning** — tasks, Drive resources, approval voting, meetings, clone-from-prior-year,
  and AI recommendations grounded in the school's own past documents.
- **School-year rollover** ([`classroom-rollover.ts`](../src/lib/classroom-rollover.ts)) —
  classrooms carry forward by lineage while last year's roster, messages, and signups stay
  attached to the year they actually happened in. The annual "start over from scratch"
  ritual becomes one click.
- **Member directory + CSV export**, school contacts, tags, media library, and a single
  [PTA Board Hub](../src/app/(app)/admin/board/page.tsx) so nobody has to hunt for admin pages.

### The through-line

Every AI feature cites its sources, and every generated artifact is grounded in the
school's *own* history. It isn't a chatbot bolted on — it's retrieval over the
institution's memory.

---

## Platform capabilities

- **Multi-school** — isolated data per school, join codes for member onboarding,
  independent configuration, and a super admin console over the top.
- **Google Workspace integration** — Calendar, Drive, and Sheets via service account, with
  an in-app setup guide that walks non-technical board members through Google Cloud Console.
- **Role-based access** — members see community features, room parents manage their
  classrooms, PTA board members access admin tools, school admins configure integrations.
  Specific board positions (president, treasurer, secretary, …) are tracked so guidance and
  tooling can be role-aware.
- **Mobile responsive + native shells** — every feature works on phones and tablets;
  Capacitor wraps the app for iOS and Android with push notification support.
