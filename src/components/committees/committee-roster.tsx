"use client";

import { useRouter } from "next/navigation";
import { promoteWaitlistedMember, removeCommitteeMember } from "@/actions/committees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export interface CommitteeRosterProps {
  members: Array<{
    id: string;
    userId: string | null;
    name: string;
    email: string;
    phone: string | null;
    role: "chair" | "member";
    willingToChair: boolean;
    notes: string | null;
  }>;
  waitlist: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    position: number;
    willingToChair: boolean;
  }>;
  /** Chairs and board see remove controls and the waitlist; members don't. */
  canManage: boolean;
}

/**
 * The member-facing roster. Everyone on the committee sees who else is on it
 * and how to reach them — that's the point of a committee — but only chairs get
 * the remove control and the waitlist.
 */
export function CommitteeRoster({
  members,
  waitlist,
  canManage,
}: CommitteeRosterProps) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const { addToast } = useToast();

  const handleRemove = async (member: { id: string; name: string }) => {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description:
        "They lose access to this committee's message board and tasks. If anyone is waiting, the next person is promoted automatically.",
      confirmLabel: "Remove",
      tone: "destructive",
    });
    if (!ok) return;

    try {
      await removeCommitteeMember(member.id);
      addToast(`${member.name} removed.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't remove them.", "destructive");
    }
  };

  const handlePromote = async (entry: { id: string; name: string }) => {
    try {
      await promoteWaitlistedMember(entry.id);
      addToast(`${entry.name} is on the committee.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't promote them.", "destructive");
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {members.length} member{members.length === 1 ? "" : "s"}
        </h3>

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nobody has joined yet.
          </p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {m.name}
                      {m.willingToChair && m.role !== "chair" && (
                        <span title="Willing to chair"> ⭐</span>
                      )}
                    </p>
                    <a
                      href={`mailto:${m.email}`}
                      className="block break-all text-sm text-muted-foreground hover:underline"
                    >
                      {m.email}
                    </a>
                    {m.phone && (
                      <a
                        href={`tel:${m.phone}`}
                        className="block text-sm text-muted-foreground hover:underline"
                      >
                        {m.phone}
                      </a>
                    )}
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(m)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {m.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{m.notes}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {m.role === "chair" && <Badge variant="success">Chair</Badge>}
                  {!m.userId && (
                    <Badge variant="outline">Hasn&apos;t signed in yet</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {canManage && waitlist.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Waitlist ({waitlist.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              A spot opening promotes #1 automatically and emails them.
            </p>
          </div>

          <div className="space-y-3">
            {waitlist.map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{w.position} · {w.name}
                      {w.willingToChair && (
                        <span title="Willing to chair"> ⭐</span>
                      )}
                    </p>
                    <p className="break-all text-sm text-muted-foreground">
                      {w.email}
                    </p>
                    {w.phone && (
                      <p className="text-sm text-muted-foreground">{w.phone}</p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => handlePromote(w)}>
                    Give them a spot
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {confirmDialog}
    </div>
  );
}
