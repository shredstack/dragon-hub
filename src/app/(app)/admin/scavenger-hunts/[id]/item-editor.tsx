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
} from "@/actions/scavenger-hunts";
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
import { useConfirm } from "@/components/ui/confirm-dialog";

interface HuntItem {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  linkUrl: string | null;
  linkLabel: string | null;
  archivedAt: Date | null;
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
                {item.linkUrl && (
                  <Badge variant="secondary" className="mt-2">
                    Links to {item.linkLabel || item.linkUrl}
                  </Badge>
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
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<HuntItemInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.title?.trim()) return;
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
              <Label htmlFor="item-link-url">Link (optional)</Label>
              <Input
                id="item-link-url"
                value={form.linkUrl ?? ""}
                onChange={(e) => set({ linkUrl: e.target.value })}
                placeholder="https://instagram.com/ourpta"
              />
            </div>
            <div>
              <Label htmlFor="item-link-label">Button Text</Label>
              <Input
                id="item-link-label"
                value={form.linkLabel ?? ""}
                onChange={(e) => set({ linkLabel: e.target.value })}
                placeholder="Follow us →"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A link turns the card into a one-tap action — joining the PTA,
            following the Instagram account, opening the volunteer sign-up.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !form.title?.trim()}>
            {isSaving ? "Saving..." : item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
