"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  deleteMyAccount,
  getAccountDeletionPreview,
  type AccountDeletionPreview,
} from "@/actions/account";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * "Delete account", at the bottom of /profile.
 *
 * Both stores require an in-app deletion path and both check it is findable —
 * burying it is its own rejection. It is visually separated rather than hidden,
 * and the dialog states the consequences in plain language before asking for
 * anything.
 *
 * The preview is loaded when the dialog opens, not on page load: it is several
 * counting queries, and almost nobody opens this.
 */
export function DeleteAccountCard({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setConfirmation("");
    setPreview(null);
    try {
      setPreview(await getAccountDeletionPreview());
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't check your account."));
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(confirmation);
      // The account is gone, so the session must go with it — otherwise the
      // next request is authenticated as a user that no longer exists.
      await signOut({ redirect: false });
      window.location.assign("/goodbye");
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't delete your account."));
      setBusy(false);
    }
  }

  const confirmationMatches =
    confirmation.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <>
      <div className="mt-10 rounded-lg border border-destructive/30 bg-card p-6">
        <h2 className="text-lg font-semibold text-destructive">
          Delete account
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently delete your DragonHub account and everything attached to
          it. This can&apos;t be undone.
        </p>
        <Button
          variant="outline"
          className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={openDialog}
        >
          Delete my account
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader className="mb-4">
            <DialogTitle>Delete your account?</DialogTitle>
          </DialogHeader>
        {!preview && !error ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : preview?.blocked ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-md bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">
                  You&apos;re the only PTA board member at{" "}
                  {preview.blocked.schoolName}.
                </p>
                <p className="mt-1">
                  If you go, nobody can approve volunteer hours, publish
                  articles, or add board members — including adding a
                  replacement for you. Make someone else a board member first,
                  then come back here.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <p className="text-sm">Deleting your account will:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {preview.schools.length > 0 && (
                <li>
                  Remove you from {preview.schools.join(", ")}, including every
                  classroom and committee you&apos;re on.
                </li>
              )}
              {preview.volunteerSeats + preview.committeeSeats > 0 && (
                <li>
                  Give up{" "}
                  {preview.volunteerSeats + preview.committeeSeats} volunteer{" "}
                  {preview.volunteerSeats + preview.committeeSeats === 1
                    ? "spot"
                    : "spots"}
                  . If anyone is on a waitlist for them, they&apos;ll be moved up
                  straight away.
                </li>
              )}
              {preview.volunteerHours > 0 && (
                <li>
                  Delete your {preview.volunteerHours} logged volunteer{" "}
                  {preview.volunteerHours === 1 ? "hour" : "hours"}.
                </li>
              )}
              <li>Delete your profile, your notifications and your devices.</li>
            </ul>

            {preview.messageCount > 0 && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Your {preview.messageCount}{" "}
                {preview.messageCount === 1 ? "post" : "posts"} on message boards
                will stay, so conversations still make sense to the people in
                them — but they&apos;ll be attributed to a removed member rather
                than to you.
              </p>
            )}

            <div>
              <label
                htmlFor="delete-confirm"
                className="mb-1 block text-sm font-medium"
              >
                Type <span className="font-mono">{preview.email}</span> to
                confirm
              </label>
              <input
                id="delete-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Keep my account
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!confirmationMatches || busy}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete my account
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-red-600">{error}</p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  );
}
