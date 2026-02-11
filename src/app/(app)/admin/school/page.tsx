import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isSchoolAdmin } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings, CalendarClock, Plug } from "lucide-react";

interface HubCard {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

export default async function SchoolAdminHubPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/dashboard");

  const hasAdminAccess = await isSchoolAdmin(session.user.id, schoolId);
  if (!hasAdminAccess) redirect("/admin/board");

  const configCards: HubCard[] = [
    {
      label: "School Settings",
      description: "Manage school name, codes, and basic configuration",
      href: "/admin/settings",
      icon: Settings,
    },
    {
      label: "School Year",
      description: "Configure school year dates and transitions",
      href: "/admin/school-year",
      icon: CalendarClock,
    },
    {
      label: "Integrations",
      description: "Connect Google Calendar, Drive, and Sheets",
      href: "/admin/integrations",
      icon: Plug,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">School Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Technical configuration and school settings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {configCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-dragon-blue-500 hover:bg-dragon-blue-500/5"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-dragon-blue-500/10 p-3 text-dragon-blue-500">
                <card.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium group-hover:text-dragon-blue-500">
                  {card.label}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {card.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
