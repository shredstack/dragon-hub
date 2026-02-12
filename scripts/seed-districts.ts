/**
 * Seed script to populate the districts reference table
 *
 * Usage:
 *   npx tsx scripts/seed-districts.ts
 *
 * This script reads district data from scripts/data/districts.json and
 * inserts it into the districts table. It uses upsert to avoid duplicates.
 *
 * See docs/updating-district-data.md for more information.
 */

// Load environment variables BEFORE any other imports
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { districts } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// Create db connection directly (not using @/lib/db to avoid import order issues)
const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient);

interface DistrictData {
  stateCode: string;
  stateName: string;
  name: string;
  ncesId?: string;
}

interface DistrictsFile {
  source: string;
  lastUpdated: string;
  notes: string;
  districts: DistrictData[];
}

async function seedDistricts() {
  console.log("Starting district seed...");

  // Read the districts data file
  const dataPath = path.join(__dirname, "data", "districts.json");

  if (!fs.existsSync(dataPath)) {
    console.error(`District data file not found: ${dataPath}`);
    console.error(
      "Please ensure scripts/data/districts.json exists with district data."
    );
    process.exit(1);
  }

  const fileContent = fs.readFileSync(dataPath, "utf-8");
  const data: DistrictsFile = JSON.parse(fileContent);

  console.log(`Source: ${data.source}`);
  console.log(`Last updated: ${data.lastUpdated}`);
  console.log(`Total districts to seed: ${data.districts.length}`);

  // Insert districts in batches
  const batchSize = 100;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < data.districts.length; i += batchSize) {
    const batch = data.districts.slice(i, i + batchSize);

    // Use ON CONFLICT to upsert
    for (const district of batch) {
      try {
        const result = await db
          .insert(districts)
          .values({
            stateCode: district.stateCode,
            stateName: district.stateName,
            name: district.name,
            ncesId: district.ncesId || null,
          })
          .onConflictDoUpdate({
            target: [districts.stateCode, districts.name],
            set: {
              stateName: district.stateName,
              ncesId: district.ncesId || null,
            },
          });
        inserted++;
      } catch (error) {
        console.error(`Error inserting district: ${district.name}`, error);
      }
    }

    console.log(
      `Processed ${Math.min(i + batchSize, data.districts.length)}/${data.districts.length} districts...`
    );
  }

  // Get final count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(districts);
  const totalCount = countResult[0]?.count ?? 0;

  console.log("\nSeed complete!");
  console.log(`Total districts in database: ${totalCount}`);
}

// Run the seed
seedDistricts()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
