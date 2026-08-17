"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createMailing } from "@/actions/mailings";

/** Common starting points, so the first screen isn't an empty box. */
const SUGGESTIONS = [
  "Room parent onboarding",
  "Meet the Masters — classroom intro",
  "Classrooms still needing volunteers",
  "Halloween party details",
];

export function NewMailingButton() {
  const router = useRouter();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const create = () => {
    const clean = title.trim();
    if (!clean) return;
    startTransition(async () => {
      try {
        const id = await createMailing(clean);
        setOpen(false);
        setTitle("");
        router.push(`/admin/mailings/${id}`);
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't create that.",
          "destructive"
        );
      }
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Plus className="h-4 w-4" />
        New mailing
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group mailing</DialogTitle>
            <DialogDescription>
              Name it for yourself — this is never shown to anyone who receives
              the email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="mailing-title">Name</Label>
              <Input
                id="mailing-title"
                value={title}
                autoFocus
                placeholder="Room parent onboarding"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTitle(s)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-dragon-blue-500 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={pending || !title.trim()}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
