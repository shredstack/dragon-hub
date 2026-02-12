"use server";

import { db } from "@/lib/db";
import { districts } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * Get all districts for a given state
 * @param stateName The full state name (e.g., "Utah", "California")
 * @returns Array of districts sorted alphabetically by name
 */
export async function getDistrictsByState(stateName: string) {
  if (!stateName) {
    return [];
  }

  const results = await db
    .select({
      id: districts.id,
      name: districts.name,
      ncesId: districts.ncesId,
    })
    .from(districts)
    .where(eq(districts.stateName, stateName))
    .orderBy(asc(districts.name));

  return results;
}

/**
 * Get all unique states that have districts in the database
 * @returns Array of state names sorted alphabetically
 */
export async function getStatesWithDistricts() {
  const results = await db
    .selectDistinct({
      stateName: districts.stateName,
      stateCode: districts.stateCode,
    })
    .from(districts)
    .orderBy(asc(districts.stateName));

  return results;
}

/**
 * Search districts by name within a state
 * @param stateName The full state name
 * @param searchTerm The search term to filter districts
 * @returns Array of matching districts
 */
export async function searchDistricts(stateName: string, searchTerm: string) {
  if (!stateName) {
    return [];
  }

  const allDistricts = await getDistrictsByState(stateName);

  if (!searchTerm) {
    return allDistricts;
  }

  const normalizedSearch = searchTerm.toLowerCase();
  return allDistricts.filter((d) =>
    d.name.toLowerCase().includes(normalizedSearch)
  );
}
