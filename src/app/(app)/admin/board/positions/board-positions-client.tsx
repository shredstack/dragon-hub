"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createBoardPosition,
  updateBoardPositionDetails,
  deleteBoardPosition,
  setBoardPositionActive,
  reorderBoardPositions,
  type BoardPositionWithUsage,
} from "@/actions/board-positions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
  Check,
  Users,
} from "lucide-react";

interface Props {
  positions: BoardPositionWithUsage[];
}

export function BoardPositionsClient({ positions }: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function run(fn: () => Promise<unknown>, successMessage: string) {
    try {
      await fn();
      addToast(successMessage, "success");
      refresh();
      return true;
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Something went wrong",
        "destructive"
      );
      return false;
    }
  }

  async function handleAdd() {
    if (!newLabel.trim()) return;
    setBusyId("new");
    const ok = await run(
      () =>
        createBoardPosition({
          label: newLabel,
          description: newDescription,
        }),
      `Added ${newLabel.trim()}`
    );
    setBusyId(null);
    if (ok) {
      setNewLabel("");
      setNewDescription("");
      setAdding(false);
    }
  }

  function startEdit(position: BoardPositionWithUsage) {
    setEditingId(position.id);
    setEditLabel(position.label);
    setEditDescription(position.description ?? "");
  }

  async function handleSaveEdit(id: string) {
    setBusyId(id);
    const ok = await run(
      () =>
        updateBoardPositionDetails(id, {
          label: editLabel,
          description: editDescription,
        }),
      "Position updated"
    );
    setBusyId(null);
    if (ok) setEditingId(null);
  }

  async function handleToggleActive(position: BoardPositionWithUsage) {
    setBusyId(position.id);
    await run(
      () => setBoardPositionActive(position.id, !position.active),
      position.active
        ? `${position.label} hidden from pickers`
        : `${position.label} is active again`
    );
    setBusyId(null);
  }

  async function handleDelete(position: BoardPositionWithUsage) {
    const confirmed = await confirm({
      title: `Delete ${position.label}?`,
      description:
        "This removes the position entirely. Past records filed under it would lose their label.",
      alternative:
        "Turning it off instead keeps history readable and just hides it from pickers.",
      confirmLabel: "Delete position",
      tone: "destructive",
    });
    if (!confirmed) return;

    setBusyId(position.id);
    await run(() => deleteBoardPosition(position.id), `Deleted ${position.label}`);
    closeConfirm();
    setBusyId(null);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= positions.length) return;

    const ordered = [...positions];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

    setBusyId(positions[index].id);
    await run(
      () => reorderBoardPositions(ordered.map((p) => p.id)),
      "Order updated"
    );
    setBusyId(null);
  }

  const activeCount = positions.filter((p) => p.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {activeCount} active {activeCount === 1 ? "position" : "positions"}
          {positions.length > activeCount &&
            ` · ${positions.length - activeCount} turned off`}
        </p>
        {!adding && (
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Add position
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">New position</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Teacher Representative"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                What this position does{" "}
                <span className="font-normal">(optional)</span>
              </label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Represents the teaching staff on the PTA board and brings classroom needs to the group."
                rows={3}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown on the onboarding hub, and used as context when DragonHub
                generates a role guide.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleAdd}
                disabled={!newLabel.trim() || busyId === "new"}
                size="sm"
              >
                {busyId === "new" ? "Adding..." : "Add position"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setNewLabel("");
                  setNewDescription("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {positions.map((position, index) => {
          const isEditing = editingId === position.id;
          const isBusy = busyId === position.id || isPending;

          return (
            <div
              key={position.id}
              className={`rounded-lg border border-border bg-card p-4 ${
                position.active ? "" : "opacity-60"
              }`}
            >
              {isEditing ? (
                <div className="space-y-3">
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    autoFocus
                  />
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="What this position is responsible for"
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(position.id)}
                      disabled={!editLabel.trim() || isBusy}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{position.label}</p>
                      {!position.active && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Off
                        </span>
                      )}
                      {!position.isStandard && (
                        <span className="rounded-full bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-200">
                          Custom
                        </span>
                      )}
                      {position.memberCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {position.memberCount}
                        </span>
                      )}
                    </div>
                    {position.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {position.description}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0 || isBusy}
                      aria-label={`Move ${position.label} up`}
                      className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 1)}
                      disabled={index === positions.length - 1 || isBusy}
                      aria-label={`Move ${position.label} down`}
                      className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => startEdit(position)}
                      disabled={isBusy}
                      aria-label={`Edit ${position.label}`}
                      className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <Switch
                      checked={position.active}
                      onCheckedChange={() => handleToggleActive(position)}
                      disabled={isBusy}
                    />
                    {!position.isStandard && !position.inUse && (
                      <button
                        onClick={() => handleDelete(position)}
                        disabled={isBusy}
                        aria-label={`Delete ${position.label}`}
                        className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmDialog}
    </div>
  );
}
