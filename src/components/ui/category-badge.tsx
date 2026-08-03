import { Badge } from "@/components/ui/badge";
import { categoryLabel, type CategorySet } from "@/lib/categories";

/**
 * Renders a stored category value as its label.
 *
 * Replaces the `SET[value as keyof typeof SET] ?? value` expression that was
 * copy-pasted across five screens — including the `??` fallback, which is what
 * keeps a legacy or AI-invented value readable instead of blank.
 *
 * Deliberately not a client component: several callers are server components
 * that only wanted a badge.
 */
export function CategoryBadge({
  set,
  value,
  className,
}: {
  set: CategorySet;
  value: string | null | undefined;
  className?: string;
}) {
  const label = categoryLabel(set, value);
  if (!label) return null;
  return (
    <Badge variant="secondary" className={className}>
      {label}
    </Badge>
  );
}
