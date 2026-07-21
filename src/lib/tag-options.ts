import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * The school's configured tags, most-used first, for tag pickers.
 *
 * Server-component helper rather than a server action: pages that render a
 * form already know their school and shouldn't pay for a round trip to get a
 * list that never changes mid-form.
 */
export async function getSchoolTagOptions(
  schoolId: string | null | undefined
): Promise<{ name: string; displayName: string }[]> {
  if (!schoolId) return [];

  return db.query.tags.findMany({
    where: eq(tags.schoolId, schoolId),
    columns: { name: true, displayName: true },
    orderBy: [desc(tags.usageCount)],
  });
}
