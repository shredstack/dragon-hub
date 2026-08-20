import "server-only";

import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { EmailHeader } from "./header";

/**
 * The school's weekly-email house style — right now, the header every new
 * campaign starts from.
 *
 * Follows the `moduleVisibility` / `eventDirectorySettings` precedent: a
 * missing column and a missing key both mean the built-in default, so there is
 * no backfill and no seeding step. Read through here rather than poking at the
 * JSON so the fallback lives in one place.
 */
export async function getSchoolEmailHeaderDefault(
  schoolId: string
): Promise<EmailHeader> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { emailSettings: true },
  });

  const settings = school?.emailSettings;
  return {
    // `undefined` in the JSON means "never customized", which the renderer
    // reads as the built-in wording. A stored empty string is a deliberate
    // blank header and must survive as one.
    headerHtml: settings?.headerHtml ?? null,
    headerImageUrl: settings?.headerImageUrl ?? null,
    headerImageAlt: settings?.headerImageAlt ?? null,
  };
}
