"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

export interface ConfirmOptions {
  /** Short question, e.g. "Delete this attachment?" */
  title: string;
  /** What is about to happen, in plain language. */
  description?: React.ReactNode;
  /**
   * Things that get destroyed alongside the target — rendered as a list so a
   * cascade is visible before the tap, not discovered afterwards.
   */
  consequences?: string[];
  /** Softer alternative to offer, e.g. "Archive it instead to keep the history." */
  alternative?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * When set, the confirm button stays disabled until the user types this
   * exact text. Reserve it for deletes that take history down with them.
   */
  confirmPhrase?: string;
  /** Non-destructive confirmations render in the primary colour instead of red. */
  tone?: "destructive" | "default";
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Promise-based confirmation, shaped as a drop-in for `window.confirm` so that
 * replacing a native prompt is a one-line change at the call site.
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: "Delete this?" }))) return;
 *   ...
 *   return <>{rows}{confirmDialog}</>;
 *
 * State is local to the calling component, so there is no provider to mount.
 */
export function useConfirm() {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    setTyped("");
    setBusy(false);
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = React.useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
      setTyped("");
      setBusy(false);
    },
    [pending]
  );

  const confirmDialog = (
    <ConfirmDialog
      pending={pending}
      typed={typed}
      onTypedChange={setTyped}
      busy={busy}
      onConfirm={() => {
        // The caller awaits our promise and then does the slow work, so keep
        // the dialog on screen in a spinning state rather than flashing it
        // away while the delete is still in flight.
        setBusy(true);
        pending?.resolve(true);
      }}
      onCancel={() => settle(false)}
      onClosed={() => settle(false)}
    />
  );

  /** Call after the awaited work finishes so the dialog stops spinning. */
  const closeConfirm = React.useCallback(() => {
    setPending(null);
    setTyped("");
    setBusy(false);
  }, []);

  return { confirm, confirmDialog, closeConfirm };
}

function ConfirmDialog({
  pending,
  typed,
  onTypedChange,
  busy,
  onConfirm,
  onCancel,
  onClosed,
}: {
  pending: PendingConfirm | null;
  typed: string;
  onTypedChange: (value: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const tone = pending?.tone ?? "destructive";
  const phraseOk =
    !pending?.confirmPhrase ||
    typed.trim().toLowerCase() === pending.confirmPhrase.trim().toLowerCase();

  return (
    <DialogPrimitive.Root
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open && !busy) onClosed();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          // Anchored near the bottom on mobile so the buttons land under the
          // thumb, centred once there is room for a normal dialog.
          className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-lg sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6"
          onOpenAutoFocus={(event) => {
            // Never hand focus to the destructive button: a stray Enter on a
            // keyboard, or the browser restoring focus on mobile, must not
            // be enough to delete something.
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <div className="flex gap-3">
            {tone === "destructive" && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-snug">
                {pending?.title}
              </DialogPrimitive.Title>
              {pending?.description && (
                <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
                  {pending.description}
                </DialogPrimitive.Description>
              )}
            </div>
          </div>

          {pending?.consequences && pending.consequences.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {pending.consequences.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-destructive">
                    &bull;
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          {pending?.alternative && (
            <p className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
              {pending.alternative}
            </p>
          )}

          {pending?.confirmPhrase && (
            <div className="mt-4">
              <label
                htmlFor="confirm-phrase"
                className="text-sm text-muted-foreground"
              >
                Type <span className="font-semibold text-foreground">{pending.confirmPhrase}</span>{" "}
                to confirm
              </label>
              <Input
                id="confirm-phrase"
                value={typed}
                onChange={(event) => onTypedChange(event.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                className="mt-1.5"
              />
            </div>
          )}

          {/* Destructive action on top, cancel resting under the thumb. Both
              full-height targets so neither is a mis-tap away from the other. */}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={cancelRef}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              onClick={onCancel}
              disabled={busy}
            >
              {pending?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={tone === "destructive" ? "destructive" : "default"}
              size="lg"
              className="w-full sm:w-auto"
              onClick={onConfirm}
              disabled={busy || !phraseOk}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending?.confirmLabel ?? "Delete"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Icon-sized destructive button with a full 44px touch target, for the rows
 * where a delete icon sits beside an edit icon. The visible glyph stays small;
 * the padding that makes it tappable is what grows.
 */
export const DeleteIconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }
>(({ className, busy, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    disabled={busy || props.disabled}
    {...props}
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
  </button>
));
DeleteIconButton.displayName = "DeleteIconButton";
