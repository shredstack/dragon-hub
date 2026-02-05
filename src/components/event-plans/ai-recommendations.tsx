"use client";

import { useState } from "react";
import { getEventRecommendations } from "@/actions/ai-recommendations";
import type { EventRecommendation } from "@/actions/ai-recommendations";
import { bulkCreateEventPlanTasks } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  ListTodo,
  Lightbulb,
  Users,
  DollarSign,
  Loader2,
} from "lucide-react";

interface AIRecommendationsProps {
  eventPlanId: string;
  canInteract: boolean;
}

export function AIRecommendations({
  eventPlanId,
  canInteract,
}: AIRecommendationsProps) {
  const [recommendations, setRecommendations] =
    useState<EventRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [addingTasks, setAddingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGetRecommendations() {
    setLoading(true);
    setError(null);
    try {
      const result = await getEventRecommendations(eventPlanId);
      setRecommendations(result);
    } catch {
      setError("Failed to get recommendations. Please try again.");
    }
    setLoading(false);
  }

  async function handleAddTasks() {
    if (!recommendations?.suggestedTasks) return;
    setAddingTasks(true);
    await bulkCreateEventPlanTasks(
      eventPlanId,
      recommendations.suggestedTasks
    );
    setAddingTasks(false);
  }

  if (!recommendations) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-dragon-gold-500" />
            <span className="text-sm font-medium">AI Recommendations</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGetRecommendations}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Get Recommendations
              </>
            )}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Get AI-powered suggestions based on past event documents and
          planning best practices.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dragon-gold-200 bg-dragon-gold-50/30 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-dragon-gold-500" />
          <span className="text-sm font-semibold">AI Recommendations</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {recommendations.summary && (
            <p className="text-sm text-muted-foreground">
              {recommendations.summary}
            </p>
          )}

          {recommendations.suggestedTasks.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  <ListTodo className="h-3.5 w-3.5" /> Suggested Tasks
                </h4>
                {canInteract && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddTasks}
                    disabled={addingTasks}
                  >
                    {addingTasks ? "Adding..." : "Add All Tasks"}
                  </Button>
                )}
              </div>
              <ul className="space-y-1.5">
                {recommendations.suggestedTasks.map((task, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{task.title}</span>
                    {task.description && (
                      <span className="text-muted-foreground">
                        {" "}
                        &mdash; {task.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.tips.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5" /> Tips
              </h4>
              <ul className="space-y-1 text-sm">
                {recommendations.tips.map((tip, i) => (
                  <li key={i} className="text-muted-foreground">
                    &bull; {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.estimatedVolunteers && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Volunteer Estimate
              </h4>
              <p className="text-sm text-muted-foreground">
                {recommendations.estimatedVolunteers}
              </p>
            </div>
          )}

          {recommendations.budgetSuggestions && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" /> Budget Suggestions
              </h4>
              <p className="text-sm text-muted-foreground">
                {recommendations.budgetSuggestions}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
