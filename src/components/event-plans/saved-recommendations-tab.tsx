"use client";

import { useState } from "react";
import {
  deleteEventRecommendation,
  type EventRecommendation,
} from "@/actions/ai-recommendations";
import { bulkCreateEventPlanTasks } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TASK_TIMING_TAGS } from "@/lib/constants";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  ListTodo,
  Lightbulb,
  Users,
  DollarSign,
  Zap,
  Sparkles,
} from "lucide-react";
import type { TaskTimingTag } from "@/types";

interface SavedRecommendation {
  id: string;
  title: string;
  additionalContext: string | null;
  response: EventRecommendation;
  createdBy: string;
  creatorName: string;
  createdAt: string;
}

interface SavedRecommendationsTabProps {
  eventPlanId: string;
  recommendations: SavedRecommendation[];
  currentUserId: string;
  canDelete: boolean;
  canInteract: boolean;
}

const timingTagVariants: Record<TaskTimingTag, "destructive" | "warning" | "success"> = {
  day_of: "destructive",
  days_before: "warning",
  week_plus_before: "success",
};

export function SavedRecommendationsTab({
  eventPlanId,
  recommendations,
  currentUserId,
  canDelete,
  canInteract,
}: SavedRecommendationsTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingTasks, setAddingTasks] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAddTasks(rec: SavedRecommendation) {
    if (!rec.response?.suggestedTasks) return;
    setAddingTasks(rec.id);
    await bulkCreateEventPlanTasks(eventPlanId, rec.response.suggestedTasks);
    setAddingTasks(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteEventRecommendation(id);
    setDeletingId(null);
  }

  if (recommendations.length === 0) {
    return (
      <div className="py-12 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          No saved AI recommendations yet.
        </p>
        <p className="text-xs text-muted-foreground">
          Generate recommendations from the Overview tab and save them here for
          future reference.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {recommendations.length} saved recommendation
        {recommendations.length !== 1 ? "s" : ""}
      </p>

      {recommendations.map((rec) => {
        const isExpanded = expandedId === rec.id;
        const isCreator = rec.createdBy === currentUserId;
        const canDeleteThis = canDelete || isCreator;

        return (
          <div
            key={rec.id}
            className="rounded-lg border border-border bg-card"
          >
            {/* Header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : rec.id)}
              className="flex w-full items-center justify-between p-4"
            >
              <div className="text-left">
                <p className="font-medium">{rec.title}</p>
                <p className="text-xs text-muted-foreground">
                  By {rec.creatorName} &middot;{" "}
                  {new Date(rec.createdAt).toLocaleDateString()}
                </p>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-border p-4 space-y-4">
                {rec.additionalContext && (
                  <div className="rounded bg-muted p-2 text-xs">
                    <span className="font-medium">Context provided: </span>
                    {rec.additionalContext}
                  </div>
                )}

                {rec.response.summary && (
                  <p className="text-sm text-muted-foreground">
                    {rec.response.summary}
                  </p>
                )}

                {/* Enhancements */}
                {rec.response.enhancements && rec.response.enhancements.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <Zap className="h-3.5 w-3.5" /> Enhancements
                    </h4>
                    <ul className="space-y-1 text-sm">
                      {rec.response.enhancements.map((e, i) => (
                        <li key={i} className="text-muted-foreground">
                          &bull; {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tasks */}
                {rec.response.suggestedTasks.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                        <ListTodo className="h-3.5 w-3.5" /> Suggested Tasks
                      </h4>
                      {canInteract && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddTasks(rec)}
                          disabled={addingTasks === rec.id}
                        >
                          {addingTasks === rec.id ? "Adding..." : "Add All Tasks"}
                        </Button>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {rec.response.suggestedTasks.map((task, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          {task.timingTag && (
                            <Badge
                              variant={timingTagVariants[task.timingTag]}
                              className="mt-0.5 shrink-0 text-[10px]"
                            >
                              {TASK_TIMING_TAGS[task.timingTag]}
                            </Badge>
                          )}
                          <div>
                            <span className="font-medium">{task.title}</span>
                            {task.description && (
                              <span className="text-muted-foreground">
                                {" "}
                                &mdash; {task.description}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tips */}
                {rec.response.tips.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <Lightbulb className="h-3.5 w-3.5" /> Tips
                    </h4>
                    <ul className="space-y-1 text-sm">
                      {rec.response.tips.map((tip, i) => (
                        <li key={i} className="text-muted-foreground">
                          &bull; {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Volunteers */}
                {rec.response.estimatedVolunteers && (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> Volunteer Estimate
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {rec.response.estimatedVolunteers}
                    </p>
                  </div>
                )}

                {/* Budget */}
                {rec.response.budgetSuggestions && (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <DollarSign className="h-3.5 w-3.5" /> Budget Suggestions
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {rec.response.budgetSuggestions}
                    </p>
                  </div>
                )}

                {/* Delete Button */}
                {canDeleteThis && (
                  <div className="border-t border-border pt-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(rec.id)}
                      disabled={deletingId === rec.id}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === rec.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
