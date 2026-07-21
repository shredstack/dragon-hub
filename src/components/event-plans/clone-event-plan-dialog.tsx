"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getClonePreview, cloneEventPlan } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyPlus, Loader2 } from "lucide-react";

interface CloneEventPlanDialogProps {
  /** The prior year's plan being copied from. */
  sourcePlanId: string;
  sourceTitle: string;
  sourceSchoolYear: string;
  /** The year the copy is filed under. */
  targetSchoolYear: string;
  trigger?: React.ReactNode;
}

interface Counts {
  tasks: number;
  resources: number;
  contacts: number;
  members: number;
}

export function CloneEventPlanDialog({
  sourcePlanId,
  sourceTitle,
  sourceSchoolYear,
  targetSchoolYear,
}: CloneEventPlanDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(sourceTitle);
  const [eventDate, setEventDate] = useState("");
  const [include, setInclude] = useState({
    details: true,
    tasks: true,
    resources: true,
    contacts: true,
    members: false,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getClonePreview(sourcePlanId)
      .then((preview) => {
        if (!cancelled) setCounts(preview.counts);
      })
      .catch(() => {
        if (!cancelled) setError("Could not read last year's plan.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourcePlanId]);

  function handleClone() {
    setError(null);
    startTransition(async () => {
      try {
        const plan = await cloneEventPlan(sourcePlanId, {
          title,
          schoolYear: targetSchoolYear,
          eventDate: eventDate || undefined,
          includeDetails: include.details,
          includeTasks: include.tasks,
          includeResources: include.resources,
          includeContacts: include.contacts,
          includeMembers: include.members,
        });
        setOpen(false);
        router.push(`/events/${plan.id}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not copy that plan."
        );
      }
    });
  }

  const options: {
    key: keyof typeof include;
    label: string;
    hint: string;
  }[] = [
    {
      key: "details",
      label: "Description, location, and budget",
      hint: "",
    },
    {
      key: "tasks",
      label: `Tasks${counts ? ` (${counts.tasks})` : ""}`,
      hint: eventDate
        ? "Due dates shift to match the new event date; assignees and checkmarks reset."
        : "Set an event date above to carry due dates across.",
    },
    {
      key: "resources",
      label: `Resource links${counts ? ` (${counts.resources})` : ""}`,
      hint: "Web and Drive links only — uploaded files stay with last year's plan.",
    },
    {
      key: "contacts",
      label: `Contacts${counts ? ` (${counts.contacts})` : ""}`,
      hint: "Contacts saved to the recurring event come across automatically either way.",
    },
    {
      key: "members",
      label: `Team members${counts ? ` (${counts.members})` : ""}`,
      hint: "Off by default — last year's volunteers haven't agreed to this year.",
    },
  ];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CopyPlus className="h-4 w-4" /> Start from {sourceSchoolYear}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Start {targetSchoolYear} from last year</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copies from <strong>{sourceTitle}</strong> ({sourceSchoolYear}).
              Approvals, discussion, meetings, and the SignUpGenius link are
              never copied — those are last year&rsquo;s record.
            </p>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Event date
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Task due dates shift by the same amount, so &ldquo;three weeks
                before&rdquo; stays three weeks before.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">What to bring across</p>
              {options.map((option) => (
                <label
                  key={option.key}
                  className="flex items-start gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={include[option.key]}
                    onChange={(e) =>
                      setInclude((prev) => ({
                        ...prev,
                        [option.key]: e.target.checked,
                      }))
                    }
                    className="mt-1"
                  />
                  <span>
                    {option.label}
                    {option.hint && (
                      <span className="block text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleClone}
                disabled={isPending || !title.trim()}
              >
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create {targetSchoolYear} Plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
