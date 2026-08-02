import { neon } from "@neondatabase/serverless";
import fs from "fs";
const env = fs.readFileSync(process.argv[2], "utf8");
const url = env.match(/^DATABASE_URL=["']?(.+?)["']?$/m)[1];
const sql = neon(url);
const rows = await sql`select title, start_time, end_time, time_zone, all_day, calendar_source, last_synced from calendar_events where start_time >= '2026-08-10' and start_time < '2026-08-25' order by start_time limit 40`;
for (const r of rows) console.log(JSON.stringify(r));
console.log("---integrations---");
console.log(JSON.stringify(await sql`select calendar_id, name, time_zone, active from school_calendar_integrations`, null, 1));
