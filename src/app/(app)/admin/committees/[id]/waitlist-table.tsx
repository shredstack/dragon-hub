"use client";

import { useRouter } from "next/navigation";
import { promoteWaitlistedMember, removeCommitteeMember } from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export interface WaitlistEntry {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  position: number;
  willingToChair: boolean;
  notes: string | null;
}

/**
 * The waitlist in order, with a promote-out-of-order button.
 *
 * Vacancies fill themselves — this table exists for the case automation can't
 * cover: a chair-shaped volunteer sitting at position 4 who shouldn't have to
 * wait for three people to drop.
 */
export function WaitlistTable({ entries }: { entries: WaitlistEntry[] }) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const { addToast } = useToast();

  if (entries.length === 0) return null;

  const handlePromote = async (entry: WaitlistEntry) => {
    const ok = await confirm({
      title: `Give ${entry.name} a spot?`,
      description:
        entry.position > 1
          ? `They're #${entry.position} in line. The ${entry.position - 1} ${
              entry.position === 2 ? "person" : "people"
            } ahead of them keep their order.`
          : "They're next in line anyway.",
      confirmLabel: "Promote",
    });
    if (!ok) return;

    try {
      await promoteWaitlistedMember(entry.id);
      addToast(`${entry.name} is on the committee.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't promote them. Please try again.", "destructive");
    }
  };

  const handleRemove = async (entry: WaitlistEntry) => {
    const ok = await confirm({
      title: `Take ${entry.name} off the waitlist?`,
      description: "They won't be notified. Everyone behind them moves up.",
      confirmLabel: "Remove",
      tone: "destructive",
    });
    if (!ok) return;

    try {
      await removeCommitteeMember(entry.id);
      addToast(`${entry.name} removed from the waitlist.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't remove them.", "destructive");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          Waitlist{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({entries.length})
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          A spot opening promotes #1 automatically and emails them. Promote out of
          order only when you have a reason to.
        </p>
      </div>

      {/* Mobile card view */}
      <div className="space-y-3 md:hidden">
        {entries.map((e) => (
          <div key={e.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  #{e.position} · {e.name}
                  {e.willingToChair && <span title="Willing to chair"> ⭐</span>}
                </p>
                <p className="break-all text-sm text-muted-foreground">{e.email}</p>
                {e.phone && (
                  <p className="text-sm text-muted-foreground">{e.phone}</p>
                )}
              </div>
            </div>
            {e.notes && (
              <p className="mt-2 text-sm text-muted-foreground">{e.notes}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => handlePromote(e)}>
                Give them a spot
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleRemove(e)}>
                Remove
              </Button>
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
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">{e.position}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{e.name}</span>
                    {e.willingToChair && (
                      <Badge variant="warning" className="ml-2">
                        ⭐ Would chair
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="break-all">{e.email}</div>
                    {e.phone && <div>{e.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => handlePromote(e)}>
                        Give them a spot
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemove(e)}
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

      {confirmDialog}
    </div>
  );
}
