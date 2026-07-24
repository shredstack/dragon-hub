import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { getSignupPageContent } from "@/actions/volunteer-signups";
import { SignupPageEditor } from "./signup-page-editor";

export default async function SignupPageContentPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const { content, schoolName, qrCode } = await getSignupPageContent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sign-up Page Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the wording parents see when they scan the volunteer QR code. The
          classroom picker and party checkboxes below it are filled in
          automatically and can&apos;t be edited here.
        </p>
      </div>

      <SignupPageEditor
        initialContent={content}
        schoolName={schoolName}
        qrCode={qrCode}
      />
    </div>
  );
}
