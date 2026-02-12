"use client";

import { useState, useEffect } from "react";
import {
  ExternalLink,
  Loader2,
  MapPin,
  Building2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  getGroupedResourcesForPosition,
  type DisplayResource,
  type GroupedResourcesResponse,
} from "@/actions/onboarding-resources";
import type { PtaBoardPosition } from "@/types";

interface OnboardingResourcesProps {
  position?: PtaBoardPosition;
}

// Category colors and icons
const categoryStyles: Record<string, { bg: string; text: string }> = {
  "PTA Board Role Specific Trainings": {
    bg: "bg-purple-500/10",
    text: "text-purple-500",
  },
  Handbooks: { bg: "bg-blue-500/10", text: "text-blue-500" },
  Tools: { bg: "bg-green-500/10", text: "text-green-500" },
  "General Trainings": { bg: "bg-amber-500/10", text: "text-amber-500" },
  default: { bg: "bg-muted", text: "text-muted-foreground" },
};

function ResourceList({ resources }: { resources: DisplayResource[] }) {
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
              {categoryResources.map((resource) => (
                <a
                  key={resource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-dragon-blue-500 hover:bg-dragon-blue-500/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium group-hover:text-dragon-blue-500">
                      {resource.title}
                    </p>
                    {resource.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {resource.description}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-dragon-blue-500" />
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  iconColor,
  resources,
  defaultOpen = false,
}: {
  title: string;
  icon: typeof MapPin;
  iconColor: string;
  resources: DisplayResource[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (resources.length === 0) return null;

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="flex-1 text-sm font-medium">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {resources.length} resource{resources.length !== 1 ? "s" : ""}
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-border p-3">
          <ResourceList resources={resources} />
        </div>
      )}
    </div>
  );
}

export function OnboardingResources({ position }: OnboardingResourcesProps) {
  const [data, setData] = useState<GroupedResourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getGroupedResourcesForPosition(position)
      .then(setData)
      .finally(() => setLoading(false));
  }, [position]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const hasSchoolResources = data.school.length > 0;
  const hasDistrictResources = data.district.length > 0;
  const hasStateResources = data.state.length > 0;
  const hasAnyResources =
    hasSchoolResources || hasDistrictResources || hasStateResources;

  if (!hasAnyResources) {
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

  return (
    <div className="space-y-4">
      {/* School Resources - Always visible, not collapsible */}
      {hasSchoolResources && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Your School&apos;s Resources
          </h3>
          <ResourceList resources={data.school} />
        </div>
      )}

      {/* District Resources - Collapsible */}
      {hasDistrictResources && (
        <CollapsibleSection
          title={`${data.districtName} Resources`}
          icon={Building2}
          iconColor="text-orange-500"
          resources={data.district}
        />
      )}

      {/* State Resources - Collapsible */}
      {hasStateResources && (
        <CollapsibleSection
          title={`${data.stateName} State Resources`}
          icon={MapPin}
          iconColor="text-purple-500"
          resources={data.state}
        />
      )}
    </div>
  );
}
