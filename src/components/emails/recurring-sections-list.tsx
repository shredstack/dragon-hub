"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Loader2, Sparkles, Globe, Lock, ArrowUp, ArrowDown } from "lucide-react";
import {
  toggleRecurringSectionActive,
  seedDefaultRecurringSections,
} from "@/actions/email-recurring";
import { RecurringSectionEditor } from "./recurring-section-editor";
import type { EmailAudience, SectionPositionType } from "@/types";

interface RecurringSectionData {
  id: string;
  key: string;
  title: string;
  bodyTemplate: string;
  linkUrl: string | null;
  linkText: string | null;
  imageUrl: string | null;
  audience: EmailAudience;
  positionType: SectionPositionType;
  positionIndex: number;
  defaultSortOrder: number;
  active: boolean;
}

interface RecurringSectionsListProps {
  sections: RecurringSectionData[];
  showSeedButton?: boolean;
}

// Position label helper
function getPositionBadgeLabel(
  positionType: SectionPositionType,
  positionIndex: number
): string {
  if (positionType === "from_start") {
    const ordinals = ["1st", "2nd", "3rd", "4th", "5th"];
    return ordinals[positionIndex] || `${positionIndex + 1}th`;
  } else {
    if (positionIndex === 0) return "Last";
    const ordinals = ["", "2nd to last", "3rd to last", "4th to last", "5th to last"];
    return ordinals[positionIndex] || `${positionIndex + 1}th to last`;
  }
}

export function RecurringSectionsList({
  sections,
  showSeedButton,
}: RecurringSectionsListProps) {
  const router = useRouter();
  const [editingSection, setEditingSection] = useState<RecurringSectionData | null>(
    null
  );
  const [isSeeding, setIsSeeding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleSeed() {
    setIsSeeding(true);
    try {
      await seedDefaultRecurringSections();
      router.refresh();
    } catch (error) {
      console.error("Failed to seed sections:", error);
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleToggleActive(sectionId: string, active: boolean) {
    setTogglingId(sectionId);
    try {
      await toggleRecurringSectionActive(sectionId, active);
      router.refresh();
    } catch (error) {
      console.error("Failed to toggle section:", error);
    } finally {
      setTogglingId(null);
    }
  }

  if (showSeedButton && sections.length === 0) {
    return (
      <Button onClick={handleSeed} disabled={isSeeding}>
        {isSeeding ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Add Default Sections
      </Button>
    );
  }

  // Sort sections: from_start first (by positionIndex), then from_end (by positionIndex desc)
  const sortedSections = [...sections].sort((a, b) => {
    // from_start comes before from_end
    if (a.positionType !== b.positionType) {
      return a.positionType === "from_start" ? -1 : 1;
    }
    // Within same type, sort by positionIndex
    if (a.positionType === "from_start") {
      return a.positionIndex - b.positionIndex || a.defaultSortOrder - b.defaultSortOrder;
    } else {
      // from_end: higher positionIndex = earlier in list (e.g., "3rd to last" before "last")
      return b.positionIndex - a.positionIndex || a.defaultSortOrder - b.defaultSortOrder;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Recurring Sections ({sections.length})
        </h2>
      </div>

      <div className="space-y-3">
        {sortedSections.map((section) => (
          <Card key={section.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">
                    {section.title || `(${section.key})`}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {section.key}
                  </Badge>
                  {section.audience === "pta_only" ? (
                    <Badge variant="secondary" className="text-xs">
                      <Lock className="mr-1 h-3 w-3" />
                      PTA Only
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <Globe className="mr-1 h-3 w-3" />
                      All
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="text-xs border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  >
                    {section.positionType === "from_start" ? (
                      <ArrowDown className="mr-1 h-3 w-3" />
                    ) : (
                      <ArrowUp className="mr-1 h-3 w-3" />
                    )}
                    {getPositionBadgeLabel(section.positionType, section.positionIndex)}
                  </Badge>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2">
                  {section.bodyTemplate
                    .replace(/<[^>]+>/g, "")
                    .replace(/\{\{[^}]+\}\}/g, "[...]")}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {togglingId === section.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Switch
                      checked={section.active}
                      onCheckedChange={(checked) =>
                        handleToggleActive(section.id, checked)
                      }
                    />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {section.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingSection(section)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {editingSection && (
        <RecurringSectionEditor
          section={editingSection}
          onClose={() => setEditingSection(null)}
          onSave={() => {
            setEditingSection(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
