import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { getReimbursementPolicy } from "@/lib/reimbursement-policy";
import { getReimbursementEventPlanOptions } from "@/actions/reimbursements";
import { SpendingCardForm } from "@/components/reimbursements/spending-card-form";
import { privateMetadata } from "@/lib/page-metadata";
import { ArrowLeft } from "lucide-react";

export const metadata = privateMetadata("Request a spending card");

interface PageProps {
  searchParams: Promise<{ eventPlanId?: string }>;
}

export default async function NewSpendingCardPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Policy-gated at the page as well as in the action: a school whose state
  // PTA doesn't run cards should never see the form, let alone submit it.
  const policy = await getReimbursementPolicy(schoolId);
  if (!policy.spendingCardsEnabled) redirect("/reimbursements");

  const { eventPlanId } = await searchParams;
  if (eventPlanId) {
    const access = await assertEventPlanAccess(userId, eventPlanId).catch(
      () => null
    );
    if (!access) notFound();
  }

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const [planOptions, categories, canRequestGeneral] = await Promise.all([
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
        href={eventPlanId ? `/events/${eventPlanId}` : "/reimbursements?tab=cards"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {eventPlanId ? "Back to the event" : "Back to spending cards"}
      </Link>

      <h1 className="text-2xl font-bold">Request a spending card</h1>
      <p className="mb-6 text-muted-foreground">
        {lockedPlan
          ? `For ${lockedPlan.title}. `
          : ""}
        A card the PTA loads in advance, so you don&apos;t have to front the
        money and wait for a check.
      </p>

      <SpendingCardForm
        eventPlanOptions={planOptions}
        budgetCategoryOptions={categories}
        canRequestGeneral={canRequestGeneral}
        lockedEventPlanId={lockedPlan?.id ?? null}
      />
    </div>
  );
}
