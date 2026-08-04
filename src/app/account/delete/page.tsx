import { DeleteRequestForm } from "./delete-request-form";

export const metadata = {
  title: "Delete your DragonHub account",
  description:
    "Request deletion of your DragonHub account and the data attached to it.",
};

/**
 * The public, signed-out account deletion page.
 *
 * Google Play's Data Safety form requires a deletion URL reachable without
 * installing the app, and it is checked by a human who will simply open it. It
 * must therefore work in a private window, on a phone, with no session — which
 * is why it is a public route with its own minimal layout.
 *
 * The URL is also cited in `/privacy` §7. If this path ever moves, that section
 * and the Play Console entry move with it.
 */
export default function DeleteAccountPage() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Delete your account</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the email address you use for DragonHub. We&apos;ll send you a
        link to confirm — nothing is deleted until you follow it.
      </p>

      <DeleteRequestForm />

      <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">What gets deleted</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your profile, phone number and photo</li>
          <li>Your school, classroom and committee memberships</li>
          <li>Your volunteer sign-ups, and any logged volunteer hours</li>
          <li>Your notifications and any registered devices</li>
        </ul>
        <p className="mt-3">
          Posts you made on message boards stay, so conversations still make
          sense to the people in them — but they are no longer attributed to
          you.
        </p>
        <p className="mt-3">
          Already signed in? You can also delete your account from{" "}
          <strong>Profile → Delete account</strong> inside the app.
        </p>
      </div>
    </div>
  );
}
