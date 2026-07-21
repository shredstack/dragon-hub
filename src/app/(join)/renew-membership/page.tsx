import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSchoolAccess, getCurrentSchoolId } from "@/lib/auth-helpers";
import { RenewalForm } from "@/components/membership/renewal-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock } from "lucide-react";

export default async function RenewMembershipPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const access = await getSchoolAccess(
    session.user.id,
    await getCurrentSchoolId()
  );

  // Never been at a school — they need a join code, not a renewal.
  if (!access) redirect("/join-school");

  // Already current for the active year, or leadership (who never lose access).
  if (!access.needsRenewal || access.isLeadership) redirect("/dashboard");

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dragon-blue-100">
            <CalendarClock className="h-6 w-6 text-dragon-blue-600" />
          </div>
          <CardTitle className="text-2xl">Welcome back!</CardTitle>
          <p className="text-sm text-muted-foreground">
            {access.school.name} has started the{" "}
            <span className="font-medium text-foreground">
              {access.currentYear}
            </span>{" "}
            school year. Enter this year&apos;s join code to pick up where you
            left off.
          </p>
        </CardHeader>
        <CardContent>
          <RenewalForm
            schoolName={access.school.name}
            currentSchoolYear={access.currentYear}
            previousSchoolYear={access.latestMembership.schoolYear}
          />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Your volunteer hours and history from{" "}
            {access.latestMembership.schoolYear} are saved — nothing is deleted
            when the school year changes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
