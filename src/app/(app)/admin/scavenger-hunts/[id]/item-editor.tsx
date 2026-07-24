"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveHuntItem,
  createHuntItem,
  deleteHuntItem,
  getHuntItemHistoryCounts,
  reorderHuntItems,
  restoreHuntItem,
  updateHuntItem,
  type HuntItemInput,
  type HuntQuestion,
} from "@/actions/scavenger-hunts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  LinkOpenModeBadge,
  LinkOpenModeField,
} from "@/components/ui/link-open-mode-field";
import {
  defaultOpenModeFor,
  normalizeLinkUrl,
  parseLinkOpenMode,
} from "@/lib/links-shared";

interface HuntItem {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  linkUrl: string | null;
  linkLabel: string | null;
  linkOpenMode: string;
  questions: HuntQuestion[];
  saveResponses: boolean;
  archivedAt: Date | null;
}

/** Stable id for a new question row — the server keeps any id the client sends. */
function newQuestionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/**
 * A starter palette for the things a hunt actually asks for — a booth, a
 * teacher, a photo — so a board member picks one in a tap instead of hunting
 * through the system emoji keyboard.
 */
const SUGGESTED_EMOJI = [
  "⭐", "🎨", "📚", "🍎", "🎪", "🏃", "🎵", "🔬", "🌱", "🏆",
  "🎁", "☕", "🧁", "🎓", "🤝", "📸", "🐉", "🎯", "🧩", "🎈",
];

