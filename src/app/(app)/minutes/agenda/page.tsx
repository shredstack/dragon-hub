import Link from "next/link";
import { getAgendas } from "@/actions/minutes";
import { CalendarDays, Plus, FileText } from "lucide-react";
import { getCurrentUser, getCurrentSchoolId, isSchoolPtaBoardOrAdmin } from "@/lib/auth-helpers";

export default async function AgendasPage() {
  const user = await getCurrentUser();
  const schoolId = await getCurrentSchoolId();
  const isPtaBoard = user?.id && schoolId
    ? await isSchoolPtaBoardOrAdmin(user.id, schoolId)
    : false;

  const agendas = await getAgendas();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/minutes"
              className="text-sm text-muted-foreground hover:underline"
            >
              Minutes
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-bold">Meeting Agendas</h1>
          </div>
          <p className="text-muted-foreground">
            AI-generated agendas based on historical meeting patterns
          </p>
        </div>
        {isPtaBoard && (
          <Link
            href="/minutes/agenda/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            Generate Agenda
          </Link>
        )}
      </div>

      {agendas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <CalendarDays className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 font-medium">No agendas yet</p>
          <p className="text-sm text-muted-foreground">
            {isPtaBoard
              ? "Generate your first agenda using AI"
              : "No agendas have been created yet"}
          </p>
          {isPtaBoard && (
            <Link
              href="/minutes/agenda/new"
              className="mt-4 inline-flex h-9 items-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              Generate Agenda
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {agendas.map((agenda) => {
            const monthName = new Date(
              agenda.targetYear,
              agenda.targetMonth - 1
            ).toLocaleString("en-US", { month: "long" });

            return (
              <Link
                key={agenda.id}
                href={`/minutes/agenda/${agenda.id}`}
                className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{agenda.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {monthName} {agenda.targetYear}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {agenda.creator?.name && `Created by ${agenda.creator.name} · `}
                    {agenda.createdAt && new Date(agenda.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
