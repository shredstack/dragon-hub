"use client";

import { useState } from "react";
import {
  getEventRecommendations,
  saveEventRecommendation,
} from "@/actions/ai-recommendations";
import type { EventRecommendation } from "@/actions/ai-recommendations";
import { bulkCreateEventPlanTasks } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TASK_TIMING_TAGS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  ListTodo,
  Lightbulb,
  Users,
  DollarSign,
  Loader2,
  Save,
  Zap,
  FileText,
  ExternalLink,
} from "lucide-react";
import type { TaskTimingTag } from "@/types";

interface AIRecommendationsProps {
  eventPlanId: string;
  canInteract: boolean;
}

const timingTagVariants: Record<TaskTimingTag, "destructive" | "warning" | "success"> = {
  day_of: "destructive",
  days_before: "warning",
  week_plus_before: "success",
};

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
  const [additionalContext, setAdditionalContext] = useState("");
  const [showContextInput, setShowContextInput] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleGetRecommendations() {
    setLoading(true);
    setError(null);
    try {
      const result = await getEventRecommendations(
        eventPlanId,
        additionalContext || undefined
      );
      setRecommendations(result);
    } catch {
      setError("Failed to get recommendations. Please try again.");
    }
    setLoading(false);
  }

  async function handleAddTasks() {
    if (!recommendations?.suggestedTasks) return;
    setAddingTasks(true);
    await bulkCreateEventPlanTasks(eventPlanId, recommendations.suggestedTasks);
    setAddingTasks(false);
  }

  async function handleSave() {
    if (!recommendations) return;
    setSaving(true);
    try {
      const title =
        saveTitle.trim() ||
        `Recommendation ${new Date().toLocaleDateString()}`;
      await saveEventRecommendation(
        eventPlanId,
        title,
        additionalContext || null,
        recommendations
      );
      setShowSaveDialog(false);
      setSaveTitle("");
    } catch {
      // Handle error silently
    }
    setSaving(false);
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
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Get AI-powered suggestions based on past event documents and planning
          best practices.
        </p>

        {/* Additional Context Input */}
        <div className="mt-4">
          <button
            onClick={() => setShowContextInput(!showContextInput)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {showContextInput ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            Add context for better recommendations
          </button>
          {showContextInput && (
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="E.g., 'We want to focus on parent engagement' or 'This is our biggest fundraiser of the year' or 'We have a limited budget this year'..."
              rows={3}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          )}
        </div>
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
            <p className="break-words text-sm text-muted-foreground">
              {recommendations.summary}
            </p>
          )}

          {/* Enhancements Section */}
          {recommendations.enhancements && recommendations.enhancements.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <Zap className="h-3.5 w-3.5" /> Enhancement Suggestions
              </h4>
              <ul className="space-y-1 text-sm">
                {recommendations.enhancements.map((enhancement, i) => (
                  <li
                    key={i}
                    className="break-words rounded bg-dragon-gold-100/50 p-2 text-muted-foreground"
                  >
                    {enhancement}
                  </li>
                ))}
              </ul>
            </div>
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

          {recommendations.tips.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5" /> Tips
              </h4>
              <ul className="space-y-1 text-sm">
                {recommendations.tips.map((tip, i) => (
                  <li key={i} className="break-words text-muted-foreground">
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
              <p className="break-words text-sm text-muted-foreground">
                {recommendations.estimatedVolunteers}
              </p>
            </div>
          )}

          {recommendations.budgetSuggestions && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" /> Budget Suggestions
              </h4>
              <p className="break-words text-sm text-muted-foreground">
                {recommendations.budgetSuggestions}
              </p>
            </div>
          )}

          {/* Sources Used */}
          {recommendations.sourcesUsed && recommendations.sourcesUsed.length > 0 && (
            <div className="border-t border-dragon-gold-200 pt-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Sources Used
              </h4>
              <ul className="space-y-1 text-sm">
                {recommendations.sourcesUsed.map((source, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
                      {source.type === "knowledge_article"
                        ? "Knowledge"
                        : source.type === "attached_resource"
                          ? "Resource"
                          : "Document"}
                    </span>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 truncate text-primary hover:underline"
                      >
                        {source.title}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate">{source.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          {canInteract && (
            <div className="flex flex-wrap gap-2 border-t border-dragon-gold-200 pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSaveDialog(true)}
              >
                <Save className="h-4 w-4" /> Save Recommendation
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRecommendations(null);
                  setShowContextInput(true);
                }}
              >
                <Sparkles className="h-4 w-4" /> Generate New
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Recommendation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Title (optional)
              </label>
              <input
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder={`Recommendation ${new Date().toLocaleDateString()}`}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
