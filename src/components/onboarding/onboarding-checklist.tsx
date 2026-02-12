"use client";

import { useState, useEffect, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  getChecklistWithProgress,
  toggleChecklistItem,
} from "@/actions/onboarding-checklist";
import type {
  PtaBoardPosition,
  OnboardingChecklistItemWithProgress,
} from "@/types";

interface OnboardingChecklistProps {
  position?: PtaBoardPosition;
}

export function OnboardingChecklist({ position }: OnboardingChecklistProps) {
  const [items, setItems] = useState<OnboardingChecklistItemWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getChecklistWithProgress(position)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [position]);

  const handleToggle = async (itemId: string) => {
    setTogglingId(itemId);

    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed: !item.completed,
              completedAt: item.completed ? null : new Date(),
            }
          : item
      )
    );

    startTransition(async () => {
      try {
        await toggleChecklistItem(itemId);
      } catch {
        // Revert on error
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  completed: !item.completed,
                  completedAt: item.completed ? new Date() : null,
                }
              : item
          )
        );
      } finally {
        setTogglingId(null);
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No checklist items have been set up yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask your school admin to add onboarding checklist items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleToggle(item.id)}
          disabled={togglingId === item.id}
          className={`group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
            item.completed
              ? "border-green-500/20 bg-green-500/5 hover:bg-green-500/10"
              : "border-border bg-card hover:border-dragon-blue-500 hover:bg-dragon-blue-500/5"
          }`}
        >
          <div
            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              item.completed
                ? "border-green-500 bg-green-500 text-white"
                : "border-muted-foreground/30 group-hover:border-dragon-blue-500"
            }`}
          >
            {togglingId === item.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : item.completed ? (
              <Check className="h-3 w-3" />
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${
                item.completed ? "text-muted-foreground line-through" : ""
              }`}
            >
              {item.title}
            </p>
            {item.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.description}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
