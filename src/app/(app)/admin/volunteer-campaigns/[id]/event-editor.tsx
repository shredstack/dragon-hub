"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  addCampaignEvent,
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
import { MediaPicker } from "@/components/media/media-picker";

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

interface Props {
  campaignId: string;
  events: CampaignEvent[];
  eventPlans: Array<{ id: string; title: string; schoolYear: string }>;
  catalogEntries: Array<{
    id: string;
    title: string;
    description: string | null;
    typicalTiming: string | null;
    alreadyImported: boolean;
  }>;
}

// A starter palette so a board member can make an event stand out in one tap
// instead of hunting through the system emoji picker.
const SUGGESTED_EMOJI = [
  "🐉", "🎃", "💝", "🎨", "🏃", "📚", "🍎", "🎪", "🌮", "🎵",
  "🔬", "🌱", "🎬", "🏆", "🎁", "☕", "🧁", "🎓", "🌟", "🤝",
];

const EMPTY_EVENT: CampaignEventInput = {
  title: "",
  description: "",
  volunteerResponsibilities: "",
  typicalTiming: "",
  timeCommitment: "",
  iconEmoji: "",
  imageUrl: "",
  eventPlanId: null,
};

export function EventEditor({
  campaignId,
  events,
  eventPlans,
  catalogEntries,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<CampaignEvent | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= events.length) return;
    const ids = events.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderCampaignEvents(campaignId, ids);
    router.refresh();
  };

  const handleDelete = async (event: CampaignEvent) => {
    if (
      !confirm(
        `Remove "${event.title}"? Any volunteer responses for it will be deleted too.`
      )
    ) {
      return;
    }
    await deleteCampaignEvent(event.id);
    router.refresh();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Events</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What parents will see and can express interest in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {catalogEntries.length > 0 && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Import from Catalog
            </Button>
          )}
          <Button onClick={() => setEditing("new")}>Add Event</Button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No events yet. Add them one at a time, or import from your event
          catalog to start from what the PTA ran last year.
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
          campaignId={campaignId}
          event={editing === "new" ? null : editing}
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
          catalogEntries={catalogEntries}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            router.refresh();
          }}
        />
      )}
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

function EventDialog({
  campaignId,
  event,
  eventPlans,
  onClose,
  onSaved,
}: {
  campaignId: string;
  event: CampaignEvent | null;
  eventPlans: Array<{ id: string; title: string; schoolYear: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CampaignEventInput>(
    event
      ? {
          title: event.title,
          description: event.description ?? "",
          volunteerResponsibilities: event.volunteerResponsibilities ?? "",
          typicalTiming: event.typicalTiming ?? "",
          timeCommitment: event.timeCommitment ?? "",
          iconEmoji: event.iconEmoji ?? "",
          imageUrl: event.imageUrl ?? "",
          eventPlanId: event.eventPlanId,
        }
      : EMPTY_EVENT
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const set = (patch: Partial<CampaignEventInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.title?.trim()) return;
    setIsSaving(true);
    try {
      if (event) {
        await updateCampaignEvent(event.id, form);
      } else {
        await addCampaignEvent(campaignId, form);
      }
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
            <DialogTitle>{event ? "Edit Event" : "Add Event"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="event-title">Event Name *</Label>
              <Input
                id="event-title"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Chinese New Year Assembly"
              />
            </div>

            {/* Visual identity — an emoji is one tap and does most of the work. */}
            <div>
              <Label className="mb-2 block">Icon</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
                  {form.imageUrl ? (
                    <div className="relative h-12 w-12 overflow-hidden rounded-lg">
                      <Image
                        src={form.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="48px"
                        unoptimized
                      />
                    </div>
                  ) : (
                    form.iconEmoji || "📌"
                  )}
                </div>
                <Input
                  value={form.iconEmoji ?? ""}
                  onChange={(e) => set({ iconEmoji: e.target.value })}
                  placeholder="Paste an emoji"
                  className="max-w-[10rem]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                >
                  {form.imageUrl ? "Change Image" : "Use Image"}
                </Button>
                {form.imageUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => set({ imageUrl: "" })}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {SUGGESTED_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => set({ iconEmoji: emoji, imageUrl: "" })}
                    className="rounded p-1 text-xl hover:bg-muted"
                    aria-label={`Use ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                An image takes priority over the emoji when both are set.
              </p>
            </div>

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
              {isSaving ? "Saving..." : event ? "Save Changes" : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => {
          set({ imageUrl: item.blobUrl });
          setPickerOpen(false);
        }}
      />
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
  catalogEntries: Props["catalogEntries"];
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
          <DialogTitle>Import from Event Catalog</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Copies the catalog&apos;s description and key tasks in as a starting
          point. Edit the copy afterwards — the catalog itself stays untouched.
        </p>

        <div className="space-y-2">
          {catalogEntries.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${
                selected.includes(entry.id)
                  ? "border-dragon-blue-500 bg-dragon-blue-50"
                  : "border-border"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(entry.id)}
                onChange={() => toggle(entry.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{entry.title}</span>
                  {entry.alreadyImported && (
                    <Badge variant="secondary">Already added</Badge>
                  )}
                </div>
                {entry.typicalTiming && (
                  <p className="text-xs text-muted-foreground">
                    {entry.typicalTiming}
                  </p>
                )}
                {entry.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {entry.description}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || selected.length === 0}
          >
            {isImporting ? "Importing..." : `Import ${selected.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
