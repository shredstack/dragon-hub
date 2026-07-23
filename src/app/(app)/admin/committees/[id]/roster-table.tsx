"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCommitteeMemberManually,
  exportCommitteeRoster,
  removeCommitteeMember,
  updateCommitteeMemberRole,
} from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/csv";

export interface RosterMember {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: "chair" | "member";
  willingToChair: boolean;
  notes: string | null;
}

interface Props {
  committeeId: string;
  committeeName: string;
  members: RosterMember[];
  /** Board only — a chair can remove people but not appoint their successor. */
  canPromoteToChair: boolean;
  /** True when a manual add would exceed a configured cap. */
  isCapped: boolean;
  seatsRemaining: number | null;
}

export function RosterTable({
  committeeId,
  committeeName,
  members,
  canPromoteToChair,
  isCapped,
  seatsRemaining,
}: Props) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const { addToast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const wouldExceedCap = isCapped && seatsRemaining !== null && seatsRemaining <= 0;

  const handleAdd = async () => {
    setError(null);
    if (wouldExceedCap) {
      const ok = await confirm({
        title: "This committee is already full",
        description:
          "Adding someone by hand goes past the limit you set. The extra seat stays until you remove someone.",
        confirmLabel: "Add anyway",
      });
      if (!ok) return;
    }

    setIsSaving(true);
    try {
      const result = await addCommitteeMemberManually(committeeId, form);
      if (!result.success) {
        setError(result.error ?? "Couldn't add that person.");
        return;
      }
      setForm({ name: "", email: "", phone: "", notes: "" });
      setIsAdding(false);
      addToast("Added to the committee.", "success");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that person.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (member: RosterMember) => {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description:
        "They lose access to this committee's message board and tasks. If anyone is on the waitlist, the next person is promoted automatically.",
      confirmLabel: "Remove",
      tone: "destructive",
    });
    if (!ok) return;

    try {
      await removeCommitteeMember(member.id);
      addToast(`${member.name} removed.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't remove them. Please try again.", "destructive");
    }
  };

  const handleRoleChange = async (
    member: RosterMember,
    role: "chair" | "member"
  ) => {
    try {
      await updateCommitteeMemberRole(member.id, role);
      addToast(
        role === "chair" ? `${member.name} is now a chair.` : `${member.name} is now a member.`,
        "success"
      );
      router.refresh();
    } catch {
      addToast("Couldn't change their role.", "destructive");
    }
  };

  const handleExport = async () => {
    try {
      const csv = await exportCommitteeRoster(committeeId);
      downloadCsv(`${committeeName.replace(/\s+/g, "-")}-roster.csv`, csv);
    } catch {
      addToast("Couldn't export the roster.", "destructive");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Roster{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({members.length})
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setIsAdding(true)}>
            Add by hand
          </Button>
        </div>
      </div>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nobody has joined yet. Share the join link below, or add someone from a
          paper form.
        </p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {members.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {m.name}
                      {m.willingToChair && (
                        <span title="Willing to chair"> ⭐</span>
                      )}
                    </p>
                    <p className="break-all text-sm text-muted-foreground">
                      {m.email}
                    </p>
                    {m.phone && (
                      <p className="text-sm text-muted-foreground">{m.phone}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(m)}
                  >
                    Remove
                  </Button>
                </div>
                {m.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{m.notes}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant={m.role === "chair" ? "success" : "secondary"}>
                    {m.role === "chair" ? "Chair" : "Member"}
                  </Badge>
                  {!m.userId && (
                    <Badge variant="outline">Hasn&apos;t signed in yet</Badge>
                  )}
                  {canPromoteToChair && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleRoleChange(m, m.role === "chair" ? "member" : "chair")
                      }
                    >
                      {m.role === "chair" ? "Make member" : "Make chair"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{m.name}</span>
                        {m.willingToChair && (
                          <span title="Willing to chair"> ⭐</span>
                        )}
                        {!m.userId && (
                          <Badge variant="outline" className="ml-2">
                            No account yet
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="break-all">{m.email}</div>
                        {m.phone && <div>{m.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={m.role === "chair" ? "success" : "secondary"}
                        >
                          {m.role === "chair" ? "Chair" : "Member"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.notes ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {canPromoteToChair && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleRoleChange(
                                  m,
                                  m.role === "chair" ? "member" : "chair"
                                )
                              }
                            >
                              {m.role === "chair" ? "Make member" : "Make chair"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemove(m)}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add someone by hand</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For a name off a paper sign-up sheet. They&apos;ll get access as soon
              as they sign in with this email.
            </p>
            <div>
              <Label htmlFor="manual-name">Full name *</Label>
              <Input
                id="manual-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="manual-email">Email *</Label>
              <Input
                id="manual-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <Label htmlFor="manual-phone">Phone</Label>
              <Input
                id="manual-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <Label htmlFor="manual-notes">Notes</Label>
              <Textarea
                id="manual-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
            {wouldExceedCap && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                This committee is at its limit. Adding someone here goes past it.
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isSaving || !form.name.trim() || !form.email.trim()}
            >
              {isSaving ? "Adding…" : "Add to committee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
