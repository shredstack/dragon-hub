"use client";

import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface TagBadgeProps {
  tag: string;
  onRemove?: () => void;
  onClick?: () => void;
  selected?: boolean;
  size?: "sm" | "md";
}

export function TagBadge({
  tag,
  onRemove,
  onClick,
  selected = false,
  size = "md",
}: TagBadgeProps) {
  const sizeClasses =
    size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";

  return (
    <Badge
      variant={selected ? "default" : "secondary"}
      className={`${sizeClasses} ${onClick ? "cursor-pointer hover:bg-muted/80" : ""}`}
      onClick={onClick}
    >
      {tag}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:text-destructive"
          aria-label={`Remove ${tag} tag`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
