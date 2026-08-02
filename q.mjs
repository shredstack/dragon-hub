import { neon } from "@neondatabase/serverless";
import fs from "fs";
const env = fs.readFileSync(process.argv[2] || ".env.local", "utf8");
const url = env.match(/^DATABASE_URL=["']?(.+?)["']?$/m)[1];
const sql = neon(url);
const rows = await sql`select id, title, start_time, end_time, time_zone, all_day, calendar_source, last_synced, google_event_id from calendar_events where title ilike '%first day%' or title ilike '%school starts%' order by start_time limit 20`;
console.log(JSON.stringify(rows, null, 2));
