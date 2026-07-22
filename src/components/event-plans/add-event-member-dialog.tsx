"use client";

import { useState } from "react";
import { addEventPlanMember } from "@/actions/event-plans";
import {
  inviteEventPlanMemberByEmail,
  searchEventPlanCandidates,
} from "@/actions/event-plan-invites";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail, UserPlus } from "lucide-react";
import type { EventPlanMemberRole } from "@/types";

interface AddEventMemberDialogProps {
  eventPlanId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Candidate {
  id: string;
  name: string | null;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adding someone to an event, whether or not they use Dragon Hub yet.
 *
 * One search box handles both: typing a name finds people already at the
 * school, and typing an address that matches nobody offers to invite it. The
 * two are deliberately not separate tabs — a lead adding "Jamie" shouldn't have
 * to know in advance whether Jamie has an account.
 */
export function AddEventMemberDialog({
  eventPlanId,
  open,
  onOpenChange,
}: AddEventMemberDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Candidate | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [role, setRole] = useState<EventPlanMemberRole>("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const queryIsEmail = EMAIL_PATTERN.test(trimmedQuery);
  // Offer the invite path once a search has come back empty, so it doesn't
  // flash while someone is still typing a name that will match.
  const canInvite =
    queryIsEmail &&
    !selectedUser &&
    !results.some((r) => r.email.toLowerCase() === trimmedQuery.toLowerCase());

  function reset() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setSelectedUser(null);
    setInviteName("");
    setRole("member");
    setError(null);
    setConfirmation(null);
  }

  async function handleSearch(value: string) {
    setQuery(value);
    setSelectedUser(null);
    setError(null);
    if (value.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const users = await searchEventPlanCandidates(eventPlanId, value);
    setResults(users);
    setSearched(true);
  }

  async function handleAdd() {
    if (!selectedUser) return;
    setLoading(true);
    setError(null);
    try {
      await addEventPlanMember(eventPlanId, selectedUser.id, role);
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that person.");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    setLoading(true);
    setError(null);
    try {
      const result = await inviteEventPlanMemberByEmail(eventPlanId, {
        email: trimmedQuery,
        name: inviteName,
        role,
      });
      if (result.outcome === "added") {
        // They turned out to have an account already — say so rather than
        // implying an email is on its way that never went out.
        setConfirmation(`${result.name} was added to this event.`);
      } else {
        setConfirmation(`Invitation sent to ${result.email}.`);
      }
      setQuery("");
      setResults([]);
      setSearched(false);
      setInviteName("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't send that invitation."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Search by name, or enter an email address
            </label>
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Name or email..."
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

            {searched && results.length === 0 && !queryIsEmail && (
              <p className="mt-2 text-xs text-muted-foreground">
                Nobody at this school matches. Enter their email address to
                invite them.
              </p>
            )}
          </div>

          {canInvite && (
            <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
              <p className="mb-3 flex items-start gap-2 text-sm">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <strong className="break-all">{trimmedQuery}</strong> is
                  {results.length > 0 ? " not" : "n't"} in the member directory.
                  We&apos;ll email them an invitation — accepting it gets them
                  into Dragon Hub and onto this event.
                </span>
              </p>
              <label className="mb-1 block text-xs font-medium">
                Their name (optional)
              </label>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="So the email can greet them by name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          {(selectedUser || canInvite) && (
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
              <p className="mt-1 text-xs text-muted-foreground">
                Leads can edit the plan and manage its members.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}

          {confirmation && (
            <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              {confirmation}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {confirmation ? "Done" : "Cancel"}
            </Button>
            {canInvite ? (
              <Button onClick={handleInvite} disabled={loading}>
                <Mail className="h-4 w-4" />
                {loading ? "Sending..." : "Send Invitation"}
              </Button>
            ) : (
              <Button onClick={handleAdd} disabled={!selectedUser || loading}>
                <UserPlus className="h-4 w-4" />
                {loading ? "Adding..." : "Add Member"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
