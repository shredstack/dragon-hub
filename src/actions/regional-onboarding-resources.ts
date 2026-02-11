"use server";

import { assertAuthenticated, assertSuperAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  stateOnboardingResources,
  districtOnboardingResources,
} from "@/lib/db/schema";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PtaBoardPosition } from "@/types";

// ─── State Resources ────────────────────────────────────────────────────────

/**
 * Get all unique states that have resources configured
 */
export async function getStatesWithResources() {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const results = await db
    .selectDistinct({ state: stateOnboardingResources.state })
    .from(stateOnboardingResources)
    .orderBy(asc(stateOnboardingResources.state));

  return results.map((r) => r.state);
}

/**
 * Get all state-level resources (for super admin management)
 */
export async function getAllStateResources() {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  return db.query.stateOnboardingResources.findMany({
    orderBy: [
      asc(stateOnboardingResources.state),
      asc(stateOnboardingResources.sortOrder),
    ],
    with: {
      creator: { columns: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Get state resources for a specific state
 */
export async function getStateResourcesByState(state: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  return db.query.stateOnboardingResources.findMany({
    where: eq(stateOnboardingResources.state, state),
    orderBy: [asc(stateOnboardingResources.sortOrder)],
    with: {
      creator: { columns: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Create a state-level resource
 */
export async function createStateResource(data: {
  state: string;
  position?: PtaBoardPosition | null;
  title: string;
  url: string;
  description?: string;
  category?: string;
  sortOrder?: number;
}) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const [resource] = await db
    .insert(stateOnboardingResources)
    .values({
      state: data.state,
      position: data.position ?? null,
      title: data.title,
      url: data.url,
      description: data.description,
      category: data.category,
      sortOrder: data.sortOrder ?? 0,
      createdBy: user.id!,
    })
    .returning();

  revalidatePath("/super-admin/onboarding");
  return resource;
}

/**
 * Update a state-level resource
 */
export async function updateStateResource(
  id: string,
  data: {
    state?: string;
    position?: PtaBoardPosition | null;
    title?: string;
    url?: string;
    description?: string;
    category?: string;
    sortOrder?: number;
    active?: boolean;
  }
) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .update(stateOnboardingResources)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(stateOnboardingResources.id, id));

  revalidatePath("/super-admin/onboarding");
  return { success: true };
}

/**
 * Delete a state-level resource
 */
export async function deleteStateResource(id: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .delete(stateOnboardingResources)
    .where(eq(stateOnboardingResources.id, id));

  revalidatePath("/super-admin/onboarding");
  return { success: true };
}

// ─── District Resources ─────────────────────────────────────────────────────

/**
 * Get all unique districts that have resources configured
 */
export async function getDistrictsWithResources() {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const results = await db
    .selectDistinct({
      state: districtOnboardingResources.state,
      district: districtOnboardingResources.district,
    })
    .from(districtOnboardingResources)
    .orderBy(
      asc(districtOnboardingResources.state),
      asc(districtOnboardingResources.district)
    );

  return results;
}

/**
 * Get all district-level resources (for super admin management)
 */
export async function getAllDistrictResources() {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  return db.query.districtOnboardingResources.findMany({
    orderBy: [
      asc(districtOnboardingResources.state),
      asc(districtOnboardingResources.district),
      asc(districtOnboardingResources.sortOrder),
    ],
    with: {
      creator: { columns: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Get district resources for a specific state and district
 */
export async function getDistrictResourcesByDistrict(
  state: string,
  district: string
) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  return db.query.districtOnboardingResources.findMany({
    where: and(
      eq(districtOnboardingResources.state, state),
      eq(districtOnboardingResources.district, district)
    ),
    orderBy: [asc(districtOnboardingResources.sortOrder)],
    with: {
      creator: { columns: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Create a district-level resource
 */
export async function createDistrictResource(data: {
  state: string;
  district: string;
  position?: PtaBoardPosition | null;
  title: string;
  url: string;
  description?: string;
  category?: string;
  sortOrder?: number;
}) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const [resource] = await db
    .insert(districtOnboardingResources)
    .values({
      state: data.state,
      district: data.district,
      position: data.position ?? null,
      title: data.title,
      url: data.url,
      description: data.description,
      category: data.category,
      sortOrder: data.sortOrder ?? 0,
      createdBy: user.id!,
    })
    .returning();

  revalidatePath("/super-admin/onboarding");
  return resource;
}

/**
 * Update a district-level resource
 */
export async function updateDistrictResource(
  id: string,
  data: {
    state?: string;
    district?: string;
    position?: PtaBoardPosition | null;
    title?: string;
    url?: string;
    description?: string;
    category?: string;
    sortOrder?: number;
    active?: boolean;
  }
) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .update(districtOnboardingResources)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(districtOnboardingResources.id, id));

  revalidatePath("/super-admin/onboarding");
  return { success: true };
}

/**
 * Delete a district-level resource
 */
export async function deleteDistrictResource(id: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .delete(districtOnboardingResources)
    .where(eq(districtOnboardingResources.id, id));

  revalidatePath("/super-admin/onboarding");
  return { success: true };
}

// ─── Public Getters (for schools) ───────────────────────────────────────────

/**
 * Get active state resources for a specific state and position
 * Used by schools to fetch resources based on their state setting
 */
export async function getActiveStateResources(
  state: string,
  position?: PtaBoardPosition
) {
  const baseConditions = [
    eq(stateOnboardingResources.state, state),
    eq(stateOnboardingResources.active, true),
  ];

  if (position) {
    return db.query.stateOnboardingResources.findMany({
      where: and(
        ...baseConditions,
        or(
          eq(stateOnboardingResources.position, position),
          isNull(stateOnboardingResources.position)
        )
      ),
      orderBy: [asc(stateOnboardingResources.sortOrder)],
    });
  }

  return db.query.stateOnboardingResources.findMany({
    where: and(...baseConditions, isNull(stateOnboardingResources.position)),
    orderBy: [asc(stateOnboardingResources.sortOrder)],
  });
}

/**
 * Get active district resources for a specific state/district and position
 * Used by schools to fetch resources based on their district setting
 */
export async function getActiveDistrictResources(
  state: string,
  district: string,
  position?: PtaBoardPosition
) {
  const baseConditions = [
    eq(districtOnboardingResources.state, state),
    eq(districtOnboardingResources.district, district),
    eq(districtOnboardingResources.active, true),
  ];

  if (position) {
    return db.query.districtOnboardingResources.findMany({
      where: and(
        ...baseConditions,
        or(
          eq(districtOnboardingResources.position, position),
          isNull(districtOnboardingResources.position)
        )
      ),
      orderBy: [asc(districtOnboardingResources.sortOrder)],
    });
  }

  return db.query.districtOnboardingResources.findMany({
    where: and(
      ...baseConditions,
      isNull(districtOnboardingResources.position)
    ),
    orderBy: [asc(districtOnboardingResources.sortOrder)],
  });
}
