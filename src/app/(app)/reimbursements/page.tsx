import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getCurrentSchoolId,
  isReimbursementOfficer,
} from "@/lib/auth-helpers";
import {
  getMyReimbursements,
  getReimbursementQueue,
  type ReimbursementQueueFilter,
} from "@/actions/reimbursements";
import { QueueTable } from "@/components/reimbursements/queue-table";
import { ReportsPanel } from "@/components/reimbursements/reports-panel";
import { SpendingCardList } from "@/components/reimbursements/spending-card-list";
import { getSpendingCards } from "@/actions/spending-cards";
import { getReimbursementPolicy } from "@/lib/reimbursement-policy";
import { getSchoolCurrentYear, schoolYearDateRange } from "@/lib/school-year";
import { Button } from "@/components/ui/button";
import { CreditCard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { privateMetadata } from "@/lib/page-metadata";

export const metadata = privateMetadata("Reimbursements");

const QUEUE_FILTERS: { value: ReimbursementQueueFilter; label: string }[] = [
  { value: "open", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

interface PageProps {
  searchParams: Promise<{ tab?: string; status?: string }>;
}

/**
 * The treasurer's home, and everyone else's own history.
 *
 * The tab and the queue filter both live in the URL rather than in client
 * state, which keeps the whole page a server component and makes a filtered
 * queue a link a board member can send to a co-officer.
 */
export default async function ReimbursementsPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const isOfficer = await isReimbursementOfficer(userId, schoolId);
  const policy = await getReimbursementPolicy(schoolId);
  const params = await searchParams;

  // "cards" is open to everyone where the policy allows them; the other two
  // extra tabs are the officers'.
  const tab =
    params.tab === "cards" && policy.spendingCardsEnabled
      ? "cards"
      : !isOfficer
        ? "mine"
        : params.tab === "mine" || params.tab === "reports"
          ? params.tab
          : "queue";
  const filter = (QUEUE_FILTERS.find((f) => f.value === params.status)?.value ??
    "open") as ReimbursementQueueFilter;

  const [mine, queue, cards, schoolYear] = await Promise.all([
    tab === "mine" ? getMyReimbursements() : Promise.resolve([]),
    tab === "queue" && isOfficer
      ? getReimbursementQueue(filter)
      : Promise.resolve([]),
    tab === "cards"
      ? getSpendingCards({ scope: isOfficer ? "all" : "mine" })
      : Promise.resolve([]),
    getSchoolCurrentYear(schoolId),
  ]);
  const yearRange = schoolYearDateRange(schoolYear);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reimbursements</h1>
          <p className="text-muted-foreground">
            Check requests for money spent on the school&apos;s behalf.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {policy.spendingCardsEnabled && tab === "cards" && (
            <Link href="/reimbursements/cards/new">
              <Button variant="outline">
                <CreditCard className="h-4 w-4" />
                Request a card
              </Button>
            </Link>
          )}
          <Link href="/reimbursements/new">
            <Button>
              <Plus className="h-4 w-4" />
              New request
            </Button>
          </Link>
        </div>
      </div>

      {(isOfficer || policy.spendingCardsEnabled) && (
        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {isOfficer && (
            <>
              <TabLink href="/reimbursements?tab=queue" active={tab === "queue"}>
                Review queue
              </TabLink>
              <TabLink href="/reimbursements?tab=mine" active={tab === "mine"}>
                My requests
              </TabLink>
            </>
          )}
          {policy.spendingCardsEnabled && (
            <TabLink href="/reimbursements?tab=cards" active={tab === "cards"}>
              Spending cards
            </TabLink>
          )}
          {isOfficer && (
            <TabLink
              href="/reimbursements?tab=reports"
              active={tab === "reports"}
            >
              Reports
            </TabLink>
          )}
        </div>
      )}

      {tab === "cards" ? (
        <SpendingCardList
          cards={cards}
          showRequester={isOfficer}
          emptyTitle="No spending cards"
          emptyDescription="Rather than fronting your own money, ask the treasurer to load a card in advance. It still needs receipts."
        />
      ) : tab === "reports" ? (
        <ReportsPanel
          salesTaxRefundTracking={policy.salesTaxRefundTracking}
          defaultFrom={yearRange.start}
          defaultTo={yearRange.end}
        />
      ) : tab === "queue" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUEUE_FILTERS.map((option) => (
              <Link
                key={option.value}
                href={`/reimbursements?tab=queue&status=${option.value}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  filter === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
          <QueueTable
            requests={queue}
            showSubmitter
            emptyTitle="Nothing here"
            emptyDescription="No requests match this filter right now."
          />
        </div>
      ) : (
        <QueueTable
          requests={mine}
          emptyTitle="No requests yet"
          emptyDescription="When you spend your own money on something for the school, file it here and the treasurer writes you a check."
        />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
