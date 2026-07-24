import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getVolunteerDashboardData, getVolunteerQrCodeData } from "@/actions/volunteer-signups";
import { QrCodeSection } from "./qr-code-section";
import { ClassroomTable } from "./classroom-table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Pencil, ShieldAlert } from "lucide-react";

export default async function RoomParentDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [dashboardData, qrData] = await Promise.all([
    getVolunteerDashboardData(),
    getVolunteerQrCodeData(),
  ]);

  // Calculate coverage stats
  const totalClassrooms = dashboardData.classrooms.length;
  const fullCoverage = dashboardData.classrooms.filter(
    (c) => c.roomParentCount >= dashboardData.settings.roomParentLimit
  ).length;
  const partialCoverage = dashboardData.classrooms.filter(
    (c) => c.roomParentCount > 0 && c.roomParentCount < dashboardData.settings.roomParentLimit
  ).length;
  const noCoverage = totalClassrooms - fullCoverage - partialCoverage;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Room Parent Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage room parent signups, generate QR codes, and view coverage across all classrooms.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/room-parents/eligibility"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ShieldAlert className="h-4 w-4" />
            Eligibility Reminder
          </Link>
          <Link
            href="/admin/room-parents/signup-page"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
            Edit Sign-up Page
          </Link>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Classrooms</div>
          <div className="text-2xl font-bold">{totalClassrooms}</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <div className="text-sm text-green-800">Full Coverage</div>
            <Badge variant="success">{dashboardData.settings.roomParentLimit}/{dashboardData.settings.roomParentLimit}</Badge>
          </div>
          <div className="text-2xl font-bold text-green-800">{fullCoverage}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-800">Partial Coverage</div>
          <div className="text-2xl font-bold text-amber-800">{partialCoverage}</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="text-sm text-red-800">No Room Parents</div>
          <div className="text-2xl font-bold text-red-800">{noCoverage}</div>
        </div>
      </div>

      {/* Volunteer Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Room Parents</div>
          <div className="text-2xl font-bold">{dashboardData.totalRoomParents}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Party Volunteers</div>
          <div className="text-2xl font-bold">{dashboardData.totalPartyVolunteers}</div>
        </div>
        {/* Only worth a tile when there is a line. A full school with nobody
            waiting shouldn't get a permanent zero on the dashboard. */}
        {dashboardData.totalWaitlisted > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm text-amber-800">On a Waitlist</div>
            <div className="text-2xl font-bold text-amber-800">
              {dashboardData.totalWaitlisted}
            </div>
            <p className="mt-1 text-xs text-amber-800">
              Promoted automatically when a spot opens.
            </p>
          </div>
        )}
      </div>

      {/* QR Code Section */}
      <QrCodeSection
        qrCode={qrData.qrCode}
        qrDataUrl={qrData.qrDataUrl}
        signupUrl={qrData.signupUrl}
        schoolName={qrData.school?.name || ""}
        settings={qrData.settings}
      />

      {/* Classroom Table */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Classroom Coverage</h2>
        <ClassroomTable
          classrooms={dashboardData.classrooms}
          partyTypes={dashboardData.settings.partyTypes}
          roomParentLimit={dashboardData.settings.roomParentLimit}
        />
      </div>
    </div>
  );
}
