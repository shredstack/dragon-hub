"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandableSummaryProps {
  summary: string | null;
  /** Character budget for the collapsed view. Ignored when `clampLines` is set. */
  maxLength?: number;
  /**
   * Collapse to a fixed number of lines instead of a character count. Better
   * for prose in a card, where a character cut lands mid-word and the number
   * of lines that actually fit depends on the viewport.
   */
  clampLines?: 2 | 3 | 4;
  className?: string;
}

// Tailwind only emits classes it can see written out, so no template strings.
const CLAMP_CLASS = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
} as const;

export function ExpandableSummary({
  summary,
  maxLength = 100,
  clampLines,
  className,
}: ExpandableSummaryProps) {
  if (!summary) {
    return <span className="text-muted-foreground">No summary</span>;
  }

  if (clampLines) {
    return (
      <ClampedSummary
        summary={summary}
        clampLines={clampLines}
        className={className}
      />
    );
  }

  return (
    <TruncatedSummary
      summary={summary}
      maxLength={maxLength}
      className={className}
    />
  );
}

function TruncatedSummary({
  summary,
  maxLength,
  className,
}: {
  summary: string;
  maxLength: number;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (summary.length <= maxLength) {
    return <span className={cn("text-muted-foreground", className)}>{summary}</span>;
  }

  return (
    <div className="space-y-1">
      <p className={cn("text-muted-foreground", className)}>
        {isExpanded ? summary : `${summary.slice(0, maxLength)}...`}
      </p>
      <ToggleButton isExpanded={isExpanded} onToggle={() => setIsExpanded((v) => !v)} />
    </div>
  );
}

function ClampedSummary({
  summary,
  clampLines,
  className,
}: {
  summary: string;
  clampLines: 2 | 3 | 4;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Whether the text overflows its clamp depends on the rendered width, so it
  // can only be measured — and only while collapsed, since an expanded element
  // never overflows. The last collapsed measurement is what keeps "Show less"
  // on screen after expanding.
  useEffect(() => {
    const el = textRef.current;
    if (!el || isExpanded) return;

    const measure = () => setIsClamped(el.scrollHeight - el.clientHeight > 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [summary, isExpanded]);

  return (
    <div className="space-y-1">
      <p
        ref={textRef}
        className={cn(
          "whitespace-pre-wrap text-muted-foreground",
          !isExpanded && CLAMP_CLASS[clampLines],
          className
        )}
      >
        {summary}
      </p>
      {isClamped && (
        <ToggleButton
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((v) => !v)}
        />
      )}
    </div>
  );
}

function ToggleButton({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
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
  );
}
