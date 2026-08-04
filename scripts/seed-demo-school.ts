/**
 * Seeds the school an App Store / Play reviewer signs into.
 *
 *     npx tsx scripts/seed-demo-school.ts
 *
 * Both stores reject an app whose content sits behind a login they cannot get
 * past, and DragonHub's only other door is a magic link to a school address a
 * reviewer does not have. The Credentials provider in `src/lib/auth.ts` is that
 * door; this script is what is behind it.
 *
 * Two properties matter:
 *
 * **Idempotent.** Run it before every release. It finds the demo school by
 * join code and rebuilds its contents rather than accumulating duplicates, so
 * a reviewer never lands on the same committee listed four times.
 *
 * **Entirely fictional.** Every name, address and email below is invented. No
 * real family's data goes anywhere near a screen a stranger signs into — which
 * is also why the demo school is its own school row rather than a copy of a
 * live one.
 *
 * Requires `DEMO_LOGIN_EMAIL` to be set; that address becomes the reviewer's
 * `pta_board` account. Set `DEMO_LOGIN_PASSWORD` on the deployment too — this
 * script never sees it, because the Credentials provider compares against the
 * environment rather than against anything stored here.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { STANDARD_BOARD_POSITIONS } from "../src/lib/board-positions-shared";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const SCHOOL_NAME = "Willow Creek Elementary";
const JOIN_CODE = "WILLOW-DEMO";
const YEAR = "2025-2026";

/** Everyone in the demo school. Fictional, deliberately and completely. */
const CAST = {
  demo: { name: "Alex Reviewer", email: "" }, // filled from DEMO_LOGIN_EMAIL
  priya: { name: "Priya Raman", email: "priya.raman@willowcreek.example" },
  marcus: { name: "Marcus Webb", email: "marcus.webb@willowcreek.example" },
  dana: { name: "Dana Okafor", email: "dana.okafor@willowcreek.example" },
  ines: { name: "Inés Salazar", email: "ines.salazar@willowcreek.example" },
  jonah: { name: "Jonah Kestler", email: "jonah.kestler@willowcreek.example" },
  teacherA: { name: "Ms. Bellweather", email: "bellweather@willowcreek.example" },
  teacherB: { name: "Mr. Ondaatje", email: "ondaatje@willowcreek.example" },
  teacherC: { name: "Mrs. Fenwick", email: "fenwick@willowcreek.example" },
} as const;

