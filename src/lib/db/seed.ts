import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "dotenv";
import * as schema from "./schema";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log("Creating users...");
  const [sarah, jessica, mike, anna, tom] = await db
    .insert(schema.users)
    .values([
      { name: "Sarah Dorich", email: "sarah.dorich@gmail.com" },
      { name: "Jessica Chen", email: "jessica.chen@example.com" },
      { name: "Mike Thompson", email: "mike.thompson@example.com" },
      { name: "Anna Rodriguez", email: "anna.rodriguez@example.com" },
      { name: "Tom Baker", email: "tom.baker@example.com" },
    ])
    .returning();

  // ── Classrooms ─────────────────────────────────────────────────────────────
  console.log("Creating classrooms...");
  const [room2A, room3B, roomK] = await db
    .insert(schema.classrooms)
    .values([
      {
        name: "Mrs. Patterson's 2nd Grade",
        gradeLevel: "2nd",
        teacherEmail: "patterson@draper.edu",
        schoolYear: "2025-2026",
        active: true,
      },
      {
        name: "Mr. Lee's 3rd Grade",
        gradeLevel: "3rd",
        teacherEmail: "lee@draper.edu",
        schoolYear: "2025-2026",
        active: true,
      },
      {
        name: "Ms. Garcia's Kindergarten",
        gradeLevel: "K",
        teacherEmail: "garcia@draper.edu",
        schoolYear: "2025-2026",
        active: true,
      },
    ])
    .returning();

  // ── Classroom Members ──────────────────────────────────────────────────────
  console.log("Creating classroom members...");
  await db.insert(schema.classroomMembers).values([
    { classroomId: room2A.id, userId: sarah.id, role: "pta_board" },
    { classroomId: room2A.id, userId: jessica.id, role: "room_parent" },
    { classroomId: room2A.id, userId: mike.id, role: "volunteer" },
    { classroomId: room3B.id, userId: anna.id, role: "room_parent" },
    { classroomId: room3B.id, userId: tom.id, role: "volunteer" },
    { classroomId: room3B.id, userId: sarah.id, role: "pta_board" },
    { classroomId: roomK.id, userId: jessica.id, role: "volunteer" },
    { classroomId: roomK.id, userId: anna.id, role: "room_parent" },
  ]);

  // ── Room Parents ───────────────────────────────────────────────────────────
  console.log("Creating room parents...");
  await db.insert(schema.roomParents).values([
    {
      classroomId: room2A.id,
      name: "Jessica Chen",
      email: "jessica.chen@example.com",
      phone: "555-0101",
      userId: jessica.id,
    },
    {
      classroomId: room3B.id,
      name: "Anna Rodriguez",
      email: "anna.rodriguez@example.com",
      phone: "555-0102",
      userId: anna.id,
    },
    {
      classroomId: roomK.id,
      name: "Anna Rodriguez",
      email: "anna.rodriguez@example.com",
      phone: "555-0102",
      userId: anna.id,
    },
  ]);

  // ── Classroom Messages ─────────────────────────────────────────────────────
  console.log("Creating classroom messages...");
  await db.insert(schema.classroomMessages).values([
    {
      classroomId: room2A.id,
      authorId: jessica.id,
      message:
        "Reminder: Valentine's Day party is Feb 14th! Please sign up to bring treats.",
    },
    {
      classroomId: room2A.id,
      authorId: sarah.id,
      message:
        "I can bring cups and plates. How many kids are in the class this year?",
    },
    {
      classroomId: room3B.id,
      authorId: anna.id,
      message: "Field trip permission slips are due by Friday.",
    },
  ]);

  // ── Classroom Tasks ────────────────────────────────────────────────────────
  console.log("Creating classroom tasks...");
  await db.insert(schema.classroomTasks).values([
    {
      classroomId: room2A.id,
      createdBy: jessica.id,
      title: "Organize Valentine's Day party supplies",
      description: "Coordinate treats, drinks, and decorations",
      dueDate: new Date("2026-02-12"),
      completed: false,
      assignedTo: mike.id,
    },
    {
      classroomId: room2A.id,
      createdBy: jessica.id,
      title: "Send home party reminder flyers",
      dueDate: new Date("2026-02-10"),
      completed: true,
      assignedTo: jessica.id,
    },
    {
      classroomId: room3B.id,
      createdBy: anna.id,
      title: "Book bus for science museum field trip",
      dueDate: new Date("2026-03-01"),
      completed: false,
      assignedTo: anna.id,
    },
  ]);

  // ── Volunteer Hours ────────────────────────────────────────────────────────
  console.log("Creating volunteer hours...");
  await db.insert(schema.volunteerHours).values([
    {
      userId: mike.id,
      eventName: "Fall Festival Setup",
      hours: "4.00",
      date: "2025-10-15",
      category: "Events",
      approved: true,
      approvedBy: sarah.id,
    },
    {
      userId: jessica.id,
      eventName: "Book Fair",
      hours: "6.00",
      date: "2025-11-05",
      category: "Fundraising",
      approved: true,
      approvedBy: sarah.id,
    },
    {
      userId: tom.id,
      eventName: "Winter Concert Setup",
      hours: "3.00",
      date: "2025-12-10",
      category: "Events",
      approved: true,
      approvedBy: sarah.id,
    },
    {
      userId: anna.id,
      eventName: "Library Volunteer",
      hours: "2.50",
      date: "2026-01-15",
      category: "General",
      approved: false,
    },
    {
      userId: mike.id,
      eventName: "Art Room Helper",
      hours: "2.00",
      date: "2026-01-22",
      category: "General",
      approved: false,
    },
  ]);

  // ── Calendar Events ────────────────────────────────────────────────────────
  console.log("Creating calendar events...");
  const [valentinesEvent, fieldTripEvent, springFlingEvent] = await db
    .insert(schema.calendarEvents)
    .values([
      {
        title: "Valentine's Day Parties",
        description: "Classroom Valentine's Day celebrations",
        startTime: new Date("2026-02-14T13:00:00"),
        endTime: new Date("2026-02-14T15:00:00"),
        location: "Individual Classrooms",
        eventType: "party",
      },
      {
        title: "3rd Grade Science Museum Field Trip",
        description: "All-day field trip to the Natural Science Museum",
        startTime: new Date("2026-03-15T08:00:00"),
        endTime: new Date("2026-03-15T15:00:00"),
        location: "Natural Science Museum",
        eventType: "field_trip",
        classroomId: room3B.id,
      },
      {
        title: "Spring Fling Fundraiser",
        description: "Annual spring fundraiser event with silent auction",
        startTime: new Date("2026-04-18T17:00:00"),
        endTime: new Date("2026-04-18T21:00:00"),
        location: "School Gymnasium",
        eventType: "fundraiser",
      },
      {
        title: "PTA Board Meeting",
        description: "Monthly PTA board meeting",
        startTime: new Date("2026-02-10T18:30:00"),
        endTime: new Date("2026-02-10T20:00:00"),
        location: "School Library",
        eventType: "meeting",
      },
      {
        title: "Teacher Appreciation Week",
        description: "Week-long celebration of our teachers",
        startTime: new Date("2026-05-04T08:00:00"),
        endTime: new Date("2026-05-08T15:00:00"),
        location: "School",
        eventType: "celebration",
      },
    ])
    .returning();

  // ── Budget Categories & Transactions ───────────────────────────────────────
  console.log("Creating budget data...");
  const [eventsCategory, suppliesCategory, fieldTripsCategory] = await db
    .insert(schema.budgetCategories)
    .values([
      {
        name: "School Events",
        allocatedAmount: "5000.00",
        schoolYear: "2025-2026",
      },
      {
        name: "Classroom Supplies",
        allocatedAmount: "2000.00",
        schoolYear: "2025-2026",
      },
      {
        name: "Field Trips",
        allocatedAmount: "3000.00",
        schoolYear: "2025-2026",
      },
      {
        name: "Teacher Appreciation",
        allocatedAmount: "1500.00",
        schoolYear: "2025-2026",
      },
    ])
    .returning();

  await db.insert(schema.budgetTransactions).values([
    {
      categoryId: eventsCategory.id,
      description: "Fall Festival decorations",
      amount: "350.00",
      date: "2025-10-01",
    },
    {
      categoryId: eventsCategory.id,
      description: "Fall Festival food & drinks",
      amount: "425.00",
      date: "2025-10-10",
    },
    {
      categoryId: suppliesCategory.id,
      description: "Art supplies bulk order",
      amount: "180.00",
      date: "2025-09-15",
    },
    {
      categoryId: fieldTripsCategory.id,
      description: "Bus rental deposit - Science Museum",
      amount: "200.00",
      date: "2026-01-20",
    },
  ]);

  // ── Fundraisers ────────────────────────────────────────────────────────────
  console.log("Creating fundraisers...");
  const [bookFair, springAuction] = await db
    .insert(schema.fundraisers)
    .values([
      {
        name: "Fall Book Fair",
        goalAmount: "3000.00",
        startDate: "2025-11-01",
        endDate: "2025-11-08",
        active: false,
      },
      {
        name: "Spring Fling Silent Auction",
        goalAmount: "10000.00",
        startDate: "2026-04-18",
        endDate: "2026-04-18",
        active: true,
      },
    ])
    .returning();

  await db.insert(schema.fundraiserStats).values([
    {
      fundraiserId: bookFair.id,
      totalRaised: "2850.00",
      totalDonors: 45,
    },
    {
      fundraiserId: springAuction.id,
      totalRaised: "1200.00",
      totalDonors: 12,
    },
  ]);

  // ── Knowledge Articles ─────────────────────────────────────────────────────
  console.log("Creating knowledge articles...");
  await db.insert(schema.knowledgeArticles).values([
    {
      title: "Fall Festival Planning Guide",
      description:
        "Complete guide for planning the annual fall festival including vendor coordination, volunteer scheduling, and budget templates.",
      googleDriveUrl: "https://drive.google.com/example/fall-festival-guide",
      category: "Events",
      tags: ["festival", "planning", "annual"],
      schoolYear: "2025-2026",
      createdBy: sarah.id,
    },
    {
      title: "Room Parent Handbook",
      description:
        "Everything new room parents need to know about their role and responsibilities.",
      googleDriveUrl: "https://drive.google.com/example/room-parent-handbook",
      category: "Onboarding",
      tags: ["room-parent", "handbook", "onboarding"],
      schoolYear: "2025-2026",
      createdBy: sarah.id,
    },
    {
      title: "Volunteer Hour Tracking Policy",
      description: "Guidelines for logging and approving volunteer hours.",
      googleDriveUrl: "https://drive.google.com/example/volunteer-policy",
      category: "Policies",
      tags: ["volunteer", "policy"],
      schoolYear: "2025-2026",
      createdBy: sarah.id,
    },
  ]);

  // ── Event Plans ────────────────────────────────────────────────────────────
  console.log("Creating event plans...");
  const [springFlingPlan, teacherApprecPlan] = await db
    .insert(schema.eventPlans)
    .values([
      {
        title: "Spring Fling Fundraiser",
        description:
          "Annual spring fundraiser with silent auction, food trucks, and live music. Goal is to raise $10,000 for playground improvements.",
        eventType: "fundraiser",
        eventDate: new Date("2026-04-18T17:00:00"),
        location: "School Gymnasium & Outdoor Courtyard",
        budget: "2500.00",
        schoolYear: "2025-2026",
        status: "approved",
        calendarEventId: springFlingEvent.id,
        createdBy: sarah.id,
      },
      {
        title: "Teacher Appreciation Week",
        description:
          "Week-long celebration with daily themes: Monday - Breakfast, Tuesday - Flowers, Wednesday - Cards, Thursday - Gift Cards, Friday - Luncheon.",
        eventType: "celebration",
        eventDate: new Date("2026-05-04T08:00:00"),
        location: "School",
        budget: "800.00",
        schoolYear: "2025-2026",
        status: "draft",
        createdBy: jessica.id,
      },
    ])
    .returning();

  // ── Event Plan Members ─────────────────────────────────────────────────────
  console.log("Creating event plan members...");
  await db.insert(schema.eventPlanMembers).values([
    { eventPlanId: springFlingPlan.id, userId: sarah.id, role: "lead" },
    { eventPlanId: springFlingPlan.id, userId: jessica.id, role: "member" },
    { eventPlanId: springFlingPlan.id, userId: mike.id, role: "member" },
    { eventPlanId: springFlingPlan.id, userId: anna.id, role: "member" },
    { eventPlanId: teacherApprecPlan.id, userId: jessica.id, role: "lead" },
    { eventPlanId: teacherApprecPlan.id, userId: anna.id, role: "member" },
  ]);

  // ── Event Plan Tasks ───────────────────────────────────────────────────────
  console.log("Creating event plan tasks...");
  await db.insert(schema.eventPlanTasks).values([
    {
      eventPlanId: springFlingPlan.id,
      title: "Book food trucks (minimum 3)",
      description: "Contact local food trucks and confirm availability",
      dueDate: new Date("2026-03-15"),
      completed: true,
      assignedTo: anna.id,
      createdBy: sarah.id,
      sortOrder: 0,
    },
    {
      eventPlanId: springFlingPlan.id,
      title: "Collect silent auction donations",
      description:
        "Reach out to local businesses for donations. Target: 30 items",
      dueDate: new Date("2026-04-01"),
      completed: false,
      assignedTo: jessica.id,
      createdBy: sarah.id,
      sortOrder: 1,
    },
    {
      eventPlanId: springFlingPlan.id,
      title: "Set up online bidding platform",
      dueDate: new Date("2026-04-10"),
      completed: false,
      assignedTo: mike.id,
      createdBy: sarah.id,
      sortOrder: 2,
    },
    {
      eventPlanId: springFlingPlan.id,
      title: "Recruit 20 event-day volunteers",
      dueDate: new Date("2026-04-05"),
      completed: false,
      assignedTo: sarah.id,
      createdBy: sarah.id,
      sortOrder: 3,
    },
    {
      eventPlanId: teacherApprecPlan.id,
      title: "Create sign-up sheet for daily themes",
      dueDate: new Date("2026-04-20"),
      completed: false,
      assignedTo: jessica.id,
      createdBy: jessica.id,
      sortOrder: 0,
    },
    {
      eventPlanId: teacherApprecPlan.id,
      title: "Order flowers for Tuesday delivery",
      dueDate: new Date("2026-04-28"),
      completed: false,
      assignedTo: anna.id,
      createdBy: jessica.id,
      sortOrder: 1,
    },
  ]);

  // ── Event Plan Messages ────────────────────────────────────────────────────
  console.log("Creating event plan messages...");
  await db.insert(schema.eventPlanMessages).values([
    {
      eventPlanId: springFlingPlan.id,
      authorId: sarah.id,
      message:
        "I've confirmed 3 food trucks: Taco Loco, Pizza Planet, and Sweet Treats. They'll arrive at 4pm for setup.",
    },
    {
      eventPlanId: springFlingPlan.id,
      authorId: jessica.id,
      message:
        "Great news! We already have 15 auction items donated. The local bookstore is donating a big gift basket.",
    },
    {
      eventPlanId: springFlingPlan.id,
      authorId: mike.id,
      message:
        "I'm looking into 32auctions for the online bidding. It seems like a good fit. Anyone used it before?",
    },
  ]);

  // ── Event Plan Approvals ───────────────────────────────────────────────────
  console.log("Creating event plan approvals...");
  await db.insert(schema.eventPlanApprovals).values([
    {
      eventPlanId: springFlingPlan.id,
      userId: sarah.id,
      vote: "approve",
      comment: "Budget looks good. Let's make this our best spring fling yet!",
    },
    {
      eventPlanId: springFlingPlan.id,
      userId: jessica.id,
      vote: "approve",
      comment: "Approved! I'll start collecting auction items this week.",
    },
  ]);

  console.log("\n✅ Seed complete! Created:");
  console.log("   - 5 users");
  console.log("   - 3 classrooms with members, messages, and tasks");
  console.log("   - 3 room parents");
  console.log("   - 5 volunteer hour entries");
  console.log("   - 5 calendar events");
  console.log("   - 4 budget categories with transactions");
  console.log("   - 2 fundraisers with stats");
  console.log("   - 3 knowledge articles");
  console.log("   - 2 event plans with members, tasks, messages, and approvals");
}

seed().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
