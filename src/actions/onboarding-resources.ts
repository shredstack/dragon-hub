"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  onboardingResources,
  stateOnboardingResources,
  districtOnboardingResources,
  schools,
} from "@/lib/db/schema";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PtaBoardPosition } from "@/types";

// Common resource shape for display (without schoolId which varies by source)
export type DisplayResource = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  category: string | null;
  position: PtaBoardPosition | null;
  sortOrder: number | null;
  source: "school" | "state" | "district";
};

// Grouped resources response for the new UI
export type GroupedResourcesResponse = {
  school: DisplayResource[];
  district: DisplayResource[];
  state: DisplayResource[];
  stateName: string | null;
  districtName: string | null;
};

/**
 * Get resources for a specific position (includes general resources where position is null)
 * Also includes state and district resources based on school's location settings
 */
export async function getResourcesForPosition(
  position?: PtaBoardPosition
): Promise<DisplayResource[]> {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get school info for state/district
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { state: true, district: true },
  });

  const baseConditions = [
    eq(onboardingResources.schoolId, schoolId),
    eq(onboardingResources.active, true),
  ];

  // Get school-specific resources
  const schoolResources = position
    ? await db.query.onboardingResources.findMany({
        where: and(
          ...baseConditions,
          or(
            eq(onboardingResources.position, position),
            isNull(onboardingResources.position)
          )
        ),
        orderBy: [
          asc(onboardingResources.sortOrder),
          asc(onboardingResources.title),
        ],
      })
    : await db.query.onboardingResources.findMany({
        where: and(...baseConditions),
        orderBy: [
          asc(onboardingResources.sortOrder),
          asc(onboardingResources.title),
        ],
      });

  // Transform school resources
  const transformedSchool: DisplayResource[] = schoolResources.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    description: r.description,
    category: r.category,
    position: r.position,
    sortOrder: r.sortOrder,
    source: "school" as const,
  }));

  // Get and transform state resources if school has state set
  let transformedState: DisplayResource[] = [];
  if (school?.state) {
    const stateConditions = [
      eq(stateOnboardingResources.state, school.state),
      eq(stateOnboardingResources.active, true),
    ];

    const stateQuery = position
      ? db.query.stateOnboardingResources.findMany({
          where: and(
            ...stateConditions,
            or(
              eq(stateOnboardingResources.position, position),
              isNull(stateOnboardingResources.position)
            )
          ),
          orderBy: [asc(stateOnboardingResources.sortOrder)],
        })
      : db.query.stateOnboardingResources.findMany({
          where: and(...stateConditions),
          orderBy: [asc(stateOnboardingResources.sortOrder)],
        });

    const stateResources = await stateQuery;
    transformedState = stateResources.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      category: r.category,
      position: r.position,
      sortOrder: r.sortOrder,
      source: "state" as const,
    }));
  }

  // Get and transform district resources if school has both state and district set
  let transformedDistrict: DisplayResource[] = [];
  if (school?.state && school?.district) {
    const districtConditions = [
      eq(districtOnboardingResources.state, school.state),
      eq(districtOnboardingResources.district, school.district),
      eq(districtOnboardingResources.active, true),
    ];

    const districtQuery = position
      ? db.query.districtOnboardingResources.findMany({
          where: and(
            ...districtConditions,
            or(
              eq(districtOnboardingResources.position, position),
              isNull(districtOnboardingResources.position)
            )
          ),
          orderBy: [asc(districtOnboardingResources.sortOrder)],
        })
      : db.query.districtOnboardingResources.findMany({
          where: and(...districtConditions),
          orderBy: [asc(districtOnboardingResources.sortOrder)],
        });

    const districtResources = await districtQuery;
    transformedDistrict = districtResources.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      category: r.category,
      position: r.position,
      sortOrder: r.sortOrder,
      source: "district" as const,
    }));
  }

  // Combine all resources - school resources first, then district, then state
  return [...transformedSchool, ...transformedDistrict, ...transformedState];
}

/**
 * Get resources grouped by source (school, district, state) with location names
 */