async function main() {
  const demoEmail = process.env.DEMO_LOGIN_EMAIL?.trim().toLowerCase();
  if (!demoEmail) {
    console.error(
      "DEMO_LOGIN_EMAIL is not set. That address is the reviewer's account, so there is nothing to seed against."
    );
    process.exit(1);
  }
  if (!process.env.DEMO_LOGIN_PASSWORD) {
    console.warn(
      "⚠️  DEMO_LOGIN_PASSWORD is not set in this environment. The seed will still run, but the demo provider will not register until it is set on the deployment."
    );
  }

  console.log(`🌱 Seeding demo school "${SCHOOL_NAME}"…\n`);

  // ── School ────────────────────────────────────────────────────────────────
  let school = await db.query.schools.findFirst({
    where: eq(schema.schools.joinCode, JOIN_CODE),
  });

  if (school) {
    console.log("Found existing demo school — clearing its contents.");
    await clearSchoolContents(school.id);
  } else {
    [school] = await db
      .insert(schema.schools)
      .values({
        name: SCHOOL_NAME,
        joinCode: JOIN_CODE,
        mascot: "Herons",
        address: "1 Willow Creek Way, Springfield",
        state: "Utah",
        district: "Willow Creek School District",
        currentSchoolYear: YEAR,
        availableSchoolYears: [YEAR, "2024-2025"],
        volunteerSettings: {
          roomParentLimit: 2,
          partyTypes: ["Halloween", "Winter", "Valentine's", "End of Year"],
          enabled: true,
          roomParentWaitlist: true,
        },
      })
      .returning();
    console.log(`Created school ${school.id}`);
  }
  const schoolId = school.id;

  // ── People ────────────────────────────────────────────────────────────────
  const cast = { ...CAST, demo: { ...CAST.demo, email: demoEmail } };
  const userIds: Record<keyof typeof CAST, string> = {} as never;

  for (const [key, person] of Object.entries(cast)) {
    // Upsert by email: the reviewer's account may already exist from a
    // previous release, and re-creating it would orphan their session.
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, person.email),
      columns: { id: true },
    });
    if (existing) {
      await db
        .update(schema.users)
        .set({ name: person.name, emailVerified: new Date() })
        .where(eq(schema.users.id, existing.id));
      userIds[key as keyof typeof CAST] = existing.id;
    } else {
      const [row] = await db
        .insert(schema.users)
        .values({
          name: person.name,
          email: person.email,
          emailVerified: new Date(),
        })
        .returning({ id: schema.users.id });
      userIds[key as keyof typeof CAST] = row.id;
    }
  }
  console.log(`Ensured ${Object.keys(cast).length} demo accounts`);

  // ── Memberships ───────────────────────────────────────────────────────────
  // `membership_source` is NOT NULL with no default precisely so that a new
  // admission path has to decide what it is. This one is `demo`, added to the
  // enum in migration 0069 — the reviewer did not come through a join code, a
  // signup, or an invite, and pretending otherwise would put them in the PTA
  // directory as something they aren't.
  const boardMembers: Array<[keyof typeof CAST, string]> = [
    ["demo", "president"],
    ["priya", "treasurer"],
    ["marcus", "secretary"],
  ];

  for (const [key, position] of boardMembers) {
    await upsertMembership({
      schoolId,
      userId: userIds[key],
      role: "pta_board",
      boardPosition: position,
      source: "demo",
    });
  }
  for (const key of ["dana", "ines", "jonah"] as const) {
    await upsertMembership({
      schoolId,
      userId: userIds[key],
      role: "member",
      source: "demo",
    });
  }
  for (const key of ["teacherA", "teacherB", "teacherC"] as const) {
    await upsertMembership({
      schoolId,
      userId: userIds[key],
      role: "member",
      source: "demo",
    });
  }
  console.log("Ensured memberships (3 board, 6 members)");

  // ── Board positions ───────────────────────────────────────────────────────
  await db
    .insert(schema.boardPositions)
    .values(
      STANDARD_BOARD_POSITIONS.map((p, i) => ({
        schoolId,
        slug: p.slug,
        label: p.label,
        description: p.description,
        sortOrder: i,
        active: true,
      }))
    )
    .onConflictDoNothing();
  console.log(`Seeded ${STANDARD_BOARD_POSITIONS.length} board positions`);

  // ── Classrooms ────────────────────────────────────────────────────────────
  const classroomSpecs = [
    { name: "Ms. Bellweather's Kindergarten", grade: "Kindergarten", teacher: "teacherA" },
    { name: "Room 4 — Kindergarten", grade: "Kindergarten", teacher: "teacherA" },
    { name: "Mr. Ondaatje's 2nd Grade", grade: "2nd Grade", teacher: "teacherB" },
    { name: "Room 12 — 2nd Grade", grade: "2nd Grade", teacher: "teacherB" },
    { name: "Mrs. Fenwick's 4th Grade", grade: "4th Grade", teacher: "teacherC" },
    { name: "Room 21 — 4th Grade", grade: "4th Grade", teacher: "teacherC" },
  ] as const;

  const classrooms = await db
    .insert(schema.classrooms)
    .values(
      classroomSpecs.map((c) => ({
        schoolId,
        name: c.name,
        gradeLevel: c.grade,
        teacherEmail: cast[c.teacher].email,
        schoolYear: YEAR,
        active: true,
      }))
    )
    .returning();

  // Lineage is self-referential for a room's first year.
  for (const room of classrooms) {
    await db
      .update(schema.classrooms)
      .set({ lineageId: room.id })
      .where(eq(schema.classrooms.id, room.id));
  }

  const roomParentAssignments: Array<[number, keyof typeof CAST]> = [
    [0, "dana"],
    [2, "ines"],
    [2, "demo"],
    [4, "jonah"],
  ];
  await db.insert(schema.classroomMembers).values([
    ...classroomSpecs.map((c, i) => ({
      classroomId: classrooms[i].id,
      userId: userIds[c.teacher],
      role: "teacher" as const,
    })),
    ...roomParentAssignments.map(([i, key]) => ({
      classroomId: classrooms[i].id,
      userId: userIds[key],
      role: "room_parent" as const,
    })),
  ]);
  console.log(`Created ${classrooms.length} classrooms with rosters`);

  // A message board with something on it. An empty board tells a reviewer
  // nothing about what the app is for.
  await db.insert(schema.classroomMessages).values([
    {
      classroomId: classrooms[2].id,
      authorId: userIds.ines,
      message:
        "Winter party is set for the 19th at 1:30. I've got cups and napkins covered — could someone take drinks and someone take the craft?",
      accessLevel: "public",
    },
    {
      classroomId: classrooms[2].id,
      authorId: userIds.teacherB,
      message:
        "Thank you both! Please remember we have two students with nut allergies, so store-bought and labelled only.",
      accessLevel: "public",
    },
    {
      classroomId: classrooms[2].id,
      authorId: userIds.ines,
      message:
        "Room parents — the sign-up sheet is in the shared folder if you want to add yourself for the craft table.",
      accessLevel: "room_parents_only",
    },
  ]);

  await db.insert(schema.classroomTasks).values([
    {
      classroomId: classrooms[2].id,
      createdBy: userIds.ines,
      title: "Confirm drink donations",
      description: "Two 2-litre bottles, caffeine free.",
      dueDate: daysFromNow(3),
      assignedTo: userIds.demo,
      completed: false,
    },
    {
      classroomId: classrooms[2].id,
      createdBy: userIds.ines,
      title: "Print allergy-safe snack list",
      dueDate: daysFromNow(1),
      assignedTo: userIds.ines,
      completed: true,
    },
  ]);

  // ── Committees ────────────────────────────────────────────────────────────
  const committees = await db
    .insert(schema.committees)
    .values([
      {
        schoolId,
        schoolYear: YEAR,
        name: "Yearbook Committee",
        description:
          "Photographs, layout and the mad dash to the printer's deadline in March.",
        responsibilities:
          "Collect photos from events, lay out spreads, proof, and coordinate orders.",
        typicalTiming: "September through March",
        timeCommitment: "About 3 hours a month",
        iconEmoji: "📸",
        scope: "school",
        status: "active",
        capacityMode: "capped",
        maxSize: 4,
        waitlistEnabled: true,
        joinCode: "WILLOW-YEARBOOK",
      },
      {
        schoolId,
        schoolYear: YEAR,
        name: "Fall Carnival",
        description:
          "The biggest night of the autumn — booths, a cakewalk, and roughly nine hundred raffle tickets.",
        responsibilities:
          "Book the bounce houses, recruit booth volunteers, run the ticket table.",
        typicalTiming: "August through October",
        timeCommitment: "Heavy in October, light before",
        iconEmoji: "🎪",
        scope: "school",
        status: "active",
        capacityMode: "open",
        waitlistEnabled: false,
        joinCode: "WILLOW-CARNIVAL",
      },
    ])
    .returning();

  const yearbook = committees[0];
  const carnival = committees[1];

  // Yearbook is capped at 4 with a waitlist, and seeded full plus one waiting —
  // so a reviewer can see the waitlist mechanic without having to create it.
  const yearbookSignups: Array<{
    key: keyof typeof CAST;
    role: "chair" | "member";
    status: "active" | "waitlisted";
  }> = [
    { key: "dana", role: "chair", status: "active" },
    { key: "demo", role: "member", status: "active" },
    { key: "priya", role: "member", status: "active" },
    { key: "marcus", role: "member", status: "active" },
    { key: "jonah", role: "member", status: "waitlisted" },
  ];

  for (const s of yearbookSignups) {
    await db.insert(schema.committeeSignups).values({
      schoolId,
      committeeId: yearbook.id,
      userId: userIds[s.key],
      name: cast[s.key].name,
      email: cast[s.key].email,
      role: s.role,
      status: s.status,
      schoolYear: YEAR,
      signupSource: "manual",
      waitlistedAt: s.status === "waitlisted" ? new Date() : null,
    });
    if (s.status === "active") {
      await db.insert(schema.committeeMembers).values({
        committeeId: yearbook.id,
        userId: userIds[s.key],
        role: s.role,
      });
    }
  }

  for (const key of ["ines", "demo"] as const) {
    await db.insert(schema.committeeSignups).values({
      schoolId,
      committeeId: carnival.id,
      userId: userIds[key],
      name: cast[key].name,
      email: cast[key].email,
      role: key === "ines" ? "chair" : "member",
      status: "active",
      schoolYear: YEAR,
      signupSource: "manual",
    });
    await db.insert(schema.committeeMembers).values({
      committeeId: carnival.id,
      userId: userIds[key],
      role: key === "ines" ? "chair" : "member",
    });
  }

  await db.insert(schema.committeeMessages).values([
    {
      committeeId: yearbook.id,
      authorId: userIds.dana,
      message:
        "Printer quote came back: $8.40 a copy at 120 pages if we commit by 1 March. Cheaper than last year.",
      chairsOnly: false,
    },
    {
      committeeId: yearbook.id,
      authorId: userIds.priya,
      message:
        "That fits the budget line with room to spare. I'll get it on the agenda for the next meeting.",
      chairsOnly: false,
    },
    {
      committeeId: carnival.id,
      authorId: userIds.ines,
      message:
        "Bounce house vendor confirmed for the 18th. Still need four people for the ticket table, 5–7pm.",
      chairsOnly: false,
    },
  ]);

  await db.insert(schema.committeeTasks).values([
    {
      committeeId: yearbook.id,
      createdBy: userIds.dana,
      title: "Collect Fall Carnival photos",
      description: "Anything usable from the cakewalk and the costume parade.",
      dueDate: daysFromNow(5),
      assignedTo: userIds.demo,
      completed: false,
    },
    {
      committeeId: carnival.id,
      createdBy: userIds.ines,
      title: "Confirm raffle prize donations",
      dueDate: daysFromNow(2),
      assignedTo: userIds.demo,
      completed: false,
    },
  ]);
  console.log("Created 2 committees with rosters, a waitlist, threads and tasks");

  // ── Event plans ───────────────────────────────────────────────────────────
  const plans = await db
    .insert(schema.eventPlans)
    .values([
      {
        schoolId,
        title: "Spring Book Fair",
        description:
          "A week in the library with the book vendor, plus a family evening on the Thursday.",
        eventType: "school",
        isOneOff: false,
        eventDate: daysFromNow(45),
        location: "Library",
        budget: "1200.00",
        schoolYear: YEAR,
        status: "draft",
        createdBy: userIds.demo,
      },
      {
        schoolId,
        title: "Staff Appreciation Lunch",
        description:
          "Catered lunch for all 38 staff during the in-service day, plus handwritten notes from every class.",
        eventType: "pta",
        isOneOff: false,
        eventDate: daysFromNow(20),
        location: "Staff room",
        budget: "600.00",
        schoolYear: YEAR,
        status: "approved",
        createdBy: userIds.priya,
      },
      {
        schoolId,
        title: "Fall Carnival",
        description:
          "Booths, cakewalk, bounce houses and the raffle. The PTA's biggest fundraiser of the autumn.",
        eventType: "pta",
        isOneOff: false,
        eventDate: daysFromNow(-60),
        location: "Blacktop and field",
        budget: "3500.00",
        schoolYear: YEAR,
        status: "completed",
        createdBy: userIds.ines,
      },
    ])
    .returning();

  await db.insert(schema.eventPlanMembers).values([
    { eventPlanId: plans[0].id, userId: userIds.demo, role: "lead", leadType: "board" },
    { eventPlanId: plans[0].id, userId: userIds.dana, role: "member" },
    { eventPlanId: plans[1].id, userId: userIds.priya, role: "lead", leadType: "board" },
    { eventPlanId: plans[1].id, userId: userIds.demo, role: "member" },
    { eventPlanId: plans[2].id, userId: userIds.ines, role: "lead", leadType: "committee_chair" },
  ]);

  await db.insert(schema.eventPlanTasks).values([
    {
      eventPlanId: plans[0].id,
      title: "Book the vendor for the week of the 14th",
      dueDate: daysFromNow(7),
      assignedTo: userIds.demo,
      createdBy: userIds.demo,
      sortOrder: 0,
      timingTag: "week_plus_before",
    },
    {
      eventPlanId: plans[0].id,
      title: "Recruit 6 volunteers for the family evening",
      dueDate: daysFromNow(30),
      assignedTo: userIds.dana,
      createdBy: userIds.demo,
      sortOrder: 1,
      timingTag: "days_before",
    },
    {
      eventPlanId: plans[1].id,
      title: "Confirm final head count with the office",
      dueDate: daysFromNow(12),
      assignedTo: userIds.demo,
      createdBy: userIds.priya,
      sortOrder: 0,
      timingTag: "week_plus_before",
      completed: true,
    },
  ]);

  await db.insert(schema.eventPlanMessages).values([
    {
      eventPlanId: plans[0].id,
      authorId: userIds.dana,
      message:
        "Do we want the family evening on Thursday again? Attendance was much better than the Tuesday the year before.",
    },
    {
      eventPlanId: plans[0].id,
      authorId: userIds.demo,
      message: "Thursday it is. I'll put it to the vendor when I book.",
    },
  ]);

  await db.insert(schema.eventPlanWrapUps).values({
    eventPlanId: plans[2].id,
    whatWorked:
      "Selling raffle tickets in advance through the office took most of the pressure off the night itself. The cakewalk ran itself once we had a music volunteer.",
    whatToChange:
      "Two ticket tables, not one — the queue at 5:30 was twenty minutes long. Order 30% more small change.",
    actualCost: "3180.00",
    actualVolunteers: "41",
    submittedBy: userIds.ines,
  });
  console.log("Created 3 event plans (draft, approved, completed with wrap-up)");

  // ── Budget ────────────────────────────────────────────────────────────────
  const categories = await db
    .insert(schema.budgetCategories)
    .values(
      [
        ["Fundraising", "8000.00"],
        ["Staff Appreciation", "1500.00"],
        ["Classroom Support", "4000.00"],
        ["Events", "5500.00"],
        ["Administration", "900.00"],
      ].map(([name, allocated]) => ({
        schoolId,
        name,
        allocatedAmount: allocated,
        schoolYear: YEAR,
      }))
    )
    .returning();

  const transactionSpecs: Array<[number, string, string, number]> = [
    [3, "Bounce house rental — Fall Carnival", "-1450.00", -62],
    [3, "Carnival prizes and raffle stock", "-620.00", -64],
    [3, "Cakewalk supplies", "-88.40", -61],
    [0, "Fall Carnival ticket sales", "4820.00", -59],
    [0, "Raffle proceeds", "1310.00", -59],
    [1, "Staff appreciation breakfast", "-284.15", -50],
    [1, "Teacher classroom stipends (round 1)", "-760.00", -44],
    [2, "Library book restock", "-412.60", -40],
    [2, "Art supplies — 4th grade", "-195.20", -38],
    [2, "STEM night consumables", "-330.00", -33],
    [4, "Website and software", "-149.00", -30],
    [4, "PO box and postage", "-62.00", -28],
    [0, "Spirit wear sales", "980.00", -26],
    [3, "Movie night licence", "-125.00", -22],
    [3, "Movie night popcorn", "-73.85", -21],
    [1, "Conference week meals", "-410.00", -18],
    [2, "Kindergarten manipulatives", "-268.75", -14],
    [0, "Direct donation drive", "2240.00", -10],
    [3, "Book fair vendor deposit", "-300.00", -6],
    [4, "Insurance premium", "-425.00", -3],
  ];

  await db.insert(schema.budgetTransactions).values(
    transactionSpecs.map(([catIdx, description, amount, dayOffset]) => ({
      schoolId,
      categoryId: categories[catIdx].id,
      description,
      amount,
      date: isoDate(dayOffset),
    }))
  );

  const fundraisers = await db
    .insert(schema.fundraisers)
    .values([
      {
        schoolId,
        name: "Heron Fun Run",
        goalAmount: "15000.00",
        startDate: isoDate(-20),
        endDate: isoDate(10),
        active: true,
      },
      {
        schoolId,
        name: "Spring Direct Give",
        goalAmount: "8000.00",
        startDate: isoDate(30),
        endDate: isoDate(60),
        active: true,
      },
    ])
    .returning();

  await db.insert(schema.fundraiserStats).values([
    { fundraiserId: fundraisers[0].id, totalRaised: "11240.00", totalDonors: 168 },
    { fundraiserId: fundraisers[1].id, totalRaised: "0.00", totalDonors: 0 },
  ]);
  console.log(
    `Created budget (${categories.length} categories, ${transactionSpecs.length} transactions) and 2 fundraisers`
  );

  // ── Knowledge base ────────────────────────────────────────────────────────
  const articleSpecs: Array<{
    title: string;
    category: string;
    summary: string;
    body: string;
    everyone: boolean;
  }> = [
    {
      title: "How to run the cakewalk",
      category: "events",
      summary: "Everything the cakewalk needs, and the two things that always go wrong.",
      body: "Twenty numbered squares in a circle, chalk on the blacktop. One volunteer on music, one calling numbers, one restocking cakes.\n\nThe two things that always go wrong: running out of small change (bring $80 in ones) and losing the music halfway through (bring a charged phone AND a battery pack).",
      everyone: true,
    },
    {
      title: "Reimbursement: how to get your money back",
      category: "procedures",
      summary: "Receipt, form, treasurer. Under two weeks if you do it in that order.",
      body: "Photograph the receipt the day you buy. Fill in the reimbursement form with the budget line it belongs to — ask the chair if you're unsure, guessing creates work for the treasurer.\n\nSubmit within 30 days. Cheques go out at the monthly board meeting.",
      everyone: true,
    },
    {
      title: "Booking the multipurpose room",
      category: "procedures",
      summary: "The office calendar is the only one that counts.",
      body: "Email the office manager with the date, the hours including setup and cleanup, and the expected numbers. Anything over 100 people needs the custodial supervisor to sign off too.\n\nA date in the PTA calendar is not a booking until it is in the school's.",
      everyone: true,
    },
    {
      title: "Volunteer background checks",
      category: "volunteers",
      summary: "District requirement for anyone unsupervised with students.",
      body: "Anyone volunteering unsupervised with students needs the district's clearance, which takes about two weeks. Start the term with a push at Back to School Night — chasing it in October is what makes field trips fall through.",
      everyone: true,
    },
    {
      title: "Fall Carnival: the whole playbook",
      category: "events",
      summary: "Timeline, vendors, volunteer counts and what last year taught us.",
      body: "Book bounce houses in June — the good vendors are gone by August.\n\nVolunteer count: 40 minimum, in two shifts. Two ticket tables, not one.\n\nSell raffle tickets in advance through the office. It moves half the revenue off the night itself and shortens every queue.",
      everyone: true,
    },
    {
      title: "Treasurer handover checklist",
      category: "onboarding",
      summary: "Bank signatories, the reconciliation rhythm, and the audit.",
      body: "Change bank signatories in the first week — everything else waits on it. Reconcile monthly against the statement, not the spreadsheet.\n\nThe annual audit needs three months' notice to the auditor.",
      everyone: false,
    },
    {
      title: "Budget approval process",
      category: "budget",
      summary: "What needs a vote, and what a chair can just spend.",
      body: "Anything inside an approved budget line is the chair's call. Anything over it, or outside it, needs a board vote at a meeting with quorum.\n\nOver $500 unbudgeted goes to the general membership.",
      everyone: false,
    },
    {
      title: "Writing the newsletter",
      category: "communications",
      summary: "Deadlines, tone, and the three sections that always get read.",
      body: "Copy due to the secretary by the Wednesday before. Lead with dates, not prose — the calendar block is the most-read part of every issue, followed by volunteer asks and thank-yous.",
      everyone: true,
    },
  ];

  const articles = await db
    .insert(schema.knowledgeArticles)
    .values(
      articleSpecs.map((a) => ({
        schoolId,
        title: a.title,
        slug: slugify(a.title),
        summary: a.summary,
        body: a.body,
        category: a.category,
        status: "published" as const,
        schoolYear: YEAR,
        createdBy: userIds.demo,
        publishedAt: new Date(),
      }))
    )
    .returning();

  // Audiences are fail-closed: an article with no rows is board-only. The
  // reviewer signs in as board and would see everything either way, but seeding
  // it correctly is what makes the audience picker show something real.
  const shared = articles.filter((_, i) => articleSpecs[i].everyone);
  if (shared.length > 0) {
    await db.insert(schema.knowledgeArticleAudiences).values(
      shared.map((a) => ({
        articleId: a.id,
        audienceType: "everyone" as const,
      }))
    );
  }
  console.log(
    `Created ${articles.length} knowledge articles (${shared.length} shared with everyone)`
  );

  // ── Important links ───────────────────────────────────────────────────────
  await db.insert(schema.importantLinks).values([
    {
      schoolId,
      title: "School lunch menu",
      description: "This month's menu and allergen information.",
      url: "https://example.com/willow-creek/lunch-menu",
      iconEmoji: "🍎",
      openMode: "new_tab",
      sortOrder: 0,
      createdBy: userIds.demo,
    },
    {
      schoolId,
      title: "Report an absence",
      description: "The office line and the online form.",
      url: "https://example.com/willow-creek/attendance",
      iconEmoji: "📋",
      openMode: "new_tab",
      sortOrder: 1,
      createdBy: userIds.demo,
    },
    {
      schoolId,
      title: "District volunteer application",
      description: "Required before volunteering unsupervised with students.",
      url: "https://example.com/willow-creek/volunteer-application",
      iconEmoji: "✅",
      openMode: "new_tab",
      sortOrder: 2,
      createdBy: userIds.demo,
    },
  ]);

  // ── Handoff notes ─────────────────────────────────────────────────────────
  await db.insert(schema.boardHandoffNotes).values([
    {
      schoolId,
      position: "treasurer",
      schoolYear: "2024-2025",
      fromUserId: userIds.marcus,
      toUserId: userIds.priya,
      title: "Treasurer, 2024-25 → 2025-26",
      source: "manual",
      keyAccomplishments:
        "Moved the books off the shared spreadsheet and onto a real ledger. Cleared the two-year backlog of unreimbursed receipts.",
      ongoingProjects:
        "Annual audit is booked for July. The insurance renewal quote is due in May and last year's went up 18%.",
      tipsAndAdvice:
        "Reconcile monthly, not quarterly. The bank takes three weeks to change signatories — start in week one.",
      importantContacts:
        "Auditor: Redmond & Fell. Bank: Springfield Community, ask for the business desk.",
    },
    {
      schoolId,
      position: "president",
      schoolYear: "2024-2025",
      fromUserId: userIds.dana,
      toUserId: userIds.demo,
      title: "President, 2024-25 → 2025-26",
      source: "manual",
      keyAccomplishments:
        "Carnival cleared $6.4k net. Got the district to stop scheduling in-service days on our two biggest events.",
      ongoingProjects:
        "Playground shade structure — quote in hand, needs a fundraising decision by February.",
      tipsAndAdvice:
        "Agree the year's calendar with the principal in August. Everything else is easier once that is fixed.",
    },
  ]);
  console.log("Created important links and handoff notes");

  // ── Notifications ─────────────────────────────────────────────────────────
  // So the bell has a count and the inbox has content the moment the reviewer
  // signs in. An empty inbox behind a notification permission prompt is the
  // exact thing Guideline 4.2 is suspicious of.
  const notificationSpecs: Array<{
    type: string;
    title: string;
    body: string;
    url: string;
    hoursAgo: number;
    read: boolean;
    actor?: keyof typeof CAST;
    collapsed?: number;
  }> = [
    { type: "committee_message", title: "Yearbook Committee", body: "Dana Okafor: Printer quote came back: $8.40 a copy at 120 pages if we commit by 1 March.", url: `/committees/${yearbook.id}`, hoursAgo: 1, read: false, actor: "dana", collapsed: 2 },
    { type: "mention", title: "Inés Salazar mentioned you", body: "Fall Carnival: still need four people for the ticket table, 5–7pm.", url: `/committees/${carnival.id}`, hoursAgo: 2, read: false, actor: "ines" },
    { type: "task_assigned", title: "New task for you", body: "Collect Fall Carnival photos — Yearbook Committee", url: `/committees/${yearbook.id}`, hoursAgo: 4, read: false, actor: "dana" },
    { type: "approval_requested", title: "An event plan needs your vote", body: "Spring Book Fair was submitted for approval.", url: `/events/${plans[0].id}`, hoursAgo: 6, read: false, actor: "priya" },
    { type: "classroom_message", title: "Mr. Ondaatje's 2nd Grade", body: "Ms. Bellweather: Please remember we have two students with nut allergies.", url: `/classrooms/${classrooms[2].id}`, hoursAgo: 9, read: false, actor: "teacherB", collapsed: 3 },
    { type: "task_due_soon", title: "Due tomorrow", body: "Confirm raffle prize donations — Fall Carnival", url: `/committees/${carnival.id}`, hoursAgo: 12, read: false },
    { type: "new_member_pending", title: "Someone is waiting to be approved", body: "Jonah Kestler used a code for Willow Creek Elementary that needs a board member to say yes.", url: "/admin/members", hoursAgo: 20, read: false, actor: "jonah" },
    { type: "announcement", title: "Fun Run moved to Friday", body: "Rain moved the Heron Fun Run to Friday at 9am. Same field, same volunteer shifts.", url: "/notifications", hoursAgo: 26, read: true, actor: "priya" },
    { type: "hours_approved", title: "Your volunteer hours were approved", body: "4 hours for Fall Carnival.", url: "/volunteer-hours", hoursAgo: 30, read: true, actor: "priya" },
    { type: "signup_promoted", title: "You're off the waitlist", body: "A spot opened on Yearbook Committee and it's yours.", url: "/committees", hoursAgo: 36, read: true },
    { type: "event_plan_message", title: "Spring Book Fair", body: "Dana Okafor: Do we want the family evening on Thursday again?", url: `/events/${plans[0].id}`, hoursAgo: 40, read: true, actor: "dana" },
    { type: "approval_decided", title: "Your event plan was approved", body: "Staff Appreciation Lunch has the votes it needed.", url: `/events/${plans[1].id}`, hoursAgo: 48, read: true, actor: "marcus" },
    { type: "shift_reminder", title: "You're on tomorrow", body: "Ticket table at 5:00 PM — Blacktop", url: `/committees/${carnival.id}`, hoursAgo: 54, read: true },
    { type: "committee_message", title: "Fall Carnival", body: "Inés Salazar: Bounce house vendor confirmed for the 18th.", url: `/committees/${carnival.id}`, hoursAgo: 60, read: true, actor: "ines" },
    { type: "feedback_reply", title: "Reply on your feedback", body: "Thanks for flagging this — the calendar sync is fixed in this release.", url: "/feedback", hoursAgo: 70, read: true },
    { type: "classroom_message", title: "Ms. Bellweather's Kindergarten", body: "Dana Okafor: Craft supplies for Friday are in the classroom cupboard.", url: `/classrooms/${classrooms[0].id}`, hoursAgo: 78, read: true, actor: "dana" },
    { type: "task_assigned", title: "New task for you", body: "Confirm drink donations — Mr. Ondaatje's 2nd Grade", url: `/classrooms/${classrooms[2].id}`, hoursAgo: 90, read: true, actor: "ines" },
    { type: "announcement", title: "Volunteer clearances due", body: "If you plan to help on a field trip this year, get your district clearance started now — it takes about two weeks.", url: "/notifications", hoursAgo: 100, read: true, actor: "demo" },
    { type: "task_due_soon", title: "Due tomorrow", body: "Print allergy-safe snack list — Mr. Ondaatje's 2nd Grade", url: `/classrooms/${classrooms[2].id}`, hoursAgo: 120, read: true },
    { type: "hours_approved", title: "Your volunteer hours were approved", body: "2.5 hours for Book Fair setup.", url: "/volunteer-hours", hoursAgo: 140, read: true, actor: "priya" },
    { type: "committee_message", title: "Yearbook Committee", body: "Priya Raman: That fits the budget line with room to spare.", url: `/committees/${yearbook.id}`, hoursAgo: 160, read: true, actor: "priya" },
    { type: "approval_decided", title: "Your event plan was sent back", body: "Movie Night needs changes before it can be approved.", url: `/events/${plans[0].id}`, hoursAgo: 200, read: true, actor: "marcus" },
  ];

  await db.insert(schema.notifications).values(
    notificationSpecs.map((n) => ({
      userId: userIds.demo,
      schoolId,
      type: n.type,
      title: n.title,
      body: n.body,
      url: n.url,
      collapsedCount: n.collapsed ?? 1,
      actorId: n.actor ? userIds[n.actor] : null,
      readAt: n.read ? hoursAgo(n.hoursAgo - 1) : null,
      createdAt: hoursAgo(n.hoursAgo),
    }))
  );
  const unread = notificationSpecs.filter((n) => !n.read).length;
  console.log(
    `Created ${notificationSpecs.length} notifications for the demo account (${unread} unread)`
  );

  // ── Volunteer hours ───────────────────────────────────────────────────────
  await db.insert(schema.volunteerHours).values([
    { schoolId, userId: userIds.demo, eventName: "Fall Carnival", hours: "4.00", date: isoDate(-60), category: "event_help", approved: true, approvedBy: userIds.priya },
    { schoolId, userId: userIds.demo, eventName: "Book Fair setup", hours: "2.50", date: isoDate(-40), category: "event_help", approved: true, approvedBy: userIds.priya },
    { schoolId, userId: userIds.demo, eventName: "Board meeting", hours: "1.50", date: isoDate(-14), category: "pta_business", approved: false },
    { schoolId, userId: userIds.dana, eventName: "Library shelving", hours: "3.00", date: isoDate(-21), category: "library", approved: false },
    { schoolId, userId: userIds.jonah, eventName: "Class party — Room 21", hours: "2.00", date: isoDate(-9), category: "classroom_support", approved: false },
  ]);
  console.log("Created volunteer hours (2 approved, 3 awaiting board approval)");

  console.log(`\n✅ Demo school ready.`);
  console.log(`   School:     ${SCHOOL_NAME} (${schoolId})`);
  console.log(`   Join code:  ${JOIN_CODE}`);
  console.log(`   Reviewer:   ${demoEmail}  →  /sign-in?demo=1`);
}

