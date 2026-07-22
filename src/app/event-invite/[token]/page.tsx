import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  acceptEventPlanInvite,
  getEventPlanInviteByToken,
  normalizeInviteEmail,
} from "@/lib/event-plan-invites";

interface EventInvitePageProps {
  params: Promise<{ token: string }>;
}

/** Shared chrome so every outcome below looks like the same page. */
function InviteShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-dragon-blue-500">Dragon Hub</h1>
        </div>
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Landing page for an emailed event invitation.
 *
 * The email's button is a one-click sign-in link pointed here, and signing in
 * already redeems every pending invite for that address, so the common path
 * arrives with the work done and just forwards to the event. The cases below
 * are the ones where that didn't happen: an expired sign-in link, a link opened
 * in a browser signed in as somebody else, an invitation since withdrawn.
 */
export default async function EventInvitePage({ params }: EventInvitePageProps) {
  const { token } = await params;
  const invite = await getEventPlanInviteByToken(token);

  if (!invite || !invite.eventPlan) {
    return (
      <InviteShell title="Invitation not found">
        <p className="text-sm text-muted-foreground">
          This invitation link isn&apos;t valid. It may have been withdrawn, or
          the link may have been copied incompletely — try clicking it directly
          from your email instead.
        </p>
      </InviteShell>
    );
  }

  const eventTitle = invite.eventPlan.title;
  const schoolName = invite.eventPlan.school?.name ?? "your school";
  const session = await auth();
  const signedInEmail = session?.user?.email
    ? normalizeInviteEmail(session.user.email)
    : null;

  if (invite.status === "revoked") {
    return (
      <InviteShell title="Invitation withdrawn">
        <p className="text-sm text-muted-foreground">
          Your invitation to help with <strong>{eventTitle}</strong> has been
          withdrawn. If you think that&apos;s a mistake, reach out to whoever
          invited you.
        </p>
      </InviteShell>
    );
  }

  // Signed in as the invitee: redeem and go. Accepting is idempotent, so a
  // second click on the same link lands in the same place.
  if (signedInEmail && signedInEmail === invite.email) {
    if (invite.status === "pending" && session?.user?.id) {
      await acceptEventPlanInvite(invite.id, session.user.id);
    }
    redirect(`/events/${invite.eventPlan.id}`);
  }

  // Signed in as somebody else. Redeeming would put the wrong person on the
  // plan, and silently signing them out would be worse.
  if (signedInEmail) {
    return (
      <InviteShell title="Wrong account">
        <p className="mb-4 text-sm text-muted-foreground">
          This invitation was sent to <strong>{invite.email}</strong>, but
          you&apos;re signed in as <strong>{signedInEmail}</strong>.
        </p>
        <p className="text-sm text-muted-foreground">
          Sign out and back in as {invite.email}, then open this link again.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm font-medium text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
        >
          Go to Dragon Hub
        </Link>
      </InviteShell>
    );
  }

  if (invite.status === "accepted") {
    return (
      <InviteShell title="Already accepted">
        <p className="mb-6 text-sm text-muted-foreground">
          You&apos;ve already accepted this invitation. Sign in to get to{" "}
          <strong>{eventTitle}</strong>.
        </p>
        <SignInLink email={invite.email} token={token} />
      </InviteShell>
    );
  }

  const eventDate = invite.eventPlan.eventDate
    ? invite.eventPlan.eventDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <InviteShell title={`You're invited to help with ${eventTitle}`}>
      <p className="mb-4 text-sm text-muted-foreground">
        {invite.inviter?.name || "A PTA board member"} invited you to join the
        planning team for <strong>{eventTitle}</strong> at {schoolName}
        {invite.role === "lead" ? ", as a lead" : ""}.
      </p>

      {eventDate && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4 shrink-0" />
          {eventDate}
        </p>
      )}

      <ul className="mb-6 space-y-2 text-sm text-muted-foreground">
        {[
          "The event's task list and who's doing what",
          "Meeting notes, agendas and files",
          "A message board for the planning team",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-dragon-blue-500" />
            {item}
          </li>
        ))}
      </ul>

      <p className="mb-4 text-sm text-muted-foreground">
        Sign in as <strong>{invite.email}</strong> to accept. We&apos;ll email
        you a link — there&apos;s no password to set up.
      </p>

      <SignInLink email={invite.email} token={token} />

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Not interested? Ignore this page and nothing happens.
      </p>
    </InviteShell>
  );
}

function SignInLink({ email, token }: { email: string; token: string }) {
  const callbackUrl = `/event-invite/${token}`;
  return (
    <Link
      href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}&email=${encodeURIComponent(email)}`}
      className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary-dark"
    >
      Sign in to accept
    </Link>
  );
}
