import { CheckCircle, Lightbulb, MessageSquare } from "lucide-react";

interface RichSummaryProps {
  summary: string | null;
  keyItems: string[] | null;
  actionItems: string[] | null;
  improvements: string[] | null;
}

export function RichSummary({
  summary,
  keyItems,
  actionItems,
  improvements,
}: RichSummaryProps) {
  const hasRichContent =
    (keyItems && keyItems.length > 0) ||
    (actionItems && actionItems.length > 0) ||
    (improvements && improvements.length > 0);

  if (!summary && !hasRichContent) {
    return (
      <p className="text-sm text-muted-foreground">
        No AI summary available yet. Click &quot;Regenerate Analysis&quot; to generate one.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {summary}
          </p>
        </div>
      )}

      {keyItems && keyItems.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" />
            Key Items Discussed
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {keyItems.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/50" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionItems && actionItems.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle className="h-4 w-4 text-success" />
            Action Items
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {actionItems.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success/50" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {improvements && improvements.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Suggestions for Next Time
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {improvements.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500/50" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
