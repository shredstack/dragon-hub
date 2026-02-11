"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Loader2, MapPin, Building2 } from "lucide-react";
import {
  getResourcesForPosition,
  type DisplayResource,
} from "@/actions/onboarding-resources";
import type { PtaBoardPosition } from "@/types";

interface OnboardingResourcesProps {
  position?: PtaBoardPosition;
}

// Category colors and icons
const categoryStyles: Record<string, { bg: string; text: string }> = {
  Training: { bg: "bg-purple-500/10", text: "text-purple-500" },
  Tools: { bg: "bg-green-500/10", text: "text-green-500" },
  Forms: { bg: "bg-amber-500/10", text: "text-amber-500" },
  Handbook: { bg: "bg-blue-500/10", text: "text-blue-500" },
  default: { bg: "bg-muted", text: "text-muted-foreground" },
};

// Source badge styles
const sourceStyles: Record<string, { bg: string; text: string; icon: typeof MapPin | null }> = {
  state: { bg: "bg-purple-500/10", text: "text-purple-500", icon: MapPin },
  district: { bg: "bg-orange-500/10", text: "text-orange-500", icon: Building2 },
  school: { bg: "", text: "", icon: null },
};

export function OnboardingResources({ position }: OnboardingResourcesProps) {
  const [resources, setResources] = useState<DisplayResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getResourcesForPosition(position)
      .then(setResources)
      .finally(() => setLoading(false));
  }, [position]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No resources have been added yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask your school admin to add onboarding resources.
        </p>
      </div>
    );
  }

  // Group resources by category
  const groupedResources = resources.reduce(
    (acc, resource) => {
      const category = resource.category || "General";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(resource);
      return acc;
    },
    {} as Record<string, DisplayResource[]>
  );

  return (
    <div className="space-y-4">
      {Object.entries(groupedResources).map(([category, categoryResources]) => {
        const style = categoryStyles[category] || categoryStyles.default;

        return (
          <div key={category}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
              >
                {category}
              </span>
            </div>
            <div className="space-y-2">
              {categoryResources.map((resource) => {
                const sourceStyle = sourceStyles[resource.source];
                const SourceIcon = sourceStyle?.icon;

                return (
                  <a
                    key={resource.id}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-dragon-blue-500 hover:bg-dragon-blue-500/5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium group-hover:text-dragon-blue-500">
                          {resource.title}
                        </p>
                        {resource.source !== "school" && SourceIcon && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs ${sourceStyle.bg} ${sourceStyle.text}`}
                          >
                            <SourceIcon className="h-3 w-3" />
                            {resource.source}
                          </span>
                        )}
                      </div>
                      {resource.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {resource.description}
                        </p>
                      )}
                    </div>
                    <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-dragon-blue-500" />
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
