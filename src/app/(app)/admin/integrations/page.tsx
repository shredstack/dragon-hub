import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  schoolCalendarIntegrations,
  schoolDriveIntegrations,
  schoolGoogleIntegrations,
  schoolBudgetIntegrations,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { CalendarIntegrationForm } from "./calendar-integration-form";
import { DriveIntegrationForm } from "./drive-integration-form";
import { IntegrationActions } from "./integration-actions";
import { GoogleCredentialsForm } from "./google-credentials-form";
import { BudgetIntegrationForm } from "./budget-integration-form";
import { SyncCalendarsButton, SyncBudgetButton, IndexDriveButton } from "./sync-buttons";
import { RESOURCE_SOURCES } from "@/lib/constants";
import Link from "next/link";

export default async function AdminIntegrationsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [calendars, driveFolders, googleIntegration, budgetIntegration] =
    await Promise.all([
      db.query.schoolCalendarIntegrations.findMany({
        where: eq(schoolCalendarIntegrations.schoolId, schoolId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      }),
      db.query.schoolDriveIntegrations.findMany({
        where: eq(schoolDriveIntegrations.schoolId, schoolId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      }),
      db.query.schoolGoogleIntegrations.findFirst({
        where: eq(schoolGoogleIntegrations.schoolId, schoolId),
      }),
      db.query.schoolBudgetIntegrations.findFirst({
        where: eq(schoolBudgetIntegrations.schoolId, schoolId),
      }),
    ]);

  const googleCredentialsConfigured = !!googleIntegration?.active;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Manage Integrations</h1>

      {/* Google Service Account Section */}
      <section>
        <GoogleCredentialsForm
          existingIntegration={
            googleIntegration
              ? {
                  id: googleIntegration.id,
                  serviceAccountEmail: googleIntegration.serviceAccountEmail,
                  privateKeyConfigured: true,
                  active: googleIntegration.active,
                  createdAt: googleIntegration.createdAt,
                  updatedAt: googleIntegration.updatedAt,
                }
              : null
          }
        />
        <div className="mt-3">
          <Link
            href="/admin/integrations/setup-guide"
            className="text-sm text-primary hover:underline"
          >
            Need help? View the Google Service Account setup guide &rarr;
          </Link>
        </div>
      </section>

      {/* Google Calendar Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Google Calendars</h2>
          <div className="flex items-center gap-2">
            <SyncCalendarsButton
              disabled={!googleCredentialsConfigured || calendars.length === 0}
            />
            <CalendarIntegrationForm />
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Add Google Calendar IDs to sync events for your school. Events from
          these calendars will appear on the school calendar.
        </p>
        {!googleCredentialsConfigured && (
          <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            Configure Google service account credentials above to enable
            calendar sync.
          </div>
        )}
        {calendars.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center">
            <p className="text-muted-foreground">No calendars configured.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Calendar ID</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {calendars.map((cal) => (
                    <tr key={cal.id} className="border-b border-border">
                      <td className="p-3 font-medium">
                        {cal.name || "Unnamed"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {RESOURCE_SOURCES[cal.calendarType ?? "pta"]}
                        </Badge>
                      </td>
                      <td className="max-w-xs truncate p-3 font-mono text-xs">
                        {cal.calendarId}
                      </td>
                      <td className="p-3">
                        <Badge variant={cal.active ? "default" : "secondary"}>
                          {cal.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <IntegrationActions
                          type="calendar"
                          id={cal.id}
                          active={cal.active ?? true}
                          integration={{
                            id: cal.id,
                            name: cal.name,
                            calendarId: cal.calendarId,
                            calendarType: cal.calendarType,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Google Drive Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Google Drive Folders</h2>
          <div className="flex items-center gap-2">
            <IndexDriveButton
              disabled={!googleCredentialsConfigured || driveFolders.length === 0}
            />
            <DriveIntegrationForm />
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Add Google Drive folder IDs to access documents for your school. Files
          from these folders will be available in the knowledge base and AI
          recommendations.
        </p>
        {!googleCredentialsConfigured && (
          <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            Configure Google service account credentials above to enable Drive
            access.
          </div>
        )}
        {driveFolders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center">
            <p className="text-muted-foreground">No drive folders configured.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Folder ID</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {driveFolders.map((folder) => (
                    <tr key={folder.id} className="border-b border-border">
                      <td className="p-3 font-medium">
                        {folder.name || "Unnamed"}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            folder.folderType === "minutes"
                              ? "default"
                              : "outline"
                          }
                        >
                          {folder.folderType === "minutes"
                            ? "Minutes"
                            : "General"}
                        </Badge>
                      </td>
                      <td className="max-w-xs truncate p-3 font-mono text-xs">
                        {folder.folderId}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={folder.active ? "default" : "secondary"}
                        >
                          {folder.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <IntegrationActions
                          type="drive"
                          id={folder.id}
                          active={folder.active ?? true}
                          integration={{
                            id: folder.id,
                            name: folder.name,
                            folderId: folder.folderId,
                            folderType: folder.folderType,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Budget Google Sheet Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Budget Sheet</h2>
          <div className="flex items-center gap-2">
            <SyncBudgetButton
              disabled={!googleCredentialsConfigured || !budgetIntegration}
            />
            <BudgetIntegrationForm
              existingIntegration={
                budgetIntegration
                  ? {
                      id: budgetIntegration.id,
                      sheetId: budgetIntegration.sheetId,
                      name: budgetIntegration.name,
                    }
                  : null
              }
            />
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Connect a Google Sheet to sync budget data. The sheet should have
          &quot;Categories&quot; and &quot;Transactions&quot; tabs.
        </p>
        {!googleCredentialsConfigured && (
          <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            Configure Google service account credentials above to enable budget
            sync.
          </div>
        )}
        {budgetIntegration ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {budgetIntegration.name || "Budget Sheet"}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {budgetIntegration.sheetId}
                </p>
              </div>
              <Badge
                variant={budgetIntegration.active ? "default" : "secondary"}
              >
                {budgetIntegration.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center">
            <p className="text-muted-foreground">No budget sheet configured.</p>
          </div>
        )}
      </section>
    </div>
  );
}
