import { listSchoolStaff } from "@/actions/school-admin";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

/**
 * The school's administrators, shown to the PTA board.
 *
 * The board doesn't manage these accounts — school admins invite each other
 * with their own code and set their own titles. But a school admin can see
 * every classroom and committee message board in the app, so who holds that
 * access should never be something the board discovers by accident. This is
 * read-only on purpose: visibility, not control.
 */
export async function SchoolStaffRoster({ schoolId }: { schoolId: string }) {
  const staff = await listSchoolStaff(schoolId);
  if (staff.length === 0) return null;

  const pendingCount = staff.filter((s) => s.pending).length;

  return (
    <CollapsibleSection
      className="mt-8"
      id="admin-hub:school-staff"
      title="School Staff"
      meta={`${staff.length} ${staff.length === 1 ? "person" : "people"}${
        pendingCount > 0 ? ` · ${pendingCount} pending` : ""
      }`}
    >
      <p className="mb-3 text-sm text-muted-foreground">
        School administrators with access to DragonHub. They can see and take
        part in the app, but not manage PTA business. Your school&apos;s
        administration invites and approves these accounts.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((person) => (
          <div
            key={person.email}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{person.name ?? person.email}</p>
              {person.pending && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                  Pending
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{person.email}</p>
            {person.positionLabel && (
              <p className="mt-2 text-xs text-muted-foreground">
                {person.positionLabel}
              </p>
            )}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
