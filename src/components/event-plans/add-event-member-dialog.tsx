"use client";

import { useState } from "react";
import { addEventPlanMember } from "@/actions/event-plans";
import { searchUsers } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EventPlanMemberRole } from "@/types";

interface AddEventMemberDialogProps {
  eventPlanId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingMemberIds: string[];
}

export function AddEventMemberDialog({
  eventPlanId,
  open,
  onOpenChange,
  existingMemberIds,
}: AddEventMemberDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string | null;
    email: string;
  } | null>(null);
  const [role, setRole] = useState<EventPlanMemberRole>("member");
  const [loading, setLoading] = useState(false);

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    const users = await searchUsers(value);
    setResults(users.filter((u) => !existingMemberIds.includes(u.id)));
  }

  async function handleAdd() {
    if (!selectedUser) return;
    setLoading(true);
    await addEventPlanMember(eventPlanId, selectedUser.id, role);
    setLoading(false);
    setSelectedUser(null);
    setQuery("");
    setResults([]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Search Users
            </label>
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {results.length > 0 && !selectedUser && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-card">
                {results.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user);
                      setQuery(user.name || user.email);
                      setResults([]);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <p className="font-medium">{user.name || user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedUser && (
            <div>
              <label className="mb-1 block text-sm font-medium">Role</label>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as EventPlanMemberRole)
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="lead">Lead</option>
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!selectedUser || loading}>
              {loading ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
