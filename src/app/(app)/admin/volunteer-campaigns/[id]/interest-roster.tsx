"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  exportCampaignInterests,
  removeCampaignInterest,
} from "@/actions/volunteer-campaigns";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";

interface Volunteer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  interestLevel: string;
  notes: string | null;
  createdAt: Date | null;
}

interface RosterEvent {
  id: string;
  title: string;
  iconEmoji: string | null;
  /** Removed from the signup page; its volunteers are kept and still listed. */
  isArchived: boolean;
  volunteers: Volunteer[];
}

export function InterestRoster({
  campaignId,
  roster,
}: {
  campaignId: string;
  roster: RosterEvent[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  const total = roster.reduce((sum, e) => sum + e.volunteers.length, 0);

  const handleExport = async () => {
    const csv = await exportCampaignInterests(campaignId);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "volunteer-interest.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  // The most common next action is "email everyone who said yes to this one
  // event", so make that one click rather than a spreadsheet round-trip.
  const copyEmails = (event: RosterEvent) => {
    const emails = event.volunteers.map((v) => v.email).join(", ");
    navigator.clipboard.writeText(emails);
    setCopied(event.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRemove = async (volunteer: Volunteer) => {
    const ok = await confirm({
      title: `Remove ${volunteer.name} from this event?`,
      description:
        "They come off the roster for this event. The signup is kept as a record rather than erased, and their other events are unaffected.",
      confirmLabel: "Remove",
    });
    if (!ok) return;

    try {
      await removeCampaignInterest(volunteer.id);
      router.refresh();
    } finally {
      closeConfirm();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Who&apos;s Interested</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} response{total === 1 ? "" : "s"} across{" "}
            {roster.length} event{roster.length === 1 ? "" : "s"}
          </p>
        </div>
        {total > 0 && (
          <Button variant="outline" onClick={handleExport}>
            Export CSV
          </Button>
        )}
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No responses yet. Share the QR code above and they&apos;ll show up
          here.
        </div>
      ) : (
        <div className="space-y-6">
          {roster.map((event) => (
            <div key={event.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">
                  {event.iconEmoji && (
                    <span className="mr-1">{event.iconEmoji}</span>
                  )}
                  {event.title}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({event.volunteers.length})
                  </span>
                  {event.isArchived && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · removed from signup page
                    </span>
                  )}
                </h3>
                {event.volunteers.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyEmails(event)}
                  >
                    {copied === event.id ? "Copied!" : "Copy Emails"}
                  </Button>
                )}
              </div>

              {event.volunteers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No one yet.
                </p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="space-y-3 md:hidden">
                    {event.volunteers.map((v) => (
                      <div
                        key={v.id}
                        className="rounded-lg border border-border p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{v.name}</p>
                            <p className="break-all text-sm text-muted-foreground">
                              {v.email}
                            </p>
                            {v.phone && (
                              <p className="text-sm text-muted-foreground">
                                {v.phone}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 text-red-600 hover:text-red-700"
                            onClick={() => handleRemove(v)}
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1">
                          <LevelBadge level={v.interestLevel} />
                        </div>
                        {v.notes && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {v.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop table view */}
                  <div className="hidden rounded-lg border border-border md:block">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/50 text-left">
                          <tr>
                            <th className="p-3 font-medium">Name</th>
                            <th className="p-3 font-medium">Contact</th>
                            <th className="p-3 font-medium">Interest</th>
                            <th className="p-3 font-medium">Notes</th>
                            <th className="p-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {event.volunteers.map((v) => (
                            <tr
                              key={v.id}
                              className="border-b border-border last:border-0"
                            >
                              <td className="p-3 font-medium">{v.name}</td>
                              <td className="p-3">
                                <div>{v.email}</div>
                                {v.phone && (
                                  <div className="text-muted-foreground">
                                    {v.phone}
                                  </div>
                                )}
                              </td>
                              <td className="p-3">
                                <LevelBadge level={v.interestLevel} />
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {v.notes ?? "—"}
                              </td>
                              <td className="p-3 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleRemove(v)}
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  return level === "lead" ? (
    <Badge variant="success">Wants to help lead</Badge>
  ) : (
    <Badge variant="secondary">Interested</Badge>
  );
}
