import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  assertEventPlanAccess,
  getCurrentSchoolId,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { budgetCategories } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { getReimbursementPolicy } from "@/lib/reimbursement-policy";
import { getReimbursementEventPlanOptions } from "@/actions/reimbursements";
import { RequestForm } from "@/components/reimbursements/request-form";
import { EmptyState } from "@/components/ui/empty-state";
import { todayDateOnly } from "@/lib/date-only";
import { privateMetadata } from "@/lib/page-metadata";
import { ArrowLeft, Receipt } from "lucide-react";

export const metadata = privateMetadata("New reimbursement request");

interface PageProps {
  searchParams: Promise<{ eventPlanId?: string }>;
}

export default async function NewReimbursementPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const { eventPlanId } = await searchParams;

  // Arriving from inside a plan locks the request to it — but only after the
  // same access check the submit action will make, so a plan id typed into the
  // URL can't put the wizard into a plan the caller isn't on.
  if (eventPlanId) {
    const access = await assertEventPlanAccess(userId, eventPlanId).catch(
      () => null
    );
    if (!access) notFound();
  }

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const [policy, timeZone, planOptions, categories, canSubmitGeneral] =
    await Promise.all([
      getReimbursementPolicy(schoolId),
      getSchoolTimeZone(schoolId),
      getReimbursementEventPlanOptions(),
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
      isPtaBoardMember(userId, schoolId),
    ]);

  const lockedPlan = eventPlanId
    ? planOptions.find((plan) => plan.id === eventPlanId)
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={eventPlanId ? `/events/plans/${eventPlanId}` : "/reimbursements"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {eventPlanId ? "Back to the event" : "Back to reimbursements"}
      </Link>

      <h1 className="text-2xl font-bold">Request a reimbursement</h1>
      <p className="mb-6 text-muted-foreground">
        {lockedPlan
          ? `For ${lockedPlan.title}.`
          : "Photograph the receipt, check the details, and the officers take it from there."}
      </p>

      {planOptions.length === 0 && !canSubmitGeneral ? (
        <EmptyState
          icon={Receipt}
          title="No event plan to file against"
          description="Reimbursable spending is expected to line up with an event plan. Ask the plan's lead to add you, then come back."
        />
      ) : (
        <RequestForm
          eventPlanOptions={planOptions}
          budgetCategoryOptions={categories}
          policy={policy}
          canSubmitGeneral={canSubmitGeneral}
          defaultPayeeName={session?.user?.name || session?.user?.email || ""}
          lockedEventPlanId={lockedPlan?.id ?? null}
          today={todayDateOnly(timeZone)}
        />
      )}
    </div>
  );
}
