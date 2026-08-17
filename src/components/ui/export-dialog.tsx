"use client";

import { useTransition } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { downloadCsv, toCsv } from "@/lib/csv";

/**
 * The shell every CSV export in the app wears.
 *
 * Downloading, copying the addresses, the file-name stamp, the toasts and the
 * "why was it empty" message are the same job wherever the export is launched
 * from; only the *filters* differ. So this component owns the footer and the
 * plumbing, and each caller supplies its own controls as `children` plus a
 * `run` closure that goes to the server. The PTA board's member export and a
 * teacher's classroom roster export are the same dialog with different middles.
 *
 * `ExportSection` / `ExportCheckboxRow` / `toggleValue` live here too, so those
 * middles look alike without being copy-pasted.
 */

/**
 * What an export action returns. Deliberately the shape `MemberExportResult`
 * already had — a set of columns, rows keyed by them, and the addresses — so a
 * server action can be handed straight to `run` without a mapping layer.
 */
export interface ExportPayload<K extends string = string> {
  columns: { key: K; label: string }[];
  rows: Record<K, string>[];
  /** Unique addresses behind the rows. Empty is a valid answer. */
  emails: string[];
  /** Distinct people, which can be lower than `rows.length` — or zero. */
  memberCount: number;
}

interface ExportDialogProps<P extends ExportPayload> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** File basename; a YYYY-MM-DD stamp and `.csv` are appended. */
  filename: string;
  /** Runs the export on the server. Called once per button press. */
  run: () => Promise<P>;
  /**
   * Why an empty result was empty. Given the whole payload — an export result
   * usually knows more about why than the filters do ("no classrooms exist for
   * this year yet"), and the generic keeps those extra fields visible here.
   */
  emptyMessage?: (payload: P) => string;
  /** Standing note above the filters — what this file does and doesn't contain. */
  disclaimer?: React.ReactNode;
  /** Lines appended to the CSV itself, under a blank row. */
  csvNotes?: string[];
  /** Blocks both buttons — e.g. every column unchecked. */
  disabled?: boolean;
  /** Drop the "Copy emails" button for an export that isn't a mailing list. */
  hideCopyEmails?: boolean;
  children: React.ReactNode;
}

export function ExportDialog<P extends ExportPayload>({
  open,
  onOpenChange,
  title,
  description,
  filename,
  run,
  emptyMessage,
  disclaimer,
  csvNotes,
  disabled,
  hideCopyEmails,
  children,
}: ExportDialogProps<P>) {
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const reasonFor = (payload: P) =>
    emptyMessage?.(payload) ?? "Nothing matches those filters.";

  function handleDownload() {
    const stamp = new Date().toISOString().slice(0, 10);
    startTransition(async () => {
      try {
        const payload = await run();
        if (payload.rows.length === 0) {
          addToast(reasonFor(payload), "destructive");
          return;
        }
        downloadCsv(
          `${filename}-${stamp}.csv`,
          toCsv(payload.columns, payload.rows, { notes: csvNotes })
        );
        const rows = `${payload.rows.length} row${
          payload.rows.length === 1 ? "" : "s"
        }`;
        // An unfilled-spots export can legitimately have rows and no people —
        // "for 0 members" would read as a failure rather than as the answer.
        addToast(
          payload.memberCount === 0
            ? `Exported ${rows}.`
            : `Exported ${rows} for ${payload.memberCount} ${
                payload.memberCount === 1 ? "person" : "people"
              }.`,
          "success"
        );
        onOpenChange(false);
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Export failed.",
          "destructive"
        );
      }
    });
  }

  function handleCopyEmails() {
    startTransition(async () => {
      try {
        const payload = await run();
        if (payload.emails.length === 0) {
          addToast(reasonFor(payload), "destructive");
          return;
        }
        await navigator.clipboard.writeText(payload.emails.join(", "));
        addToast(
          `Copied ${payload.emails.length} email address${
            payload.emails.length === 1 ? "" : "es"
          }.`,
          "success"
        );
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Copy failed.",
          "destructive"
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {disclaimer}
          {children}
        </div>

        <DialogFooter className="gap-2">
          {!hideCopyEmails && (
            <Button
              variant="outline"
              onClick={handleCopyEmails}
              disabled={isPending || disabled}
            >
              <Copy className="h-4 w-4" />
              Copy emails
            </Button>
          )}
          <Button onClick={handleDownload} disabled={isPending || disabled}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExportCheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-dragon-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}

export function ExportSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {title}{" "}
          {hint && (
            <span className="font-normal text-muted-foreground">({hint})</span>
          )}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A preset card: radio, label, and the sentence explaining what it gives you. */
export function ExportPresetCard({
  checked,
  onSelect,
  name,
  label,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  /** Radio group name — one per dialog. */
  name: string;
  label: string;
  description: string;
}) {
  return (
    <label
      className={`cursor-pointer rounded-lg border p-3 text-left ${
        checked ? "border-dragon-blue-500 bg-muted" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onSelect}
          className="h-4 w-4 accent-dragon-blue-500"
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </label>
  );
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}
