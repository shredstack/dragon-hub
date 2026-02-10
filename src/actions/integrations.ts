"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  schoolCalendarIntegrations,
  schoolDriveIntegrations,
  schoolGoogleIntegrations,
  schoolBudgetIntegrations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── Calendar Integration Actions ────────────────────────────────────────────

export async function getCalendarIntegrations() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  return db.query.schoolCalendarIntegrations.findMany({
    where: eq(schoolCalendarIntegrations.schoolId, schoolId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function addCalendarIntegration(data: {
  calendarId: string;
  name?: string;
  calendarType?: "pta" | "school";
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db.insert(schoolCalendarIntegrations).values({
    schoolId,
    calendarId: data.calendarId.trim(),
    name: data.name?.trim() || null,
    calendarType: data.calendarType || "pta",
    createdBy: user.id!,
  });

  revalidatePath("/admin/integrations");
}

export async function updateCalendarIntegration(
  id: string,
  data: { name?: string; active?: boolean; calendarType?: "pta" | "school" }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(schoolCalendarIntegrations)
    .set(data)
    .where(
      and(
        eq(schoolCalendarIntegrations.id, id),
        eq(schoolCalendarIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}

export async function deleteCalendarIntegration(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(schoolCalendarIntegrations)
    .where(
      and(
        eq(schoolCalendarIntegrations.id, id),
        eq(schoolCalendarIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}

// ─── Drive Integration Actions ───────────────────────────────────────────────

export async function getDriveIntegrations() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  return db.query.schoolDriveIntegrations.findMany({
    where: eq(schoolDriveIntegrations.schoolId, schoolId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function addDriveIntegration(data: {
  folderId: string;
  name?: string;
  folderType?: "general" | "minutes";
  maxDepth?: number;
  schoolYear?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { parseDriveFolderId } = await import("@/lib/drive");
  const folderId = parseDriveFolderId(data.folderId);

  await db.insert(schoolDriveIntegrations).values({
    schoolId,
    folderId,
    name: data.name?.trim() || null,
    folderType: data.folderType || "general",
    maxDepth: data.maxDepth ?? 5,
    schoolYear: data.schoolYear?.trim() || null,
    createdBy: user.id!,
  });

  revalidatePath("/admin/integrations");
}

export async function updateDriveIntegration(
  id: string,
  data: { name?: string; active?: boolean; folderType?: "general" | "minutes"; maxDepth?: number; schoolYear?: string | null }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(schoolDriveIntegrations)
    .set(data)
    .where(
      and(
        eq(schoolDriveIntegrations.id, id),
        eq(schoolDriveIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}

export async function deleteDriveIntegration(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(schoolDriveIntegrations)
    .where(
      and(
        eq(schoolDriveIntegrations.id, id),
        eq(schoolDriveIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}

// ─── Google Service Account Integration Actions ─────────────────────────────

export async function getGoogleIntegration() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const integration = await db.query.schoolGoogleIntegrations.findFirst({
    where: eq(schoolGoogleIntegrations.schoolId, schoolId),
  });

  if (!integration) return null;

  // Return with masked private key for display
  return {
    id: integration.id,
    serviceAccountEmail: integration.serviceAccountEmail,
    privateKeyConfigured: true,
    active: integration.active,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

export async function saveGoogleIntegration(data: {
  serviceAccountEmail: string;
  privateKey: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Validate the email format
  if (!data.serviceAccountEmail.includes("@")) {
    throw new Error("Invalid service account email");
  }

  // Validate the private key format
  if (
    !data.privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
    !data.privateKey.includes("-----END PRIVATE KEY-----")
  ) {
    throw new Error(
      "Invalid private key format. Must be a PEM-formatted private key."
    );
  }

  // Encrypt the private key before storing
  const encryptedPrivateKey = encrypt(data.privateKey.trim());

  const existing = await db.query.schoolGoogleIntegrations.findFirst({
    where: eq(schoolGoogleIntegrations.schoolId, schoolId),
  });

  if (existing) {
    await db
      .update(schoolGoogleIntegrations)
      .set({
        serviceAccountEmail: data.serviceAccountEmail.trim(),
        privateKey: encryptedPrivateKey,
        updatedAt: new Date(),
      })
      .where(eq(schoolGoogleIntegrations.id, existing.id));
  } else {
    await db.insert(schoolGoogleIntegrations).values({
      schoolId,
      serviceAccountEmail: data.serviceAccountEmail.trim(),
      privateKey: encryptedPrivateKey,
      createdBy: user.id!,
    });
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/integrations");
}

export async function toggleGoogleIntegration(active: boolean) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(schoolGoogleIntegrations)
    .set({ active, updatedAt: new Date() })
    .where(eq(schoolGoogleIntegrations.schoolId, schoolId));

  revalidatePath("/admin/settings");
  revalidatePath("/admin/integrations");
}

export async function deleteGoogleIntegration() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(schoolGoogleIntegrations)
    .where(eq(schoolGoogleIntegrations.schoolId, schoolId));

  revalidatePath("/admin/settings");
  revalidatePath("/admin/integrations");
}

// ─── Budget Integration Actions ─────────────────────────────────────────────

export async function getBudgetIntegration() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  return db.query.schoolBudgetIntegrations.findFirst({
    where: eq(schoolBudgetIntegrations.schoolId, schoolId),
  });
}

export async function saveBudgetIntegration(data: {
  sheetId: string;
  name?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const existing = await db.query.schoolBudgetIntegrations.findFirst({
    where: eq(schoolBudgetIntegrations.schoolId, schoolId),
  });

  if (existing) {
    await db
      .update(schoolBudgetIntegrations)
      .set({
        sheetId: data.sheetId.trim(),
        name: data.name?.trim() || null,
      })
      .where(eq(schoolBudgetIntegrations.id, existing.id));
  } else {
    await db.insert(schoolBudgetIntegrations).values({
      schoolId,
      sheetId: data.sheetId.trim(),
      name: data.name?.trim() || null,
      createdBy: user.id!,
    });
  }

  revalidatePath("/admin/integrations");
}

export async function deleteBudgetIntegration() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(schoolBudgetIntegrations)
    .where(eq(schoolBudgetIntegrations.schoolId, schoolId));

  revalidatePath("/admin/integrations");
}

// ─── Sync Actions ────────────────────────────────────────────────────────────

export async function syncCalendars() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { syncSchoolCalendars } = await import("@/lib/sync/calendar");
  const result = await syncSchoolCalendars(schoolId);

  revalidatePath("/calendar");
  revalidatePath("/admin/integrations");

  return result;
}

export async function syncBudget() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { syncSchoolBudget } = await import("@/lib/sync/budget");
  const result = await syncSchoolBudget(schoolId);

  revalidatePath("/budget");
  revalidatePath("/admin/integrations");

  return result;
}

export async function indexDriveFiles() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { indexSchoolDriveFiles } = await import("@/lib/sync/drive-indexer");
  const result = await indexSchoolDriveFiles(schoolId);

  revalidatePath("/admin/integrations");

  return result;
}
