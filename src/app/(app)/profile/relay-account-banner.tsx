import Link from "next/link";
import { Mail } from "lucide-react";
import { db } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isPrivateRelayAddress } from "@/lib/account-merge-shared";

/**
 * "You're using a hidden email address" — shown on /profile for a Private
 * Relay account that has not been linked.
 *
 * The symptom this heads off is "why do I never get any DragonHub emails?",
 * which arrives weeks later and reads as a broken app. It isn't: Apple relays
 * mail to the parent's real inbox, but their *school* still has them under a
 * different address, so signup linking, waitlist promotions and the committee
 * digest all miss them.
 *
 * Rendered even for a relay account that DID find a membership some other way
 * (a join code), because the email problem is orthogonal to whether they got
 * in — which is why this checks the address, not the membership.
 */
export async function RelayAccountBanner() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { email: true },
  });
  if (!isPrivateRelayAddress(profile?.email)) return null;

  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, session.user.id),
      eq(schoolMemberships.status, "approved")
    ),
    columns: { id: true },
  });

  return (
    <div className="mb-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="text-sm text-amber-900">
        <p className="font-medium">You&apos;re using Apple&apos;s hidden email</p>
        <p className="mt-1">
          {membership
            ? "Your school has you under a different address, so some DragonHub email may not reach you and your sign-ups may not be linked to this account."
            : "Your school doesn't recognize this address, which is why nothing is showing up here yet."}{" "}
          Connecting them takes a minute and fixes both.
        </p>
        <Link
          href="/link-account"
          className="mt-2 inline-block font-medium underline underline-offset-2"
        >
          Connect my school email
        </Link>
      </div>
    </div>
  );
}
