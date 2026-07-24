"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createImportantLink,
  updateImportantLink,
  deleteImportantLink,
  setImportantLinkActive,
  reorderImportantLinks,
} from "@/actions/important-links";
import {
  defaultOpenModeFor,
  linkHostname,
  normalizeLinkUrl,
  SUGGESTED_LINK_EMOJI,
  type ImportantLink,
  type LinkOpenMode,
} from "@/lib/important-links-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  LinkOpenModeBadge,
  LinkOpenModeField,
} from "@/components/ui/link-open-mode-field";
import {
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

interface Props {
  links: ImportantLink[];
}

interface Draft {
  title: string;
  url: string;
  description: string;
  iconEmoji: string;
  openMode: LinkOpenMode;
}

const emptyDraft: Draft = {
  title: "",
  url: "",
  description: "",
  iconEmoji: "🔗",
  openMode: "new_tab",
};

export function ImportantLinksClient({ links }: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    setBusyId("new");
    const ok = await run(
      () => createImportantLink(draft),
      `Added ${draft.title.trim()}`
    );
    setBusyId(null);
    if (ok) {
      setDraft(emptyDraft);
      setAdding(false);
    }
  }

  function startEdit(link: ImportantLink) {
    setAdding(false);
    setEditingId(link.id);
    setDraft({
      title: link.title,
      url: link.url,
      description: link.description ?? "",
      iconEmoji: link.iconEmoji ?? "🔗",
      openMode: link.openMode,
    });
  }

  async function handleSaveEdit(id: string) {
    setBusyId(id);
    const ok = await run(() => updateImportantLink(id, draft), "Link updated");
    setBusyId(null);
    if (ok) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
  }

  async function handleToggleActive(link: ImportantLink) {
    setBusyId(link.id);
    await run(
      () => setImportantLinkActive(link.id, !link.active),
      link.active
        ? `${link.title} hidden from the dashboard`
        : `${link.title} is back on the dashboard`
    );
    setBusyId(null);
  }

  async function handleDelete(link: ImportantLink) {
    const confirmed = await confirm({
      title: `Delete ${link.title}?`,
      description: "This removes the link from the dashboard for good.",
      alternative:
        "Turning it off instead keeps it here for next year — useful for a store or sign-up that only runs part of the year.",
      confirmLabel: "Delete link",
      tone: "destructive",
    });
    if (!confirmed) return;

    setBusyId(link.id);
    await run(() => deleteImportantLink(link.id), `Deleted ${link.title}`);
    closeConfirm();
    setBusyId(null);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;

    const ordered = [...links];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

    setBusyId(links[index].id);
    await run(
      () => reorderImportantLinks(ordered.map((l) => l.id)),
      "Order updated"
    );
    setBusyId(null);
  }

  const activeCount = links.filter((l) => l.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {activeCount} {activeCount === 1 ? "link" : "links"} on the dashboard
          {links.length > activeCount &&
            ` · ${links.length - activeCount} turned off`}
        </p>
        {!adding && (
          <Button
            onClick={() => {
              setEditingId(null);
              setDraft(emptyDraft);
              setAdding(true);
            }}
            size="sm"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add link
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">New link</h2>
          <LinkFields draft={draft} onChange={setDraft} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={handleAdd}
              disabled={!draft.title.trim() || !draft.url.trim() || busyId === "new"}
              size="sm"
            >
              {busyId === "new" ? "Adding..." : "Add link"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(false);
                setDraft(emptyDraft);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {links.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">No links yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with the two or three you send parents by email most often.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {links.map((link, index) => {
          const isEditing = editingId === link.id;
          const isBusy = busyId === link.id || isPending;

          return (
            <div
              key={link.id}
              className={`rounded-lg border border-border bg-card p-4 ${
                link.active ? "" : "opacity-60"
              }`}
            >
              {isEditing ? (
                <div>
                  <LinkFields draft={draft} onChange={setDraft} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(link.id)}
                      disabled={!draft.title.trim() || !draft.url.trim() || isBusy}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(emptyDraft);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0 || isBusy}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label={`Move ${link.title} up`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === links.length - 1 || isBusy}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label={`Move ${link.title} down`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl"
                    aria-hidden
                  >
                    {link.iconEmoji || "🔗"}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{link.title}</p>
                      <LinkOpenModeBadge mode={link.openMode} />
                    </div>
                    {link.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {link.description}
                      </p>
                    )}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-dragon-blue-500 hover:underline"
                    >
                      {linkHostname(link.url)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <label
                      className="sr-only"
                      htmlFor={`link-active-${link.id}`}
                    >
                      Show {link.title} on the dashboard
                    </label>
                    <Switch
                      id={`link-active-${link.id}`}
                      checked={link.active}
                      onCheckedChange={() => handleToggleActive(link)}
                      disabled={isBusy}
                    />
                    <button
                      type="button"
                      onClick={() => startEdit(link)}
                      disabled={isBusy}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Edit ${link.title}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(link)}
                      disabled={isBusy}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${link.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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

/**
 * The add and edit forms are the same fields, so they're the same component —
 * a board member who learns the form once has learned both.
 */
function LinkFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  const normalized = normalizeLinkUrl(draft.url);
  const urlLooksWrong = draft.url.trim().length > 0 && !normalized;

  function set(patch: Partial<Draft>) {
    onChange({ ...draft, ...patch });
  }

  /**
   * Pasting a URL picks the open mode for you, since most sites refuse to be
   * shown inside another page and a board member has no way to know which.
   * It's a default, not a lock — the toggle is right there.
   */
  function handleUrlChange(url: string) {
    set({ url, openMode: defaultOpenModeFor(url) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Name
        </label>
        <Input
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Volunteer application"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Web address
        </label>
        <Input
          value={draft.url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://district.org/volunteer"
          inputMode="url"
        />
        {urlLooksWrong && (
          <p className="mt-1 text-xs text-destructive">
            That doesn&apos;t look like a web address yet.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Why someone would click it{" "}
          <span className="font-normal">(optional)</span>
        </label>
        <Textarea
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Required once a year before you can volunteer in a classroom. Takes about 10 minutes."
          rows={2}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          One line. This is what makes the card worth reading instead of just a
          name on a list.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Icon
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_LINK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => set({ iconEmoji: emoji })}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors ${
                draft.iconEmoji === emoji
                  ? "bg-dragon-gold-400/30 ring-2 ring-dragon-gold-400"
                  : "bg-muted hover:bg-muted/70"
              }`}
              aria-label={`Use ${emoji}`}
              aria-pressed={draft.iconEmoji === emoji}
            >
              {emoji}
            </button>
          ))}
          <Input
            value={draft.iconEmoji}
            onChange={(e) => set({ iconEmoji: e.target.value })}
            className="h-9 w-16 text-center text-lg"
            aria-label="Or type an emoji"
          />
        </div>
      </div>

      <LinkOpenModeField
        value={draft.openMode}
        onChange={(openMode) => set({ openMode })}
      />
    </div>
  );
}
