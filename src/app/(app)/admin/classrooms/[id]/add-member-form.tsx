"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchUsers } from "@/actions/admin";
import { addClassroomMember } from "@/actions/classrooms";
import { USER_ROLES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { UserRole } from "@/types";

interface AddMemberFormProps {
  classroomId: string;
}

export function AddMemberForm({ classroomId }: AddMemberFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string | null;
    email: string;
  } | null>(null);
  const [role, setRole] = useState<UserRole>("volunteer");

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    try {
      const users = await searchUsers(value);
      setResults(users);
    } catch (error) {
      console.error("Search failed:", error);
    }
  }

  function handleSelectUser(user: { id: string; name: string | null; email: string }) {
    setSelectedUser(user);
    setQuery(user.email);
    setResults([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);

    try {
      await addClassroomMember({
        classroomId,
        userId: selectedUser.id,
        role,
      });
      setOpen(false);
      setQuery("");
      setSelectedUser(null);
      setRole("volunteer");
      router.refresh();
    } catch (error) {
      console.error("Failed to add member:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (!v) {
        setQuery("");
        setResults([]);
        setSelectedUser(null);
        setRole("volunteer");
      }
    }}>
      <DialogTrigger asChild>
        <Button>Add Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="userSearch" className="mb-1 block text-sm font-medium">
              Search User
            </label>
            <input
              id="userSearch"
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {results.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-card text-sm">
                {results.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className="w-full px-3 py-2 text-left hover:bg-muted"
                    >
                      {user.name ? `${user.name} (${user.email})` : user.email}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedUser && (
              <p className="mt-1 text-sm text-muted-foreground">
                Selected: {selectedUser.name ?? selectedUser.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(USER_ROLES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading || !selectedUser}>
              {loading ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