export function ItemEditor({
  huntId,
  items,
}: {
  huntId: string;
  items: HuntItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<HuntItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  const live = items.filter((i) => !i.archivedAt);
  const archived = items.filter((i) => i.archivedAt);

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= live.length) return;
    const ids = live.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderHuntItems(huntId, ids);
    router.refresh();
  };

  /**
   * Ask the server what is attached before choosing between a delete and an
   * archive. Inferring that from a failed delete would read a network blip or
   * an expired session as "someone checked it off" and quietly run a different
   * mutation than the board member asked for — and a server action's error
   * doesn't survive the boundary intact, so the cause can't be told apart on
   * this side anyway.
   */
  const handleDelete = async (item: HuntItem) => {
    setError(null);

    let history;
    try {
      history = await getHuntItemHistoryCounts(item.id);
    } catch (err) {
      console.error("Failed to check item history:", err);
      setError(
        `Couldn't check whether anyone has found "${item.title}" yet. Please try again.`
      );
      return;
    }

    // Someone already has the point. Archiving keeps their score and moves the
    // finish line down by one; deleting would cascade the check-off away.
    if (!history.isEmpty) {
      const archive = await confirm({
        title: `"${item.title}" can't be removed for good`,
        description: "Families have already found it:",
        consequences: history.lines,
        alternative:
          "Archive it instead — it comes off the board, everyone keeps the point they earned, and the finish line moves down by one.",
        confirmLabel: "Archive instead",
        cancelLabel: "Keep item",
        tone: "default",
      });
      closeConfirm();
      if (!archive) return;

      try {
        await archiveHuntItem(item.id);
        router.refresh();
      } catch (err) {
        console.error("Failed to archive item:", err);
        setError(
          `Couldn't archive "${item.title}". Please try again — nothing was changed.`
        );
      }
      return;
    }

    const ok = await confirm({
      title: `Remove "${item.title}" from this hunt?`,
      description:
        "Nobody has found this one yet, so nothing is lost. It comes off the board for good.",
      confirmLabel: "Remove item",
    });
    if (!ok) return;

    try {
      await deleteHuntItem(item.id);
      router.refresh();
    } catch (err) {
      console.error("Failed to delete item:", err);
      setError(
        `Couldn't remove "${item.title}". Please try again — nothing was changed.`
      );
    } finally {
      closeConfirm();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Hunt Items</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What families go find. Keep them short and doable in one trip around
            the school — this replaces the paper list.
          </p>
        </div>
        <Button onClick={() => setIsAdding(true)}>Add Item</Button>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {live.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No items yet. Add the first thing families should go find.
        </div>
      ) : (
        <div className="space-y-3">
          {live.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
                {item.emoji}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.title}</p>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}
                {(item.linkUrl || item.questions.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.linkUrl && (
                      <>
                        <Badge variant="secondary">
                          {item.questions.length > 0 ? "Attachment: " : "Links to "}
                          {item.linkLabel || item.linkUrl}
                        </Badge>
                        <LinkOpenModeBadge
                          mode={parseLinkOpenMode(item.linkOpenMode)}
                        />
                      </>
                    )}
                    {item.questions.length > 0 && (
                      <Badge variant="secondary">
                        {item.questions.length} question
                        {item.questions.length === 1 ? "" : "s"}
                        {item.saveResponses ? " · saves answers" : ""}
                      </Badge>
                    )}
                  </div>
                )}
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
                    disabled={index === live.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(item)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(item)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Archived items
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Off the board, but the check-offs they already collected still count
            toward those players&apos; scores.
          </p>
          <div className="mt-2 space-y-2">
            {archived.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3"
              >
                <span className="text-xl opacity-60">{item.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {item.title}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await restoreHuntItem(item.id);
                    router.refresh();
                  }}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(editing || isAdding) && (
        <ItemDialog
          huntId={huntId}
          item={editing}
          onClose={() => {
            setEditing(null);
            setIsAdding(false);
          }}
          onSaved={() => {
            setEditing(null);
            setIsAdding(false);
            router.refresh();
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}

function ItemDialog({
  huntId,
  item,
  onClose,
  onSaved,
}: {
  huntId: string;
  item: HuntItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<HuntItemInput>({
    title: item?.title ?? "",
    description: item?.description ?? "",
    emoji: item?.emoji ?? "⭐",
    linkUrl: item?.linkUrl ?? "",
    linkLabel: item?.linkLabel ?? "",
    linkOpenMode: parseLinkOpenMode(item?.linkOpenMode),
    questions: item?.questions ?? [],
    saveResponses: item?.saveResponses ?? false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<HuntItemInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const questions = form.questions ?? [];
  const hasQuestions = questions.length > 0;
  const setQuestions = (qs: HuntQuestion[]) => set({ questions: qs });
  const updateQuestion = (index: number, patch: Partial<HuntQuestion>) =>
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  const addQuestion = () =>
    setQuestions([
      ...questions,
      // The first question is the common gate ("must be a member"), so it
      // defaults to requiring Yes; later ones just record an answer.
      { id: newQuestionId(), prompt: "", continueValue: questions.length === 0 ? "yes" : null },
    ]);
  const removeQuestion = (index: number) =>
    setQuestions(questions.filter((_, i) => i !== index));
  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
  };

  // Pre-fills the whole item for the budget-approval use case. Purely a form
  // shortcut — nothing about the saved item is special-cased.
  const applyBudgetPreset = () =>
    set({
      questions: [
        { id: newQuestionId(), prompt: "I am a member of the PTA", continueValue: "yes" },
        {
          id: newQuestionId(),
          prompt: "I approve the proposed budget for this year",
          continueValue: null,
        },
      ],
      saveResponses: true,
      linkLabel: form.linkLabel?.trim() ? form.linkLabel : "View the budget",
      // The budget is meant to open in a popup over the hunt.
      linkOpenMode: "in_app",
    });

  const linkTyped = (form.linkUrl ?? "").trim().length > 0;
  // Same rule the server applies, run here so a typo is caught before a save
  // round-trip rather than coming back as a generic failure.
  const linkLooksWrong = linkTyped && !normalizeLinkUrl(form.linkUrl ?? "");

  const handleSave = async () => {
    if (!form.title?.trim() || linkLooksWrong) return;
    setIsSaving(true);
    setError(null);
    try {
      if (item) {
        await updateHuntItem(item.id, form);
      } else {
        await createHuntItem(huntId, form);
      }
      onSaved();
    } catch (err) {
      console.error("Failed to save item:", err);
      setError("Couldn't save this item. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="item-title">What to find *</Label>
            <Input
              id="item-title"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Meet your teacher"
            />
          </div>

          <div>
            <Label className="mb-2 block">Emoji</Label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
                {form.emoji || "⭐"}
              </div>
              <Input
                value={form.emoji ?? ""}
                onChange={(e) => set({ emoji: e.target.value })}
                placeholder="Paste an emoji"
                className="max-w-[10rem]"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGGESTED_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => set({ emoji })}
                  className="rounded p-1 text-xl hover:bg-muted"
                  aria-label={`Use ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="item-description">Description</Label>
            <Textarea
              id="item-description"
              value={form.description ?? ""}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
              placeholder="Say hi and find out one thing the class is excited about this year."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="item-link-url">
                {hasQuestions ? "Attachment (optional)" : "Link (optional)"}
              </Label>
              <Input
                id="item-link-url"
                value={form.linkUrl ?? ""}
                onChange={(e) =>
                  // Pasting a URL picks the open mode, since most sites refuse
                  // to be shown inside another page. It's a default, not a
                  // lock — the choice below is right there.
                  set({
                    linkUrl: e.target.value,
                    linkOpenMode: defaultOpenModeFor(e.target.value),
                  })
                }
                placeholder={
                  hasQuestions
                    ? "https://docs.google.com/…/budget"
                    : "https://instagram.com/ourpta"
                }
              />
              {linkLooksWrong && (
                <p className="mt-1 text-xs text-red-600">
                  That doesn&apos;t look like a web address yet.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="item-link-label">
                {hasQuestions ? "Attachment label" : "Button Text"}
              </Label>
              <Input
                id="item-link-label"
                value={form.linkLabel ?? ""}
                onChange={(e) => set({ linkLabel: e.target.value })}
                placeholder={hasQuestions ? "View the budget" : "Follow us →"}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasQuestions
              ? "The attachment shows as a button inside the question popup — link the budget doc (a Google Doc or Drive PDF opens right in the popup)."
              : "A link turns the card into a one-tap action — joining the PTA, following the Instagram account, opening the volunteer sign-up."}
          </p>

          {linkTyped && (
            <LinkOpenModeField
              value={parseLinkOpenMode(form.linkOpenMode)}
              onChange={(linkOpenMode) => set({ linkOpenMode })}
              label={hasQuestions ? "How the attachment opens" : "How the link opens"}
            />
          )}

          <QuestionsBuilder
            questions={questions}
            saveResponses={form.saveResponses ?? false}
            onAdd={addQuestion}
            onRemove={removeQuestion}
            onMove={moveQuestion}
            onUpdate={updateQuestion}
            onToggleSave={(saveResponses) => set({ saveResponses })}
            onApplyBudgetPreset={applyBudgetPreset}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !form.title?.trim() || linkLooksWrong}
          >
            {isSaving ? "Saving..." : item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Questions builder ───────────────────────────────────────────────────────

function QuestionsBuilder({
  questions,
  saveResponses,
  onAdd,
  onRemove,
  onMove,
  onUpdate,
  onToggleSave,
  onApplyBudgetPreset,
}: {
  questions: HuntQuestion[];
  saveResponses: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onUpdate: (index: number, patch: Partial<HuntQuestion>) => void;
  onToggleSave: (value: boolean) => void;
  onApplyBudgetPreset: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold">Questions (optional)</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask yes/no questions when someone checks this off. A question can
            require “Yes” to move on — answer otherwise and the rest are skipped,
            but the item still completes.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onApplyBudgetPreset}
        >
          Budget approval preset
        </Button>
      </div>

      {questions.length > 0 && (
        <div className="mt-4 space-y-3">
          {questions.map((q, index) => {
            const isLast = index === questions.length - 1;
            return (
              <div
                key={q.id}
                className="rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm font-medium text-muted-foreground">
                    {index + 1}.
                  </span>
                  <Input
                    value={q.prompt}
                    onChange={(e) => onUpdate(index, { prompt: e.target.value })}
                    placeholder="I am a member of the PTA"
                    className="flex-1"
                  />
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onMove(index, -1)}
                      disabled={index === 0}
                      aria-label="Move question up"
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onMove(index, 1)}
                      disabled={isLast}
                      aria-label="Move question down"
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => onRemove(index)}
                      aria-label="Remove question"
                    >
                      ×
                    </Button>
                  </div>
                </div>

                {isLast ? (
                  <p className="mt-2 pl-6 text-xs text-muted-foreground">
                    Answering this completes the item.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs text-muted-foreground">
                    <span>Continue to the next question only if the answer is</span>
                    <select
                      value={q.continueValue ?? "any"}
                      onChange={(e) =>
                        onUpdate(index, {
                          continueValue:
                            e.target.value === "yes"
                              ? "yes"
                              : e.target.value === "no"
                              ? "no"
                              : null,
                        })
                      }
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                      <option value="any">Always continue</option>
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={onAdd}
      >
        Add question
      </Button>

      {questions.length > 0 && (
        <div className="mt-4 flex items-start gap-3 border-t border-border pt-4">
          <Switch checked={saveResponses} onCheckedChange={onToggleSave} />
          <div>
            <Label className="text-sm font-medium">
              Save participants&apos; answers
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Records each player&apos;s answers next to their anonymous code
              name (no personal info) so the board can review them in Results —
              e.g. to tally budget approvals.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
