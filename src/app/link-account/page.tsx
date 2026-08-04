import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isPrivateRelayAddress } from "@/lib/account-merge-shared";
import { LinkAccountForm } from "./link-account-form";

export const metadata = { title: "Connect your account" };

/**
 * Where a Private Relay account lands instead of `/join-school`.
 *
 * A parent who chose Apple's Hide My Email arrives as
 * `<random>@privaterelay.appleid.com`. DragonHub is email-keyed, so that
 * address matches no signup row and no membership — the generic join-code wall
 * would ask them for a code they have no reason to have, while their real
 * account sits untouched under their own address. This page is the way across.
 */
export default async function LinkAccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { email: true },
  });

  // Anyone else who lands here has no use for it, and the action refuses them
  // anyway — send them to the ordinary door.
  if (!isPrivateRelayAddress(profile?.email)) redirect("/join-school");

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">
        Which email does your school have for you?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You signed in with Apple using <strong>Hide My Email</strong>, so your
        school doesn&apos;t recognize the address Apple gave us. Tell us the one
        your PTA has on file and we&apos;ll connect them — your classrooms,
        committees and volunteer sign-ups will all be here.
      </p>

      <LinkAccountForm />

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Never signed up with your school before?{" "}
          <a href="/join-school" className="text-primary hover:underline">
            Use a join code instead
          </a>
          .
        </p>
      </div>
    </div>
  );
}
