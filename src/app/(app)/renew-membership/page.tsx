import { auth } from "@/lib/auth";
import { checkRenewalStatus } from "@/actions/school-year";
import { RenewalForm } from "@/components/membership/renewal-form";
import { redirect } from "next/navigation";

export default async function RenewMembershipPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const status = await checkRenewalStatus();

  if (!status.hasCurrentMembership) {
    redirect("/join-school");
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Renew Your Membership</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Continue your PTA membership for the upcoming school year.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        {!status.needsRenewal ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-green-800">Already Renewed!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your membership has been renewed for {status.nextSchoolYear}.
            </p>
            <a
              href="/dashboard"
              className="mt-4 inline-block rounded-md bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600"
            >
              Return to Dashboard
            </a>
          </div>
        ) : (
          <RenewalForm
            currentSchoolYear={status.currentSchoolYear!}
            nextSchoolYear={status.nextSchoolYear!}
          />
        )}
      </div>
    </div>
  );
}
