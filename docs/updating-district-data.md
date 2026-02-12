# Updating District Data

The districts reference table contains US school district data sourced from the National Center for Education Statistics (NCES). This data is used to provide searchable dropdowns when selecting districts for schools and regional onboarding resources.

## Data Source

**NCES Common Core of Data (CCD)**
- Website: https://nces.ed.gov/ccd/
- Data Portal: https://nces.ed.gov/ccd/districtsearch/
- API: https://educationdata.urban.org/

The NCES releases updated district data annually, typically in late fall/early winter for the previous school year.

## Current Data

The current district data is stored in `scripts/data/districts.json`. This file contains:
- ~300+ districts across multiple states
- Data last updated: 2024-01

## Updating the Data

### Option 1: Full NCES Import (Recommended)

For a complete import of all ~13,000+ US school districts:

1. **Download the NCES data**
   - Visit https://nces.ed.gov/ccd/files.asp
   - Download the "Directory" file (e.g., `ccd_lea_029_2223_w_0a_071523.zip`)
   - This contains all Local Education Agencies (LEAs/Districts)

2. **Convert to JSON format**

   The NCES data comes in CSV format. Convert it to match our JSON structure:

   ```json
   {
     "source": "NCES Common Core of Data (CCD)",
     "lastUpdated": "2024-01",
     "notes": "Full import from NCES CCD 2022-2023",
     "districts": [
       {
         "stateCode": "UT",
         "stateName": "Utah",
         "name": "Alpine School District",
         "ncesId": "4900030"
       }
     ]
   }
   ```

   Key field mappings from NCES CSV:
   - `LEAID` → `ncesId`
   - `LEA_NAME` → `name`
   - `STATE_NAME` → `stateName`
   - `LSTATE` → `stateCode`

3. **Filter for active districts only**

   The NCES data includes closed and inactive districts. Filter for:
   - `LEA_TYPE` = 1, 2, or 7 (regular school districts)
   - `OPERATIONAL_STATUS` = 1 (open/active)

4. **Save the updated file**

   Replace `scripts/data/districts.json` with your new data.

5. **Run the seed script**

   ```bash
   npx tsx scripts/seed-districts.ts
   ```

### Option 2: Manual Updates

For adding individual districts or making corrections:

1. Edit `scripts/data/districts.json` directly
2. Add new entries following the existing format
3. Run the seed script:
   ```bash
   npx tsx scripts/seed-districts.ts
   ```

### Option 3: Using the Urban Institute API

The Urban Institute provides a REST API for NCES data:

```bash
# Example: Get all districts in Utah
curl "https://educationdata.urban.org/api/v1/school-districts/ccd/directory/2022/?state_leaid=UT"
```

You can write a script to fetch all states and convert to our format.

## Database Schema

The districts table schema:

```sql
CREATE TABLE districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL,      -- e.g., "UT"
  state_name TEXT NOT NULL,      -- e.g., "Utah"
  name TEXT NOT NULL,            -- e.g., "Alpine School District"
  nces_id TEXT,                  -- NCES district ID
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint prevents duplicate state+name combinations
CREATE UNIQUE INDEX districts_state_name_unique
  ON districts (state_code, name);
```

## Seed Script

The seed script (`scripts/seed-districts.ts`) handles:
- Reading the JSON data file
- Upserting records (insert or update on conflict)
- Batch processing for performance
- Error handling and reporting

Usage:
```bash
npx tsx scripts/seed-districts.ts
```

## Best Practices

1. **Update annually**: NCES releases new data each year. Plan to update the district data after each release.

2. **Keep ncesId values**: The `ncesId` field allows tracking districts across updates and can be used to link to other NCES data.

3. **Test before deploying**: After updating the data locally, verify that:
   - The JSON file is valid
   - The seed script runs without errors
   - District searches work correctly in the UI

4. **Backup before replacing**: Keep a backup of the existing `districts.json` before replacing it with new data.

## Troubleshooting

### Seed script fails
- Check that `DATABASE_URL` is set correctly
- Verify the JSON file is valid: `node -e "JSON.parse(require('fs').readFileSync('scripts/data/districts.json'))"`

### Districts not showing in dropdown
- Check that the state name matches exactly (e.g., "Utah" not "UT")
- Verify the districts were inserted: check the database directly

### Duplicate key errors
- The seed script uses upsert (ON CONFLICT DO UPDATE)
- If you see duplicate key errors, check for case differences in district names

## Sample Data Structure

```json
{
  "source": "NCES (National Center for Education Statistics)",
  "lastUpdated": "2024-01",
  "notes": "Data from NCES Common Core of Data (CCD)",
  "districts": [
    {
      "stateCode": "UT",
      "stateName": "Utah",
      "name": "Alpine School District",
      "ncesId": "4900030"
    },
    {
      "stateCode": "UT",
      "stateName": "Utah",
      "name": "Davis School District",
      "ncesId": "4900180"
    }
  ]
}
```

## Related Files

- `src/lib/db/schema.ts` - Districts table schema
- `drizzle/0021_districts.sql` - Migration file
- `scripts/seed-districts.ts` - Seed script
- `scripts/data/districts.json` - District data
- `src/actions/districts.ts` - Server actions for querying districts
- `src/components/ui/district-select.tsx` - UI component for district selection
