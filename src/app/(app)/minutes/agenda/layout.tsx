import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isPtaBoardMember } from "@/lib/auth-helpers";

/**
 * Here for two reasons: the agenda detail page is a client component and cannot
 * export metadata itself, and every route under here is PTA board only. The
 * pages beneath are client components, so the gate has to live in the layout —
 * the server actions they call assert board membership too, but a non-board
 * member should never reach the screen at all. The list page under here
 * overrides the title with its own plural version.
 */
export const metadata = { title: "Agenda" };

export default async function AgendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/dashboard");

  const isPtaBoard = await isPtaBoardMember(userId, schoolId);
  if (!isPtaBoard) redirect("/minutes");

  return children;
}
