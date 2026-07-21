import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getSchoolTagOptions } from "@/lib/tag-options";
import { listContacts } from "@/actions/contacts";
import { ContactsAdmin } from "./contacts-admin";

export default async function ContactsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [contacts, availableTags] = await Promise.all([
    listContacts(true),
    getSchoolTagOptions(schoolId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contact Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The vendors and people the PTA actually calls — the bounce house
          company, the bulk cookie place, the district facilities desk. Attach a
          contact to a recurring event and every future year&rsquo;s planner
          inherits it.
        </p>
      </div>

      <ContactsAdmin contacts={contacts} availableTags={availableTags} />
    </div>
  );
}
