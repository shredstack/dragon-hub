import { google } from "googleapis";
import { db } from "@/lib/db";
import { schoolGoogleIntegrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt, isEncrypted, encrypt } from "@/lib/crypto";

export interface GoogleCredentials {
  email: string;
  key: string;
}

/**
 * Fetches Google service account credentials for a school from the database.
 * Does NOT fall back to environment variables - each school must configure their own credentials.
 *
 * Handles migration: if a plain-text key is found, it encrypts and updates the database.
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

  let privateKey: string;

  if (isEncrypted(integration.privateKey)) {
    // Already encrypted - decrypt it
    privateKey = decrypt(integration.privateKey);
  } else {
    // Plain-text key (legacy) - use it directly but encrypt for future
    privateKey = integration.privateKey;

    // Migrate: encrypt and save (fire-and-forget, don't block the request)
    db.update(schoolGoogleIntegrations)
      .set({
        privateKey: encrypt(privateKey),
        updatedAt: new Date(),
      })
      .where(eq(schoolGoogleIntegrations.id, integration.id))
      .then(() => {
        console.log(
          `Migrated private key to encrypted format for school ${schoolId}`
        );
      })
      .catch((error) => {
        console.error(
          `Failed to migrate private key for school ${schoolId}:`,
          error
        );
      });
  }

  return {
    email: integration.serviceAccountEmail,
    key: privateKey.replace(/\\n/g, "\n"),
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
