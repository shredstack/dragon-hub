import { neon, Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// HTTP driver for regular queries (faster, no connection overhead)
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzleHttp(sql, { schema });

// WebSocket driver for transactions (supports transactions, but has connection overhead)
// Enable WebSocket support for serverless environments (Node.js doesn't have native WebSocket)
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const dbPool = drizzleServerless(pool, { schema });
