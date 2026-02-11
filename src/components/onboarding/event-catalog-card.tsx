"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Users,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Star,
  Hand,
  Eye,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { toggleEventInterest } from "@/actions/event-catalog";
import type { EventCatalogEntryWithInterest, EventInterestLevel } from "@/types";

interface EventCatalogCardProps {
  entry: EventCatalogEntryWithInterest;
  onInterestChange: (
    newInterest: EventCatalogEntryWithInterest["userInterest"]
  ) => void;
}

const interestLevels: {
  level: EventInterestLevel;
  label: string;
  icon: typeof Star;
  color: string;
}[] = [
  { level: "lead", label: "Lead", icon: Star, color: "text-amber-500" },
  { level: "help", label: "Help", icon: Hand, color: "text-blue-500" },
  { level: "observe", label: "Watch", icon: Eye, color: "text-gray-500" },
];

export function EventCatalogCard({
  entry,
  onInterestChange,
}: EventCatalogCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleInterestClick = (level: EventInterestLevel) => {
    startTransition(async () => {
      // If clicking same level, remove interest
      const newLevel = entry.userInterest?.interestLevel === level ? null : level;

      if (newLevel === null) {
        await toggleEventInterest(entry.id, null);
        onInterestChange(null);
      } else {
        await toggleEventInterest(entry.id, newLevel);
        onInterestChange({
          id: entry.userInterest?.id ?? "",
          schoolId: entry.schoolId,
          userId: "",
          eventCatalogId: entry.id,
          schoolYear: "",
          interestLevel: newLevel,
          notes: null,
          createdAt: new Date(),
        });
      }
    });
  };

  // Parse keyTasks if it's a JSON string
  let keyTasks: string[] = [];
  if (entry.keyTasks) {
    try {
      keyTasks = JSON.parse(entry.keyTasks);
    } catch {
      keyTasks = [];
    }
  }

  // Parse tips if it's a JSON string
  let tips: string[] = [];
  if (entry.tips) {
    try {
      tips = JSON.parse(entry.tips);
    } catch {
      tips = [];
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                {entry.eventType}
              </span>
              {entry.totalInterested > 0 && (
                <span className="text-xs text-muted-foreground">
                  {entry.totalInterested} interested
                </span>
              )}
            </div>
            <CardTitle className="text-base">{entry.title}</CardTitle>
          </div>
          {entry.userInterest && (
            <div className="flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {entry.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {entry.description}
          </p>
        )}

        {/* Quick Info */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {entry.typicalTiming && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {entry.typicalTiming}
            </span>
          )}
          {entry.estimatedVolunteers && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {entry.estimatedVolunteers}
            </span>
          )}
          {entry.estimatedBudget && (
            <span className="inline-flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {entry.estimatedBudget}
            </span>
          )}
        </div>

        {/* Expandable Details */}
        {(keyTasks.length > 0 || tips.length > 0) && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Less details
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                More details
              </>
            )}
          </button>
        )}

        {expanded && (
          <div className="space-y-3 border-t border-border pt-3">
            {keyTasks.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Key Tasks</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {keyTasks.map((task, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-green-500">•</span>
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tips.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Tips</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-amber-500">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Interest Buttons */}
        <div className="flex gap-2 pt-2 border-t border-border">
          {interestLevels.map(({ level, label, icon: Icon, color }) => {
            const isActive = entry.userInterest?.interestLevel === level;
            return (
              <Button
                key={level}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={`flex-1 ${isActive ? "" : "hover:border-green-500"}`}
                onClick={() => handleInterestClick(level)}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Icon className={`h-3 w-3 mr-1 ${isActive ? "" : color}`} />
                    {label}
                  </>
                )}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
