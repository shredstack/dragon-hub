import { google } from "googleapis";
import { db } from "@/lib/db";
import { schoolGoogleIntegrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface GoogleCredentials {
  email: string;
  key: string;
}

/**
 * Fetches Google service account credentials for a school from the database.
 * Does NOT fall back to environment variables - each school must configure their own credentials.
 */
export async function getSchoolGoogleCredentials(
  schoolId: string
): Promise<GoogleCredentials | null> {
  const integration = await db.query.schoolGoogleIntegrations.findFirst({
    where: eq(schoolGoogleIntegrations.schoolId, schoolId),
  });

  if (!integration || !integration.active) {
    return null;
  }

  return {
    email: integration.serviceAccountEmail,
    key: integration.privateKey.replace(/\\n/g, "\n"),
  };
}

function createAuth(credentials: GoogleCredentials) {
  return new google.auth.JWT({
    email: credentials.email,
    key: credentials.key,
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

export function getCalendarClient(credentials: GoogleCredentials) {
  return google.calendar({ version: "v3", auth: createAuth(credentials) });
}

export function getSheetsClient(credentials: GoogleCredentials) {
  return google.sheets({ version: "v4", auth: createAuth(credentials) });
}

export function getDriveClient(credentials: GoogleCredentials) {
  return google.drive({ version: "v3", auth: createAuth(credentials) });
}
