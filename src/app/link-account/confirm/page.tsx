import { peekAccountLink } from "@/lib/account-merge";
import { LinkConfirmForm } from "./link-confirm-form";

export const metadata = { title: "Connect your account" };

/**
 * The redemption step of the Private Relay merge.
 *
 * Possession of the token proves the target address — it only ever went to
 * that inbox — so confirming here both merges and signs the user in *as the
 * target account*, which is the account they actually want to be in.
 *
 * This page only ever *reads*. The merge deletes an account, and the link
 * arrives by email: a district mail filter that fetches every URL it sees
 * would perform the merge on the parent's behalf, burn the single-use token,
 * and leave them reading "that link expired" about something that already
 * happened. `peekAccountLink` here, `confirmAccountLink` behind the button —
 * the same split, for the same reason, as `/account/delete/confirm`.
 *
 * A page rather than a route handler because the outcome is something the
 * person needs to read, and the failure cases ("that link expired", "we
 * couldn't find an account at that address") each need their own explanation.
 */
export default async function ConfirmLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) return <Failure title="That link is incomplete" />;

  const preview = await peekAccountLink(token);

  if (!preview.ok) {
    if (preview.reason === "no_target_account") {
      return (
        <Failure
          title="No account at that address"
          body="We couldn't find a DragonHub account for the email address you gave. If your school signed you up under a different address, try that one — or use your school's join code."
          action={{ href: "/link-account", label: "Try a different address" }}
        />
      );
    }
    if (preview.reason === "same_account") {
      return (
        <Failure
          title="Already connected"
          body="That address is already this account. Nothing to do."
          action={{ href: "/dashboard", label: "Go to DragonHub" }}
        />
      );
    }
    return (
      <Failure
        title="That link has expired"
        body="Connection links work once and last a day. Nothing has changed on either account."
        action={{ href: "/link-account", label: "Start again" }}
      />
    );
  }

  return (
    <div className="border-border bg-card rounded-lg border p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Connect these accounts?</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        The account Apple created for you —{" "}
        <strong className="text-foreground">{preview.relayEmail}</strong> — will
        be folded into your school account at{" "}
        <strong className="text-foreground">{preview.targetEmail}</strong>. From
        then on, Sign in with Apple takes you straight there.
      </p>
      <p className="text-muted-foreground mt-2 text-sm">
        Nothing on your school account changes, and nothing is lost — the Apple
        account is brand new. This can&apos;t be undone.
      </p>

      <LinkConfirmForm token={token} targetEmail={preview.targetEmail} />
    </div>
  );
}

function Failure({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="text-muted-foreground mt-2 text-sm">{body}</p>}
      {action && (
        <a
          href={action.href}
          className="text-primary mt-4 inline-block text-sm font-medium hover:underline"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
