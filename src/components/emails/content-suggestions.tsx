"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Lightbulb,
  Calendar,
  FileText,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ContentSuggestion } from "@/lib/ai/email-generator";

interface ContentSuggestionsProps {
  suggestions: ContentSuggestion[];
  onAddSuggestion: (suggestion: ContentSuggestion) => Promise<void>;
  onDismiss: () => void;
}

export function ContentSuggestions({
  suggestions,
  onAddSuggestion,
  onDismiss,
}: ContentSuggestionsProps) {
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  const visibleSuggestions = suggestions.filter((_, i) => !dismissedIds.has(i));

  if (visibleSuggestions.length === 0) return null;

  async function handleAdd(suggestion: ContentSuggestion, index: number) {
    setAddingIndex(index);
    try {
      await onAddSuggestion(suggestion);
      setDismissedIds((prev) => new Set(prev).add(index));
    } catch (error) {
      console.error("Failed to add suggestion:", error);
    } finally {
      setAddingIndex(null);
    }
  }

  function handleDismissOne(index: number) {
    setDismissedIds((prev) => new Set(prev).add(index));
  }

  function getSourceIcon(source: ContentSuggestion["source"]) {
    switch (source) {
      case "calendar":
        return <Calendar className="h-3 w-3" />;
      case "minutes":
        return <FileText className="h-3 w-3" />;
      case "pattern":
        return <Lightbulb className="h-3 w-3" />;
    }
  }

  function getSourceLabel(source: ContentSuggestion["source"]) {
    switch (source) {
      case "calendar":
        return "Upcoming Event";
      case "minutes":
        return "From Minutes";
      case "pattern":
        return "Suggestion";
    }
  }

  function getPriorityColor(priority: ContentSuggestion["priority"]) {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200";
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <div
        className="flex cursor-pointer items-center justify-between p-3"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lightbulb className="h-4 w-4 text-amber-600" />
          AI Suggestions ({visibleSuggestions.length})
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
          >
            Dismiss All
          </Button>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-2 px-3 pb-3">
          {suggestions.map((suggestion, index) => {
            if (dismissedIds.has(index)) return null;
            return (
              <div
                key={index}
                className="rounded-md border border-amber-200/50 bg-white p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-medium">{suggestion.title}</h4>
                      <Badge
                        variant="outline"
                        className={`text-xs ${getPriorityColor(suggestion.priority)}`}
                      >
                        {suggestion.priority}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      {getSourceIcon(suggestion.source)}
                      <span>{getSourceLabel(suggestion.source)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => handleDismissOne(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {suggestion.reason}
                </p>
                {suggestion.suggestedBlurb && (
                  <Button
                    size="sm"
                    onClick={() => handleAdd(suggestion, index)}
                    disabled={addingIndex === index}
                    className="w-full"
                  >
                    {addingIndex === index ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Add as Section
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
