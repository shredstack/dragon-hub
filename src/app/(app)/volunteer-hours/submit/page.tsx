import { getMyCommitteeOptions } from "@/actions/committees";
import { SubmitHoursForm } from "./submit-form";

interface PageProps {
  searchParams: Promise<{ committeeId?: string }>;
}

export default async function SubmitVolunteerHoursPage({
  searchParams,
}: PageProps) {
  const { committeeId } = await searchParams;

  // Read from `committee_members`, so nobody is offered — or can prefill — a
  // committee they aren't on.
  const committees = await getMyCommitteeOptions();
  const selected = committeeId
    ? committees.find((c) => c.id === committeeId)
    : undefined;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Log Volunteer Hours</h1>
      <SubmitHoursForm
        committees={committees}
        prefill={
          selected ? { eventName: selected.name, category: selected.name } : null
        }
      />
    </div>
  );
}
