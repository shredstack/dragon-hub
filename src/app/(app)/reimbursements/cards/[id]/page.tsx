import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { getSpendingCard } from "@/actions/spending-cards";
import { CardStatusBadge } from "@/components/reimbursements/spending-card-list";
import { SpendingCardPanel } from "@/components/reimbursements/spending-card-panel";
import { formatCurrency } from "@/lib/utils";
import { formatDateTimeInTimeZone } from "@/lib/time-zone";
import { parseMoney } from "@/lib/reimbursements-shared";
import { privateMetadata } from "@/lib/page-metadata";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata = privateMetadata("Spending card request");

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SpendingCardPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Null covers "doesn't exist", "another school's", "not yours", and "this
  // state doesn't run cards" — all of which should look the same from outside.
  const card = await getSpendingCard(id);
  if (!card) notFound();

  const timeZone = await getSchoolTimeZone(schoolId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/reimbursements?tab=cards"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to spending cards
      </Link>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardStatusBadge status={card.status} />
            <h1 className="mt-2 text-xl font-bold">
              {formatCurrency(
                parseMoney(card.issuedAmount ?? card.requestedAmount)
              )}
            </h1>
            <p className="text-muted-foreground">{card.purpose}</p>
          </div>
          <dl className="text-sm sm:text-right">
            <dt className="text-muted-foreground">Requested by</dt>
            <dd className="font-medium">{card.requesterName}</dd>
            {card.cardLabel && (
              <>
                <dt className="mt-2 text-muted-foreground">Card</dt>
                <dd className="font-medium">{card.cardLabel}</dd>
              </>
            )}
          </dl>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <Field
            label="Event"
            value={
              card.eventPlanId && card.eventPlanTitle ? (
                <Link
                  href={`/events/${card.eventPlanId}`}
                  className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                >
                  {card.eventPlanTitle}
                </Link>
              ) : (
                card.eventLabel || "General (non-event)"
              )
            }
          />
          <Field
            label="Budget line"
            value={card.budgetCategoryName ?? "Not assigned"}
          />
          <Field
            label="Requested"
            value={formatCurrency(parseMoney(card.requestedAmount))}
          />
          <Field
            label="Loaded"
            value={
              card.issuedAmount
                ? `${formatCurrency(parseMoney(card.issuedAmount))}${card.issuedAt ? ` · ${formatDateTimeInTimeZone(card.issuedAt, timeZone)}` : ""}`
                : "Not yet issued"
            }
          />
          {card.spentAmount && (
            <Field
              label="Spent"
              value={formatCurrency(parseMoney(card.spentAmount))}
            />
          )}
          {card.unaccounted && card.status === "issued" && (
            <Field
              label="Still to account for"
              value={formatCurrency(parseMoney(card.unaccounted))}
            />
          )}
        </dl>

        {card.reconciliationNote && (
          <p className="mt-4 border-t border-border pt-4 text-sm">
            <span className="font-medium">Reconciled: </span>
            <span className="text-muted-foreground">
              {card.reconciliationNote}
            </span>
          </p>
        )}
        {card.deniedReason && (
          <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <span className="font-medium">Declined: </span>
            {card.deniedReason}
          </p>
        )}
      </div>

      <SpendingCardPanel card={card} />

      {/* Read-only receipt view for whoever isn't the cardholder — the panel
          above gives the cardholder an editable one while the card is out. */}
      {!card.viewer.canAddReceipts && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-medium">Receipts</h2>
          {card.receipts.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing attached yet.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {card.receipts.map((receipt) => (
                <li key={receipt.id} className="space-y-1">
                  <a
                    href={receipt.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-border"
                  >
                    {receipt.contentType === "application/pdf" ? (
                      <span className="flex h-32 flex-col items-center justify-center gap-1 p-2 text-center">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {receipt.fileName}
                        </span>
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={receipt.blobUrl}
                        alt={receipt.fileName}
                        className="h-32 w-full object-cover"
                      />
                    )}
                  </a>
                  {receipt.paymentMethodHint && (
                    <p className="text-xs text-muted-foreground">
                      Paid with {receipt.paymentMethodHint}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