export async function getGroupedResourcesForPosition(
  position?: PtaBoardPosition
): Promise<GroupedResourcesResponse> {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get school info for state/district
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { state: true, district: true },
  });

  const baseConditions = [
    eq(onboardingResources.schoolId, schoolId),
    eq(onboardingResources.active, true),
  ];

  // Get school-specific resources
  const schoolResources = position
    ? await db.query.onboardingResources.findMany({
        where: and(
          ...baseConditions,
          or(
            eq(onboardingResources.position, position),
            isNull(onboardingResources.position)
          )
        ),
        orderBy: [
          asc(onboardingResources.sortOrder),
          asc(onboardingResources.title),
        ],
      })
    : await db.query.onboardingResources.findMany({
        where: and(...baseConditions),
        orderBy: [
          asc(onboardingResources.sortOrder),
          asc(onboardingResources.title),
        ],
      });

  // Transform school resources
  const transformedSchool: DisplayResource[] = schoolResources.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    description: r.description,
    category: r.category,
    position: r.position,
    sortOrder: r.sortOrder,
    source: "school" as const,
  }));

  // Get and transform state resources if school has state set
  let transformedState: DisplayResource[] = [];
  if (school?.state) {
    const stateConditions = [
      eq(stateOnboardingResources.state, school.state),
      eq(stateOnboardingResources.active, true),
    ];

    const stateQuery = position
      ? db.query.stateOnboardingResources.findMany({
          where: and(
            ...stateConditions,
            or(
              eq(stateOnboardingResources.position, position),
              isNull(stateOnboardingResources.position)
            )
          ),
          orderBy: [asc(stateOnboardingResources.sortOrder)],
        })
      : db.query.stateOnboardingResources.findMany({
          where: and(...stateConditions),
          orderBy: [asc(stateOnboardingResources.sortOrder)],
        });

    const stateResources = await stateQuery;
    transformedState = stateResources.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      category: r.category,
      position: r.position,
      sortOrder: r.sortOrder,
      source: "state" as const,
    }));
  }

  // Get and transform district resources if school has both state and district set
  let transformedDistrict: DisplayResource[] = [];
  if (school?.state && school?.district) {
    const districtConditions = [
      eq(districtOnboardingResources.state, school.state),
      eq(districtOnboardingResources.district, school.district),
      eq(districtOnboardingResources.active, true),
    ];

    const districtQuery = position
      ? db.query.districtOnboardingResources.findMany({
          where: and(
            ...districtConditions,
            or(
              eq(districtOnboardingResources.position, position),
              isNull(districtOnboardingResources.position)
            )
          ),
          orderBy: [asc(districtOnboardingResources.sortOrder)],
        })
      : db.query.districtOnboardingResources.findMany({
          where: and(...districtConditions),
          orderBy: [asc(districtOnboardingResources.sortOrder)],
        });

    const districtResources = await districtQuery;
    transformedDistrict = districtResources.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      category: r.category,
      position: r.position,
      sortOrder: r.sortOrder,
      source: "district" as const,
    }));
  }

  return {
    school: transformedSchool,
    district: transformedDistrict,
    state: transformedState,
    stateName: school?.state || null,
    districtName: school?.district || null,
  };
}

/**
 * Get all resources for admin management
 */
