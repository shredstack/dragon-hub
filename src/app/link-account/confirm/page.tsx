import { cookies } from "next/headers";
import { redeemAccountLink } from "@/lib/account-merge";
import { createNativeSessionCookie } from "@/lib/native-session";

export const metadata = { title: "Connect your account" };

/**
 * The redemption step of the Private Relay merge.
 *
 * Possession of the token proves the target address — it only ever went to
 * that inbox — so this page both merges and signs the user in *as the target
 * account*, which is the account they actually want to be in.
 *
 * Session minting reuses `createNativeSessionCookie`, the same primitive the
 * native OAuth handoff uses. That is deliberate: there is exactly one place in
 * this codebase that hand-mints an Auth.js session, so there is exactly one
 * place to re-verify when Auth.js is upgraded.
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

  const result = await redeemAccountLink(token);

  if (!result.ok) {
    if (result.reason === "no_target_account") {
      return (
        <Failure
          title="No account at that address"
          body="We couldn't find a DragonHub account for the email address you gave. If your school signed you up under a different address, try that one — or use your school's join code."
          action={{ href: "/link-account", label: "Try a different address" }}
        />
      );
    }
    if (result.reason === "same_account") {
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

  // Sign them in as the target account. The relay account no longer exists, so
  // any session pointing at it is now invalid anyway.
  const cookie = await createNativeSessionCookie(result.userId);
  (await cookies()).set(cookie.name, cookie.value, cookie.options);

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <h2 className="text-lg font-semibold">You&apos;re all connected</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with Apple now takes you straight to your DragonHub account at{" "}
        <strong className="text-foreground">{result.email}</strong>, with your
        school, classrooms and committees where you left them.
      </p>
      <a
        href="/dashboard"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
      >
        Go to DragonHub
      </a>
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
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="mt-2 text-sm text-muted-foreground">{body}</p>}
      {action && (
        <a
          href={action.href}
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
