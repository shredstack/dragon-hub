import { getDeletionConfirmInfo } from "@/actions/account-deletion-web";
import { DeleteConfirmForm } from "./delete-confirm-form";

export const metadata = { title: "Confirm account deletion" };

export default async function ConfirmDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const info = token ? await getDeletionConfirmInfo(token) : null;

  if (!info) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">This link has expired</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Deletion links work once and last an hour. Nothing has been deleted.
        </p>
        <a
          href="/account/delete"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Request a new link
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Delete this account?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You&apos;re about to permanently delete the DragonHub account for{" "}
        <strong className="text-foreground">{info.email}</strong>. This
        can&apos;t be undone.
      </p>

      <DeleteConfirmForm token={token!} blockedSchool={info.blockedSchool} />
    </div>
  );
}
