import { getSignupPageData } from "@/actions/volunteer-signups";
import { notFound } from "next/navigation";
import { VolunteerSignupForm } from "./signup-form";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function VolunteerSignupPage({ params }: PageProps) {
  const { code } = await params;
  const data = await getSignupPageData(code);

  if (!data) {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-muted px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-dragon-blue-500">Dragon Hub</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {data.school.name} Volunteer Sign-up
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              Welcome to {data.school.name} Volunteer Sign-up!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign up to be a Room Parent or Party Volunteer for your child&apos;s classroom.
            </p>
          </div>

          {/* Role descriptions */}
          <div className="mb-6 space-y-4 rounded-lg bg-muted/50 p-4">
            <div>
              <h3 className="font-medium">Room Parent</h3>
              <p className="text-sm text-muted-foreground">
                Room parents help coordinate 2-3 class parties throughout the year
                (Halloween, Valentine&apos;s Day, end-of-year). You&apos;ll work with the
                teacher and other room parent to organize activities, communicate with
                parent volunteers, and help make parties run smoothly. Time commitment:
                ~2-3 hours per party for planning + party attendance.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Party Volunteer</h3>
              <p className="text-sm text-muted-foreground">
                Party volunteers help with setup, activities, and cleanup during
                classroom parties. The room parents will reach out when they need extra
                hands! Time commitment: ~1 hour during the party.
              </p>
            </div>
          </div>

          <VolunteerSignupForm
            qrCode={code}
            schoolName={data.school.name}
            classrooms={data.classrooms}
            partyTypes={data.partyTypes}
            roomParentLimit={data.roomParentLimit}
          />
        </div>
      </div>
    </div>
  );
}
