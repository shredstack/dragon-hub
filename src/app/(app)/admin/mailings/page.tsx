import Link from "next/link";
import { Mail } from "lucide-react";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { auth } from "@/lib/auth";
import { listMailings } from "@/actions/mailings";
import { NewMailingButton } from "./new-mailing-button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Group Mailings" };

export default async function MailingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);
  if (!(await getCurrentSchoolId())) return null;

  const mailings = await listMailings();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Group Mailings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Write one email and send it to many small groups — each classroom,
            each grade, or each committee — with that group&apos;s own details
            filled in and its own address list. DragonHub drafts them; you send
            them from your own inbox, so replies come back to you.
          </p>
        </div>
        <NewMailingButton />
      </div>

      {mailings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No mailings yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start one for room parent onboarding, a committee&apos;s note to its
            classrooms, or a nudge to the teachers whose rooms still need help.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mailings.map((m) => (
            <Link
              key={m.id}
              href={`/admin/mailings/${m.id}`}
              className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-dragon-blue-500"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{m.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {m.groupCount === 0
                      ? "No groups built yet"
                      : `${m.sentCount} of ${m.groupCount} marked sent`}
                    {m.updatedAt && ` · updated ${formatDate(m.updatedAt)}`}
                  </p>
                </div>
                <StatusBadge
                  status={m.status}
                  sent={m.sentCount}
                  total={m.groupCount}
                />
              </div>
              {m.groupCount > 0 && (
                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-dragon-blue-500 transition-all"
                    style={{
                      width: `${Math.round((m.sentCount / m.groupCount) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  sent,
  total,
}: {
  status: "draft" | "sending" | "done";
  sent: number;
  total: number;
}) {
  // Progress outranks the stored status: a mailing whose groups are all ticked
  // off reads as finished even if nobody pressed a button saying so.
  if (total > 0 && sent === total) return <Badge variant="success">Sent</Badge>;
  if (status === "sending" || sent > 0) {
    return <Badge variant="warning">In progress</Badge>;
  }
  return <Badge variant="secondary">Draft</Badge>;
}