/**
 * Wipe the demo school's contents so a re-run is a rebuild, not an accumulation.
 *
 * Deletes only rows scoped to this school, and leaves the school row and the
 * user accounts alone — recreating the reviewer's user would orphan any
 * session they still hold, and recreating the school would change the join
 * code printed in the review notes.
 */
async function clearSchoolContents(schoolId: string) {
  const classroomIds = (
    await db
      .select({ id: schema.classrooms.id })
      .from(schema.classrooms)
      .where(eq(schema.classrooms.schoolId, schoolId))
  ).map((r) => r.id);

  const committeeIds = (
    await db
      .select({ id: schema.committees.id })
      .from(schema.committees)
      .where(eq(schema.committees.schoolId, schoolId))
  ).map((r) => r.id);

  // `fundraiser_stats.fundraiser_id` has no ON DELETE rule (it predates the
  // cascade-or-set-null convention that now applies to `users` FKs), so
  // deleting a fundraiser out from under its stats is a constraint violation.
  // Everything else below either cascades from its parent or is deleted in
  // dependency order.
  const fundraiserIds = (
    await db
      .select({ id: schema.fundraisers.id })
      .from(schema.fundraisers)
      .where(eq(schema.fundraisers.schoolId, schoolId))
  ).map((r) => r.id);
  if (fundraiserIds.length > 0) {
    await db
      .delete(schema.fundraiserStats)
      .where(inArray(schema.fundraiserStats.fundraiserId, fundraiserIds));
  }

  // Children first where there is no cascade to rely on; the rest goes with
  // its parent.
  if (classroomIds.length > 0) {
    await db
      .delete(schema.classrooms)
      .where(inArray(schema.classrooms.id, classroomIds));
  }
  if (committeeIds.length > 0) {
    await db
      .delete(schema.committees)
      .where(inArray(schema.committees.id, committeeIds));
  }

  for (const table of [
    schema.notifications,
    schema.eventPlans,
    schema.knowledgeArticles,
    schema.budgetTransactions,
    schema.budgetCategories,
    schema.fundraisers,
    schema.importantLinks,
    schema.boardHandoffNotes,
    schema.volunteerHours,
    schema.boardPositions,
  ]) {
    await db.delete(table).where(eq(table.schoolId, schoolId));
  }
}

async function upsertMembership(params: {
  schoolId: string;
  userId: string;
  role: "pta_board" | "member" | "admin";
  boardPosition?: string;
  source: "demo";
}) {
  const existing = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schema.schoolMemberships.schoolId, params.schoolId),
      eq(schema.schoolMemberships.userId, params.userId),
      eq(schema.schoolMemberships.schoolYear, YEAR)
    ),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(schema.schoolMemberships)
      .set({
        role: params.role,
        boardPosition: params.boardPosition ?? null,
        status: "approved",
        approvedAt: new Date(),
      })
      .where(eq(schema.schoolMemberships.id, existing.id));
    return;
  }

  await db.insert(schema.schoolMemberships).values({
    schoolId: params.schoolId,
    userId: params.userId,
    role: params.role,
    boardPosition: params.boardPosition ?? null,
    schoolYear: YEAR,
    status: "approved",
    source: params.source,
    approvedAt: new Date(),
  });
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

function isoDate(dayOffset: number): string {
  return daysFromNow(dayOffset).toISOString().slice(0, 10);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exit(1);
  });