export async function getAllResources() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  return db.query.onboardingResources.findMany({
    where: eq(onboardingResources.schoolId, schoolId),
    orderBy: [
      asc(onboardingResources.position),
      asc(onboardingResources.sortOrder),
    ],
    with: {
      creator: { columns: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Create a new onboarding resource
 */
export async function createResource(data: {
  position?: PtaBoardPosition | null;
  title: string;
  url: string;
  description?: string;
  category?: string;
  sortOrder?: number;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const [resource] = await db
    .insert(onboardingResources)
    .values({
      schoolId,
      position: data.position ?? null,
      title: data.title,
      url: data.url,
      description: data.description,
      category: data.category,
      sortOrder: data.sortOrder ?? 0,
      createdBy: user.id!,
    })
    .returning();

  revalidatePath("/onboarding");
  revalidatePath("/admin/board/onboarding");
  return resource;
}

/**
 * Update an existing resource
 */
export async function updateResource(
  id: string,
  data: {
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
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(onboardingResources)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(onboardingResources.id, id),
        eq(onboardingResources.schoolId, schoolId)
      )
    );

  revalidatePath("/onboarding");
  revalidatePath("/admin/board/onboarding");
  return { success: true };
}

/**
 * Delete a resource
 */
export async function deleteResource(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(onboardingResources)
    .where(
      and(
        eq(onboardingResources.id, id),
        eq(onboardingResources.schoolId, schoolId)
      )
    );

  revalidatePath("/onboarding");
  revalidatePath("/admin/board/onboarding");
  return { success: true };
}

/**
 * Get available regional defaults count for the school's state/district
 */
export async function getAvailableRegionalDefaultsCount() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get school info
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { state: true, district: true },
  });

  let stateCount = 0;
  let districtCount = 0;

  if (school?.state) {
    const stateResources = await db.query.stateOnboardingResources.findMany({
      where: and(
        eq(stateOnboardingResources.state, school.state),
        eq(stateOnboardingResources.active, true)
      ),
    });
    stateCount = stateResources.length;
  }

  if (school?.state && school?.district) {
    const districtRes = await db.query.districtOnboardingResources.findMany({
      where: and(
        eq(districtOnboardingResources.state, school.state),
        eq(districtOnboardingResources.district, school.district),
        eq(districtOnboardingResources.active, true)
      ),
    });
    districtCount = districtRes.length;
  }

  return {
    state: school?.state || null,
    district: school?.district || null,
    stateCount,
    districtCount,
    totalCount: stateCount + districtCount,
  };
}

/**
 * Import regional defaults (state and/or district resources) as school-specific copies
 */
export async function importRegionalDefaults(options: {
  includeState?: boolean;
  includeDistrict?: boolean;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get school info
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { state: true, district: true },
  });

  if (!school?.state && !school?.district) {
    throw new Error(
      "School must have state and/or district configured to import regional defaults"
    );
  }

  let importedCount = 0;

  // Import state resources
  if (options.includeState && school.state) {
    const stateResources = await db.query.stateOnboardingResources.findMany({
      where: and(
        eq(stateOnboardingResources.state, school.state),
        eq(stateOnboardingResources.active, true)
      ),
    });

    for (const resource of stateResources) {
      // Check if already exists (by title)
      const existing = await db.query.onboardingResources.findFirst({
        where: and(
          eq(onboardingResources.schoolId, schoolId),
          eq(onboardingResources.title, resource.title)
        ),
      });

      if (!existing) {
        await db.insert(onboardingResources).values({
          schoolId,
          position: resource.position,
          title: resource.title,
          url: resource.url,
          description: resource.description,
          category: resource.category,
          sortOrder: resource.sortOrder,
          createdBy: user.id!,
        });
        importedCount++;
      }
    }
  }

  // Import district resources
  if (options.includeDistrict && school.state && school.district) {
    const districtRes = await db.query.districtOnboardingResources.findMany({
      where: and(
        eq(districtOnboardingResources.state, school.state),
        eq(districtOnboardingResources.district, school.district),
        eq(districtOnboardingResources.active, true)
      ),
    });

    for (const resource of districtRes) {
      // Check if already exists (by title)
      const existing = await db.query.onboardingResources.findFirst({
        where: and(
          eq(onboardingResources.schoolId, schoolId),
          eq(onboardingResources.title, resource.title)
        ),
      });

      if (!existing) {
        await db.insert(onboardingResources).values({
          schoolId,
          position: resource.position,
          title: resource.title,
          url: resource.url,
          description: resource.description,
          category: resource.category,
          sortOrder: resource.sortOrder,
          createdBy: user.id!,
        });
        importedCount++;
      }
    }
  }

  revalidatePath("/onboarding");
  revalidatePath("/admin/board/onboarding");
  return { success: true, importedCount };
}
