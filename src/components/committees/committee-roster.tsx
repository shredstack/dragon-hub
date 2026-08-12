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
    /** The room this person covers, for an `all_classrooms` committee. */
    classroomId?: string | null;
    classroomName?: string | null;
  }>;
  waitlist: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    position: number;
    willingToChair: boolean;
    classroomId?: string | null;
    classroomName?: string | null;
  }>;
  /** Chairs and board see remove controls and the waitlist; members don't. */
  canManage: boolean;
  /**
   * `members` holds only the rooms this person covers, not the whole committee.
   * Said out loud below, so a 40-person committee doesn't read as a 2-person
   * one. See the scoping comment in `getCommitteeDetail`.
   */
  scopedByClassroom?: boolean;
  /**
   * Seats filled per room, for everyone regardless of scoping — "is Room 8
   * covered?" is the question the whole committee needs answered, and it needs
   * no names to answer it.
   */
  classroomCoverage?: Array<{
    classroomId: string;
    classroomName: string;
    filled: number;
    target: number | null;
  }>;
}

/**
 * The member-facing roster.
 *
 * For a school-wide committee this is one list: everyone sees everyone, which
 * is the point of a committee. For an `all_classrooms` committee (Meet the
 * Masters) it is one section per room, and a plain member is shown only their
 * own rooms — twenty rooms' worth of parents are twenty separate pairs who will
 * never meet, and the coverage table below carries the cross-room information
 * that actually matters without the contact details that don't.
 */
export function CommitteeRoster({
  members,
  waitlist,
  canManage,
  scopedByClassroom = false,
  classroomCoverage = [],
}: CommitteeRosterProps) {
  const router = useRouter();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
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
    } finally {
      closeConfirm();
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

  const memberCard = (m: CommitteeRosterProps["members"][number]) => (
    <div key={m.id} className="rounded-lg border border-border bg-card p-4">
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
          <Button size="sm" variant="ghost" onClick={() => handleRemove(m)}>
            Remove
          </Button>
        )}
      </div>
      {m.notes && (
        <p className="mt-2 text-sm text-muted-foreground">{m.notes}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {m.role === "chair" && <Badge variant="success">Chair</Badge>}
        {!m.userId && <Badge variant="outline">Hasn&apos;t signed in yet</Badge>}
      </div>
    </div>
  );

  // Grouped only when the rows actually name rooms. A school-wide committee
  // leaves `classroomName` null throughout and stays one flat list.
  const roomGroups = [
    ...members
      .reduce((groups, m) => {
        const key = m.classroomName ?? "";
        const group = groups.get(key) ?? { room: m.classroomName, list: [] };
        group.list.push(m);
        groups.set(key, group);
        return groups;
      }, new Map<string, { room: string | null | undefined; list: typeof members }>())
      .values(),
  ].sort((a, b) =>
    (a.room ?? "").localeCompare(b.room ?? "", undefined, { numeric: true })
  );

  const grouped = roomGroups.some((g) => g.room);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            {members.length} member{members.length === 1 ? "" : "s"}
            {scopedByClassroom && " in your classroom(s)"}
          </h3>
          {scopedByClassroom && (
            <p className="text-xs text-muted-foreground">
              Other classrooms have their own volunteers — the coverage list
              below shows which rooms still need someone.
            </p>
          )}
        </div>

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {scopedByClassroom
              ? "Nobody has joined for your classroom yet."
              : "Nobody has joined yet."}
          </p>
        ) : grouped ? (
          <div className="space-y-5">
            {roomGroups.map((group) => (
              <div key={group.room ?? "unassigned"} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {group.room ?? "No classroom"}
                  </span>
                  <Badge variant="secondary">{group.list.length}</Badge>
                </div>
                <div className="space-y-3">{group.list.map(memberCard)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">{members.map(memberCard)}</div>
        )}
      </section>

      {classroomCoverage.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Coverage by classroom
            </h3>
            <p className="text-xs text-muted-foreground">
              How many volunteers each room has. Everyone on the committee sees
              this, so an uncovered room is visible to whoever can go fill it.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {classroomCoverage.map((room) => {
              const short = room.target !== null && room.filled < room.target;
              return (
                <div
                  key={room.classroomId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <span className="truncate">{room.classroomName}</span>
                  <Badge variant={short ? "outline" : "success"}>
                    {room.target !== null
                      ? `${room.filled}/${room.target}`
                      : String(room.filled)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
                    {w.classroomName && (
                      <p className="text-xs text-muted-foreground">
                        {w.classroomName}
                      </p>
                    )}
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
