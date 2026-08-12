import { getVolunteerHourActivityOptions } from "@/actions/volunteer-hours";
import { SubmitHoursForm } from "./submit-form";

export const metadata = { title: "Log Volunteer Hours" };

interface PageProps {
  searchParams: Promise<{ committeeId?: string }>;
}

export default async function SubmitVolunteerHoursPage({
  searchParams,
}: PageProps) {
  const { committeeId } = await searchParams;

  // Options are built from the caller's own memberships, so nobody is offered —
  // or can prefill — a committee or classroom they aren't part of.
  const options = await getVolunteerHourActivityOptions();
  const selected = committeeId
    ? options.committees.find((c) => c.id === committeeId)
    : undefined;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Log Volunteer Hours</h1>
      <SubmitHoursForm
        options={options}
        prefill={
          selected
            ? { activity: selected.value, category: selected.suggestedCategory }
            : null
        }
      />
    </div>
  );
}
