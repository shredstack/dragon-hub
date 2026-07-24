import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { listImportantLinks } from "@/actions/important-links";
import { ImportantLinksClient } from "./important-links-client";

export default async function ImportantLinksPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const links = await listImportantLinks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Important Links</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The links every family should be able to find without emailing you —
          the volunteer application, the spirit wear store, the lunch account.
          They appear at the top of everyone&apos;s dashboard, in the order you
          set here. Keep the list short; the first three are the ones people
          read.
        </p>
      </div>

      <ImportantLinksClient links={links} />
    </div>
  );
}
