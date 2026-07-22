"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  archiveCampaignEvent,
  deleteCampaignEvent,
  importEventsFromCatalog,
  reorderCampaignEvents,
  updateCampaignEvent,
  type CampaignEventInput,
} from "@/actions/volunteer-campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { IconPicker } from "@/components/ui/icon-picker";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EVENT_CATEGORIES } from "@/lib/constants";

interface CampaignEvent {
  id: string;
  title: string;
  description: string | null;
  volunteerResponsibilities: string | null;
  typicalTiming: string | null;
  timeCommitment: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  eventPlanId: string | null;
  eventCatalogId: string | null;
  eventPlan?: { id: string; title: string } | null;
}

interface CatalogEntry {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  timing: string | null;
  volunteerResponsibilities: string | null;
  timeCommitment: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  needsVolunteerCopy: boolean;
  alreadyImported: boolean;
}

interface Props {
  campaignId: string;
  events: CampaignEvent[];
  eventPlans: Array<{ id: string; title: string; schoolYear: string }>;
  catalogEntries: CatalogEntry[];
}

export function EventEditor({
  campaignId,
  events,
  eventPlans,
  catalogEntries,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<CampaignEvent | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  const available = catalogEntries.filter((e) => !e.alreadyImported);

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= events.length) return;
    const ids = events.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderCampaignEvents(campaignId, ids);
    router.refresh();
  };

  /**
   * Try the permanent delete first and fall back to archiving. The server
   * refuses once anyone has signed up, and its message names the count — which
   * is better information than this component could gather on its own.
   */
  const handleDelete = async (event: CampaignEvent) => {
    const ok = await confirm({
      title: `Remove "${event.title}" from this campaign?`,
      description:
        "It comes off the public signup page. If anyone has already volunteered for it, the event is archived instead so their response is kept.",
      confirmLabel: "Remove event",
    });
    if (!ok) return;

    try {
      await deleteCampaignEvent(event.id);
    } catch {
      await archiveCampaignEvent(event.id);
    } finally {
      closeConfirm();
    }
    router.refresh();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Events</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What parents will see and can express interest in. Pick from your
            recurring events so the description and time commitment come along.
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)}>Add Events</Button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {catalogEntries.length === 0 ? (
            <>
              No recurring events yet. Add them under{" "}
              <Link
                href="/admin/board/event-catalog"
                className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
              >
                Recurring Events
              </Link>{" "}
              first, then pick the ones this campaign is recruiting for.
            </>
          ) : (
            <>No events yet. Add the ones this campaign is recruiting for.</>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-lg border border-border p-4"
            >
              <EventThumbnail event={event} />

              <div className="min-w-0 flex-1">
                <p className="font-medium">{event.title}</p>
                {(event.typicalTiming || event.timeCommitment) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[event.typicalTiming, event.timeCommitment]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {event.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {event.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {event.eventCatalogId && (
                    <Badge variant="secondary">From catalog</Badge>
                  )}
                  {event.eventPlan && (
                    <Badge variant="secondary">
                      Linked: {event.eventPlan.title}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => move(index, 1)}
                    disabled={index === events.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(event)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(event)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EventDialog
          event={editing}
          eventPlans={eventPlans}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {importOpen && (
        <ImportDialog
          campaignId={campaignId}
          catalogEntries={available}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            router.refresh();
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}

function CatalogThumbnail({ entry }: { entry: CatalogEntry }) {
  if (entry.imageUrl) {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        <Image
          src={entry.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="40px"
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl">
      {entry.iconEmoji || "📌"}
    </div>
  );
}

function EventThumbnail({ event }: { event: CampaignEvent }) {
  if (event.imageUrl) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
        <Image
          src={event.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="48px"
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
      {event.iconEmoji || "📌"}
    </div>
  );
}

/**
 * Per-campaign edits to an event that came from the catalog.
 *
 * Changes here are deliberately local to this campaign: the flyer for a spring
 * push gets worded differently than a back-to-school one, and that wording must
 * not rewrite the recurring event for everyone else.
 */
function EventDialog({
  event,
  eventPlans,
  onClose,
  onSaved,
}: {
  event: CampaignEvent;
  eventPlans: Array<{ id: string; title: string; schoolYear: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CampaignEventInput>({
    title: event.title,
    description: event.description ?? "",
    volunteerResponsibilities: event.volunteerResponsibilities ?? "",
    typicalTiming: event.typicalTiming ?? "",
    timeCommitment: event.timeCommitment ?? "",
    iconEmoji: event.iconEmoji ?? "",
    imageUrl: event.imageUrl ?? "",
    eventPlanId: event.eventPlanId,
  });
  const [isSaving, setIsSaving] = useState(false);

  const set = (patch: Partial<CampaignEventInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.title?.trim()) return;
    setIsSaving(true);
    try {
      await updateCampaignEvent(event.id, form);
      onSaved();
    } catch (error) {
      console.error("Failed to save event:", error);
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {event.eventCatalogId && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                Edits apply to this campaign only. To change the event for every
                campaign, edit it under{" "}
                <Link
                  href="/admin/board/event-catalog"
                  className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                >
                  Recurring Events
                </Link>
                .
              </p>
            )}

            <div>
              <Label htmlFor="event-title">Event Name *</Label>
              <Input
                id="event-title"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Chinese New Year Assembly"
              />
            </div>

            <IconPicker
              iconEmoji={form.iconEmoji ?? ""}
              imageUrl={form.imageUrl ?? ""}
              onChange={({ iconEmoji, imageUrl }) =>
                set({ iconEmoji, imageUrl })
              }
            />

            <div>
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                value={form.description ?? ""}
                onChange={(e) => set({ description: e.target.value })}
                rows={2}
                placeholder="A school-wide assembly celebrating Lunar New Year with performances and crafts."
              />
            </div>

            <div>
              <Label htmlFor="event-responsibilities">
                What Volunteers Do
              </Label>
              <Textarea
                id="event-responsibilities"
                value={form.volunteerResponsibilities ?? ""}
                onChange={(e) =>
                  set({ volunteerResponsibilities: e.target.value })
                }
                rows={4}
                placeholder={
                  "Set up chairs in the gym\nHelp run the craft stations\nHand out snacks\nClean up after"
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The single biggest thing parents want to know before saying yes.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="event-timing">When</Label>
                <Input
                  id="event-timing"
                  value={form.typicalTiming ?? ""}
                  onChange={(e) => set({ typicalTiming: e.target.value })}
                  placeholder="Late January"
                />
              </div>
              <div>
                <Label htmlFor="event-commitment">Time Commitment</Label>
                <Input
                  id="event-commitment"
                  value={form.timeCommitment ?? ""}
                  onChange={(e) => set({ timeCommitment: e.target.value })}
                  placeholder="About 2 hours"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="event-plan">Link to Event Plan</Label>
              <select
                id="event-plan"
                value={form.eventPlanId ?? ""}
                onChange={(e) => set({ eventPlanId: e.target.value || null })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Not linked</option>
                {eventPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title} ({plan.schoolYear})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Once that plan has a SignUpGenius link, parents see a
                &ldquo;sign up for a time slot&rdquo; button here automatically.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.title?.trim()}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportDialog({
  campaignId,
  catalogEntries,
  onClose,
  onImported,
}: {
  campaignId: string;
  catalogEntries: CatalogEntry[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleImport = async () => {
    if (selected.length === 0) return;
    setIsImporting(true);
    try {
      await importEventsFromCatalog(campaignId, selected);
      onImported();
    } catch (error) {
      console.error("Failed to import events:", error);
      setIsImporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Events to This Campaign</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Pick the recurring events this campaign is recruiting for. Their
          description, icon, and volunteer details come across as a starting
          point — edit them afterwards and the recurring event stays untouched.
        </p>

        {catalogEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Every recurring event is already on this campaign. Add more under{" "}
            <Link
              href="/admin/board/event-catalog"
              className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
            >
              Recurring Events
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-2">
            {catalogEntries.map((entry) => (
              <label
                key={entry.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  selected.includes(entry.id)
                    ? "border-dragon-blue-500 bg-dragon-blue-50 dark:bg-dragon-blue-950"
                    : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(entry.id)}
                  onChange={() => toggle(entry.id)}
                  className="mt-1"
                />
                <CatalogThumbnail entry={entry} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{entry.title}</span>
                    {entry.category && (
                      <Badge variant="secondary">
                        {EVENT_CATEGORIES[
                          entry.category as keyof typeof EVENT_CATEGORIES
                        ] ?? entry.category}
                      </Badge>
                    )}
                  </div>
                  {(entry.timing || entry.timeCommitment) && (
                    <p className="text-xs text-muted-foreground">
                      {[entry.timing, entry.timeCommitment]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {entry.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {entry.description}
                    </p>
                  )}
                  {/* The field parents read first. Flagging it here is cheaper
                      than discovering the blank card after the QR code ships. */}
                  {entry.needsVolunteerCopy && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      No &ldquo;what volunteers do&rdquo; written yet — add it
                      after importing, or on the recurring event so every
                      campaign gets it.
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || selected.length === 0}
          >
            {isImporting
              ? "Adding..."
              : `Add ${selected.length || ""} Event${selected.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
