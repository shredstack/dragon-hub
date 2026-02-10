"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableSummaryProps {
  summary: string | null;
  maxLength?: number;
}

export function ExpandableSummary({
  summary,
  maxLength = 100,
}: ExpandableSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!summary) {
    return <span className="text-muted-foreground">No summary</span>;
  }

  const needsTruncation = summary.length > maxLength;

  if (!needsTruncation) {
    return <span className="text-muted-foreground">{summary}</span>;
  }

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">
        {isExpanded ? summary : `${summary.slice(0, maxLength)}...`}
      </p>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {isExpanded ? (
          <>
            Show less <ChevronUp className="h-3 w-3" />
          </>
        ) : (
          <>
            Show more <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>
    </div>
  );
}
