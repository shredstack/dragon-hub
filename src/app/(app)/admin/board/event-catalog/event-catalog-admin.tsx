"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Wand2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  Calendar,
  DollarSign,
  Loader2,
} from "lucide-react";
import {
  deleteCatalogEntry,
  generateCatalogFromEventPlans,
} from "@/actions/event-catalog";
import { EventCatalogForm } from "@/components/onboarding/event-catalog-form";
import type { EventCatalogEntry } from "@/types";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";

interface EventCatalogAdminProps {
  entries: EventCatalogEntry[];
  completedEventPlansCount: number;
}

export function EventCatalogAdmin({
  entries,
  completedEventPlansCount,
}: EventCatalogAdminProps) {
  const [isPending, startTransition] = useTransition();
  const [editingEntry, setEditingEntry] = useState<EventCatalogEntry | null>(
    null
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<{
    success: boolean;
    created: number;
  } | null>(null);

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this catalog entry?")) return;
    startTransition(async () => {
      await deleteCatalogEntry(id);
    });
  };

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateCatalogFromEventPlans();
      setGenerateResult(result);
      setTimeout(() => setGenerateResult(null), 5000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Generate from Event Plans Section */}
      {completedEventPlansCount > 0 && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-medium text-purple-800 dark:text-purple-200">
                Auto-Generate from Event Plans
              </h3>
              <p className="mt-1 text-sm text-purple-700 dark:text-purple-300">
                You have {completedEventPlansCount} completed event plan
                {completedEventPlansCount === 1 ? "" : "s"} that can be used to
                automatically create catalog entries.
              </p>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isPending}
              variant="outline"
              className="shrink-0 border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Generate Entries
            </Button>
          </div>
          {generateResult && (
            <div className="mt-3 rounded bg-purple-100 p-2 text-sm text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              {generateResult.created > 0
                ? `Created ${generateResult.created} new catalog ${generateResult.created === 1 ? "entry" : "entries"}`
                : "No new entries created (all event plans already have catalog entries)"}
            </div>
          )}
        </div>
      )}

      {/* Add Entry Form */}
      {editingEntry ? (
        <EventCatalogForm
          editingEntry={editingEntry}
          onSuccess={() => setEditingEntry(null)}
          onCancel={() => setEditingEntry(null)}
          showToggleButton={false}
        />
      ) : (
        <EventCatalogForm showToggleButton={true} />
      )}

      {/* Entries List */}
      <div className="space-y-4">
        <h3 className="font-semibold">
          Catalog Entries ({entries.length})
        </h3>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              No catalog entries yet. Add events manually or generate from
              completed event plans.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                  }
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.title}</span>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {entry.eventType}
                        </span>
                        {entry.aiGenerated && (
                          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            AI Generated
                          </span>
                        )}
                      </div>
                      {entry.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          {entry.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEntry(entry);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.id);
                      }}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {expandedId === entry.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {expandedId === entry.id && (
                  <div className="border-t bg-muted/30 p-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {entry.typicalTiming && (
                        <div className="flex items-start gap-2">
                          <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Timing
                            </p>
                            <p className="text-sm">{entry.typicalTiming}</p>
                          </div>
                        </div>
                      )}
                      {entry.estimatedVolunteers && (
                        <div className="flex items-start gap-2">
                          <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Volunteers
                            </p>
                            <p className="text-sm">{entry.estimatedVolunteers}</p>
                          </div>
                        </div>
                      )}
                      {entry.estimatedBudget && (
                        <div className="flex items-start gap-2">
                          <DollarSign className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Budget
                            </p>
                            <p className="text-sm">{entry.estimatedBudget}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {entry.keyTasks && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Key Tasks
                        </p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {JSON.parse(entry.keyTasks).map(
                            (task: string, i: number) => (
                              <li key={i}>{task}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                    {entry.tips && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Tips
                        </p>
                        <p className="text-sm">{entry.tips}</p>
                      </div>
                    )}

                    {entry.relatedPositions &&
                      entry.relatedPositions.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Related Positions
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {entry.relatedPositions.map((pos) => (
                              <span
                                key={pos}
                                className="rounded bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-300"
                              >
                                {PTA_BOARD_POSITIONS[
                                  pos as keyof typeof PTA_BOARD_POSITIONS
                                ] ?? pos}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
