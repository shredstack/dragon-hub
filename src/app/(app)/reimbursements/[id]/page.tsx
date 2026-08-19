import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentSchoolId, isPtaBoardMember } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { budgetCategories } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { getReimbursementPolicy } from "@/lib/reimbursement-policy";
import { getBoardPositionLabels } from "@/lib/board-positions";
import { positionLabel } from "@/lib/board-positions-shared";
import {
  getReimbursement,
  getReimbursementEventPlanOptions,
} from "@/actions/reimbursements";
import { RequestDetail } from "@/components/reimbursements/request-detail";
import { RequestForm } from "@/components/reimbursements/request-form";
import { ReviewPanel } from "@/components/reimbursements/review-panel";
import { isEditableReimbursementStatus } from "@/lib/reimbursements-shared";
import { todayDateOnly } from "@/lib/date-only";
import { privateMetadata } from "@/lib/page-metadata";
import { ArrowLeft, Printer } from "lucide-react";

export const metadata = privateMetadata("Reimbursement request");

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * One request.
 *
 * The same page serves three readers, because they are looking at the same
 * facts: the submitter still filling it in (who gets the wizard), the submitter
 * watching it move (who gets the detail), and an officer deciding (who gets the
 * detail plus the action bar).
 */
export default async function ReimbursementPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Returns null for anything the caller may not see, including a request from
  // another school — a 404, not a 403, so the page never confirms it exists.
  const request = await getReimbursement(id);
  if (!request) notFound();

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const editing =
    request.viewer.isOwner && isEditableReimbursementStatus(request.status);

  const [policy, timeZone, positionLabels, categories, planOptions, isBoard] =
    await Promise.all([
      getReimbursementPolicy(schoolId),
      getSchoolTimeZone(schoolId),
      getBoardPositionLabels(schoolId),
      db
        .select({ id: budgetCategories.id, name: budgetCategories.name })
        .from(budgetCategories)
        .where(
          and(
            eq(budgetCategories.schoolId, schoolId),
            eq(budgetCategories.schoolYear, schoolYear)
          )
        )
        .orderBy(asc(budgetCategories.name)),
      editing ? getReimbursementEventPlanOptions() : Promise.resolve([]),
      editing ? isPtaBoardMember(userId, schoolId) : Promise.resolve(false),
    ]);

  // From the request's own snapshot, not today's policy — a later policy edit
  // must not restate who was required to sign this one.
  const approverLabels = request.requiredApproverRoles
    .map((slug) => positionLabel(positionLabels, slug) ?? slug)
    .join(" and ");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/reimbursements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reimbursements
        </Link>
        {/* The binder copy. Offered once the request has actually been asked
            for — a printed draft is a form for a request nobody has made. */}
        {request.status !== "draft" && (
          <Link
            href={`/reimbursements/${request.id}/print`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Printer className="h-4 w-4" />
            Printable form
          </Link>
        )}
      </div>

      {editing ? (
        <>
          <h1 className="text-2xl font-bold">
            {request.status === "draft"
              ? "Finish your request"
              : "Changes requested"}
          </h1>
          <p className="mb-6 text-muted-foreground">
            {request.status === "draft"
              ? "Nothing has been sent to the officers yet."
              : "An officer sent this back — see the history below for what they asked for."}
          </p>
          <RequestForm
            requestId={request.id}
            initial={{
              eventPlanId: request.eventPlanId,
              eventLabel: request.eventLabel,
              payeeName: request.payeeName,
              vendor: request.vendor,
              purchaseDate: request.purchaseDate,
              purpose: request.purpose,
              budgetCategoryId: request.budgetCategoryId,
              subtotalAmount: request.subtotalAmount,
              salesTaxAmount: request.salesTaxAmount,
              totalAmount: request.totalAmount,
              missingReceipt: request.missingReceipt,
              attestedPersonalFunds: request.attestedPersonalFunds,
              items: request.items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                amount: item.amount,
              })),
            }}
            initialReceipts={request.receipts.map((receipt) => ({
              id: receipt.id,
              blobUrl: receipt.blobUrl,
              fileName: receipt.fileName,
              contentType: receipt.contentType,
            }))}
            eventPlanOptions={planOptions}
            budgetCategoryOptions={categories}
            policy={policy}
            canSubmitGeneral={isBoard}
            defaultPayeeName={request.payeeName}
            today={todayDateOnly(timeZone)}
          />
          <div className="mt-8">
            <RequestDetail
              request={request}
              positionLabels={positionLabels}
              timeZone={timeZone}
            />
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {request.viewer.isOfficer ? (
            <ReviewPanel request={request} budgetCategoryOptions={categories} />
          ) : (
            request.viewer.isViewer &&
            !request.viewer.isOwner && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                You&apos;re reading this as a board member. Only the{" "}
                {approverLabels} can approve a request or record its check.
              </p>
            )
          )}
          <RequestDetail
            request={request}
            positionLabels={positionLabels}
            timeZone={timeZone}
          />
        </div>
      )}
    </div>
  );
}
