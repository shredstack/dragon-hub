import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  schoolCalendarIntegrations,
  schoolDriveIntegrations,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { CalendarIntegrationForm } from "./calendar-integration-form";
import { DriveIntegrationForm } from "./drive-integration-form";
import { IntegrationActions } from "./integration-actions";

export default async function AdminIntegrationsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [calendars, driveFolders] = await Promise.all([
    db.query.schoolCalendarIntegrations.findMany({
      where: eq(schoolCalendarIntegrations.schoolId, schoolId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
    db.query.schoolDriveIntegrations.findMany({
      where: eq(schoolDriveIntegrations.schoolId, schoolId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Manage Integrations</h1>

      {/* Google Calendar Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Google Calendars</h2>
          <CalendarIntegrationForm />
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Add Google Calendar IDs to sync events for your school. Events from
          these calendars will appear on the school calendar.
        </p>
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
          <DriveIntegrationForm />
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Add Google Drive folder IDs to access documents for your school. Files
          from these folders will be available in the knowledge base and AI
          recommendations.
        </p>
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
    </div>
  );
}
