"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { useToast } from "@/components/ui/toast";
import { ClassroomIcon } from "@/components/classrooms/classroom-icon";
import { setClassroomEmoji } from "@/actions/classrooms";
import { normalizeEmoji } from "@/lib/emoji";

/**
 * The rooms a school has, in the vocabulary a room actually uses for itself —
 * its animal, its grade, the thing on its door — rather than the general
 * palette, which is built for events.
 */
const CLASSROOM_EMOJI = [
  "🍎", "📚", "🐉", "🦊", "🐼", "🦁", "🐢", "🦉", "🐝", "🦋",
  "🌻", "🌈", "🚀", "⭐", "🎨", "🎵", "🔬", "🧩", "🏀", "🐧",
];

interface ClassroomEmojiButtonProps {
  classroomId: string;
  classroomName: string;
  iconEmoji: string | null;
  /**
   * Whether this reader is in the room (or on the board). The server decides
   * this again — this only decides whether a pencil appears.
   */
  canEdit: boolean;
}

/**
 * The room's tile on its own page, and — for anyone in the room — the way to
 * change it.
 *
 * Editing lives here rather than on the `/classrooms` card because the card is
 * one big link, and a button inside a link is a coin flip about which one a tap
 * lands on.
 */
export function ClassroomEmojiButton({
  classroomId,
  classroomName,
  iconEmoji,
  canEdit,
}: ClassroomEmojiButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(iconEmoji ?? "");
  const [isSaving, startSaving] = useTransition();

  if (!canEdit) {
    return <ClassroomIcon iconEmoji={iconEmoji} className="h-12 w-12 text-2xl" />;
  }

  function save(value: string) {
    startSaving(async () => {
      try {
        await setClassroomEmoji(classroomId, value);
        addToast(
          value ? "Classroom emoji updated" : "Classroom emoji removed",
          "success"
        );
        setOpen(false);
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Something went wrong",
          "destructive"
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(iconEmoji ?? "");
          setOpen(true);
        }}
        className="group hover:border-dragon-blue-400 relative rounded-md border border-transparent transition-colors"
        aria-label={`Change the emoji for ${classroomName}`}
      >
        <ClassroomIcon iconEmoji={iconEmoji} className="h-12 w-12 text-2xl" />
        <span className="bg-card border-border text-muted-foreground absolute -right-1.5 -bottom-1.5 rounded-full border p-0.5">
          <Pencil className="h-3 w-3" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Scrolls because the picker's "Browse all" panel opens inside it —
            on a phone the dialog would otherwise grow past both edges of the
            screen, taking the Save button with it. */}
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Classroom emoji</DialogTitle>
            <DialogDescription>
              Give {classroomName} an emoji so it stands out on the Classrooms
              page. Everyone in the room sees it.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <EmojiPicker
              label={null}
              value={draft}
              onChange={setDraft}
              suggestions={CLASSROOM_EMOJI}
              fallback={<ClassroomIcon className="h-12 w-12 bg-transparent" />}
            />
          </div>

          <DialogFooter>
            {iconEmoji && (
              <Button
                type="button"
                variant="outline"
                onClick={() => save("")}
                disabled={isSaving}
                className="sm:mr-auto"
              >
                Remove
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => save(draft)}
              // An unusable value would be stored as "no emoji", which is a
              // confusing way to find out the paste didn't take.
              disabled={isSaving || (!!draft.trim() && !normalizeEmoji(draft))}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
