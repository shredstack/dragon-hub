"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { fundraisers, fundraiserStats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createFundraiser(data: {
  name: string;
  goalAmount?: string;
  startDate?: string;
  endDate?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db.insert(fundraisers).values({
    schoolId,
    name: data.name,
    goalAmount: data.goalAmount || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
  });

  revalidatePath("/fundraisers");
}

export async function updateFundraiser(
  id: string,
  data: { name?: string; goalAmount?: string; startDate?: string; endDate?: string; active?: boolean }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Only update fundraiser if it belongs to current school
  await db
    .update(fundraisers)
    .set(data)
    .where(and(eq(fundraisers.id, id), eq(fundraisers.schoolId, schoolId)));

  revalidatePath("/fundraisers");
  revalidatePath(`/fundraisers/${id}`);
}

export async function recordFundraiserStats(
  fundraiserId: string,
  data: { totalRaised: string; totalDonors: number }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify fundraiser belongs to current school
  const fundraiser = await db.query.fundraisers.findFirst({
    where: and(eq(fundraisers.id, fundraiserId), eq(fundraisers.schoolId, schoolId)),
  });
  if (!fundraiser) throw new Error("Fundraiser not found");

  await db.insert(fundraiserStats).values({
    fundraiserId,
    totalRaised: data.totalRaised,
    totalDonors: data.totalDonors,
  });

  revalidatePath("/fundraisers");
  revalidatePath(`/fundraisers/${fundraiserId}`);
}
