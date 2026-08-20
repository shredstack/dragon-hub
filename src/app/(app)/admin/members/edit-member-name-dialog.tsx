"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateMemberName } from "@/actions/school-membership";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditMemberNameDialogProps {
  schoolId: string;
  membershipId: string;
  /** Current name on the account, or null if they never set one. */
  currentName: string | null;
  /** Shown as the subtitle — it's the only thing identifying a nameless row. */
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Writes a display name onto another member's account.
 *
 * Name only. The rest of a profile — phone, email, photo — stays the member's
 * own; see `updateMemberName` for why.
 */
export function EditMemberNameDialog({
  schoolId,
  membershipId,
  currentName,
  email,
  open,
  onOpenChange,
}: EditMemberNameDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(currentName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening after a cancel — or after someone else's edit landed — should show
  // what the account says now, not what was typed and abandoned last time.
  useEffect(() => {
    if (open) {
      setName(currentName ?? "");
      setError(null);
    }
  }, [open, currentName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      await updateMemberName(schoolId, membershipId, name);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
            <DialogDescription>
              {currentName
                ? `Update the name shown for ${email} across DragonHub.`
                : `${email} hasn't set a name yet. Add one so they show up as a person in the directory, rosters and exports.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              maxLength={100}
              autoFocus
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              They can change this themselves from their profile.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
