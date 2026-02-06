"use server";

import { assertAuthenticated } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { normalizePhoneNumber, isValidPhoneNumber, formatPhoneNumber } from "@/lib/utils";

export async function updateProfile(data: { name?: string; phone?: string }) {
  const user = await assertAuthenticated();

  const updateData: { name?: string | null; phone?: string | null } = {};

  if (data.name !== undefined) {
    updateData.name = data.name.trim() || null;
  }

  if (data.phone !== undefined) {
    const phone = data.phone.trim();
    if (phone && !isValidPhoneNumber(phone)) {
      throw new Error("Invalid phone number");
    }
    updateData.phone = normalizePhoneNumber(phone);
  }

  if (Object.keys(updateData).length === 0) {
    return { success: true };
  }

  await db.update(users).set(updateData).where(eq(users.id, user.id!));

  revalidatePath("/profile");
  revalidatePath("/admin/members");
  return { success: true };
}

export async function getProfile() {
  const user = await assertAuthenticated();

  const profile = await db.query.users.findFirst({
    where: eq(users.id, user.id!),
    columns: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
    },
  });

  if (!profile) return null;

  return {
    ...profile,
    phone: formatPhoneNumber(profile.phone),
  };
}
