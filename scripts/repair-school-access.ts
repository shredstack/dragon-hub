/**
 * Repair school access after a botched school-year rollover.
 *
 * Symptom this fixes: the school's `current_school_year` was advanced and
 * "expire old memberships" was run, leaving zero `approved` memberships — which
 * locks out every user including school admins and PTA board members.
 *
 * What it does, per school:
 *   1. Resolves the school's effective current year.
 *   2. Finds the most recent year that actually has memberships (the "source year").
 *   3. Restores `admin` / `pta_board` rows in the source year to `approved`
 *      (leadership must never be locked out by a rollover).
 *   4. Carries those leadership rows forward into the current year if missing.
 *   5. Reports the join code members need for the current year.
 *
 * It never deletes rows and never touches year-scoped content (classrooms,
 * budgets, minutes, event plans, handoff notes, ...).
 *
 * Usage:
 *   npx tsx --env-file=.env.local  scripts/repair-school-access.ts            # dry run
 *   npx tsx --env-file=.env.local  scripts/repair-school-access.ts --apply
 *   DATABASE_URL='<prod-url>' npx tsx scripts/repair-school-access.ts --apply
 *
 * Optional: --school "<school name or uuid>" to limit to one school.
 */

import { neon } from "@neondatabase/serverless";

const FALLBACK_SCHOOL_YEAR = "2025-2026";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const schoolFilterIdx = args.indexOf("--school");
const SCHOOL_FILTER =
  schoolFilterIdx >= 0 ? args[schoolFilterIdx + 1] : undefined;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

type SchoolRow = {
  id: string;
  name: string;
  join_code: string;
  current_school_year: string | null;
};

type MembershipRow = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  board_position: string | null;
  school_year: string;
  status: string;
};

/** Sort school-year strings ("2026-2027") newest first. */
function byYearDesc(a: string, b: string) {
  return parseInt(b.slice(0, 4), 10) - parseInt(a.slice(0, 4), 10);
}

const LEADERSHIP = new Set(["admin", "pta_board"]);

async function main() {
  console.log(
    `\n${APPLY ? "APPLY MODE — changes will be written" : "DRY RUN — no changes will be written"}`
  );
  console.log(`Database host: ${new URL(process.env.DATABASE_URL!).host}\n`);

  const schools = (
    SCHOOL_FILTER
      ? await sql`
          SELECT id, name, join_code, current_school_year FROM schools
          WHERE name = ${SCHOOL_FILTER} OR id::text = ${SCHOOL_FILTER}`
      : await sql`
          SELECT id, name, join_code, current_school_year FROM schools
          ORDER BY name`
  ) as SchoolRow[];

  if (schools.length === 0) {
    console.log("No schools matched.");
    return;
  }

  let totalRestored = 0;
  let totalCarried = 0;

  for (const school of schools) {
    const currentYear = school.current_school_year ?? FALLBACK_SCHOOL_YEAR;
    console.log(`\n━━━ ${school.name}`);
    console.log(`    current_school_year : ${school.current_school_year ?? `(null → ${FALLBACK_SCHOOL_YEAR})`}`);
    console.log(`    join_code           : ${school.join_code}`);

    const memberships = (await sql`
      SELECT m.id, m.user_id, u.email, u.name, m.role, m.board_position,
             m.school_year, m.status
      FROM school_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.school_id = ${school.id}`) as MembershipRow[];

    if (memberships.length === 0) {
      console.log("    (no memberships — nothing to repair)");
      continue;
    }

    const approvedInCurrent = memberships.filter(
      (m) => m.school_year === currentYear && m.status === "approved"
    );
    const leadershipInCurrent = approvedInCurrent.filter((m) =>
      LEADERSHIP.has(m.role)
    );

    console.log(
      `    approved in ${currentYear}: ${approvedInCurrent.length} (${leadershipInCurrent.length} leadership)`
    );

    if (leadershipInCurrent.length > 0) {
      console.log("    ✓ Healthy — leadership present for the current year.");
      continue;
    }

    // Find the most recent year that has any leadership rows to recover from.
    const yearsWithLeadership = [
      ...new Set(
        memberships.filter((m) => LEADERSHIP.has(m.role)).map((m) => m.school_year)
      ),
    ].sort(byYearDesc);

    if (yearsWithLeadership.length === 0) {
      console.log(
        "    ✗ No admin/pta_board membership exists in ANY year. Cannot auto-repair."
      );
      console.log(
        "      Fix: promote a user manually, e.g."
      );
      console.log(
        `      UPDATE school_memberships SET role='admin', status='approved'` +
          ` WHERE school_id='${school.id}' AND user_id='<user-id>';`
      );
      continue;
    }

    const sourceYear = yearsWithLeadership[0];
    const sourceLeadership = memberships.filter(
      (m) => m.school_year === sourceYear && LEADERSHIP.has(m.role)
    );

    console.log(`    → recovering leadership from ${sourceYear}`);

    // Step 1: restore non-approved leadership rows in the source year.
    const toRestore = sourceLeadership.filter((m) => m.status !== "approved");
    for (const m of toRestore) {
      console.log(
        `      restore  ${m.email} (${m.role}${m.board_position ? `/${m.board_position}` : ""}) ${sourceYear}: ${m.status} → approved`
      );
      if (APPLY) {
        await sql`
          UPDATE school_memberships
          SET status = 'approved', approved_at = COALESCE(approved_at, now())
          WHERE id = ${m.id}`;
      }
      totalRestored++;
    }

    // Step 2: carry leadership forward into the current year if absent.
    if (sourceYear !== currentYear) {
      const existingCurrentUserIds = new Set(
        memberships
          .filter((m) => m.school_year === currentYear)
          .map((m) => m.user_id)
      );

      for (const m of sourceLeadership) {
        if (existingCurrentUserIds.has(m.user_id)) {
          // Row exists for the current year but isn't approved leadership — fix it.
          const existing = memberships.find(
            (x) => x.school_year === currentYear && x.user_id === m.user_id
          )!;
          if (existing.status !== "approved" || !LEADERSHIP.has(existing.role)) {
            console.log(
              `      promote  ${m.email} ${currentYear}: ${existing.role}/${existing.status} → ${m.role}/approved`
            );
            if (APPLY) {
              await sql`
                UPDATE school_memberships
                SET role = ${m.role}, status = 'approved',
                    board_position = ${m.board_position},
                    approved_at = COALESCE(approved_at, now())
                WHERE id = ${existing.id}`;
            }
            totalCarried++;
          }
          continue;
        }

        console.log(
          `      carry    ${m.email} (${m.role}${m.board_position ? `/${m.board_position}` : ""}) ${sourceYear} → ${currentYear}`
        );
        if (APPLY) {
          await sql`
            INSERT INTO school_memberships
              (school_id, user_id, role, board_position, school_year, status,
               approved_at, renewed_from)
            VALUES
              (${school.id}, ${m.user_id}, ${m.role}, ${m.board_position},
               ${currentYear}, 'approved', now(), ${m.id})
            ON CONFLICT (school_id, user_id, school_year) DO UPDATE
              SET role = EXCLUDED.role,
                  status = 'approved',
                  board_position = EXCLUDED.board_position`;
        }
        totalCarried++;
      }
    }

    console.log(
      `    Members rejoin for ${currentYear} with code: ${school.join_code}`
    );
  }

  console.log(
    `\n${APPLY ? "Applied" : "Would apply"}: ${totalRestored} restored, ${totalCarried} carried forward.`
  );
  if (!APPLY) console.log("Re-run with --apply to write these changes.\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
