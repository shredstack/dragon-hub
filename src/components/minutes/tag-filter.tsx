"use client";

import { Badge } from "@/components/ui/badge";

interface Tag {
  name: string;
  displayName: string;
  usageCount: number;
}

interface TagFilterProps {
  tags: Tag[];
  selectedTags: string[];
  onTagToggle: (tagName: string) => void;
  onClearAll: () => void;
}

export function TagFilter({
  tags,
  selectedTags,
  onTagToggle,
  onClearAll,
}: TagFilterProps) {
  if (tags.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Filter by Topic
        </span>
        {selectedTags.length > 0 && (
          <button
            onClick={onClearAll}
            className="text-xs text-primary hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge
            key={tag.name}
            variant={selectedTags.includes(tag.name) ? "default" : "outline"}
            className="cursor-pointer transition-colors hover:bg-muted"
            onClick={() => onTagToggle(tag.name)}
          >
            {tag.displayName}
            <span className="ml-1 text-xs opacity-60">({tag.usageCount})</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
