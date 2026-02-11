"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Calendar,
  Users,
  Lightbulb,
  Link2,
  ExternalLink,
  BookOpen,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { OnboardingGuide } from "@/types";
import type {
  OnboardingGuideContent,
  SourceUsed,
} from "@/actions/onboarding-guides";
import { generateGuide, publishGuideAsArticle } from "@/actions/onboarding-guides";
import type { PtaBoardPosition } from "@/types";

interface GuideContentProps {
  guide: OnboardingGuide;
  content: OnboardingGuideContent;
  sourcesUsed: SourceUsed[];
  positionLabel: string;
}

export function GuideContent({
  guide,
  content,
  sourcesUsed,
  positionLabel,
}: GuideContentProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["overview", "firstWeek"])
  );
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    await generateGuide(guide.position as PtaBoardPosition);
    window.location.reload();
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await publishGuideAsArticle(guide.id);
      alert("Guide published to Knowledge Base!");
    } catch (error) {
      alert("Failed to publish guide");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardContent className="pt-6">
          <p className="text-lg">{content.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Regenerate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="mr-2 h-4 w-4" />
              )}
              Publish to Knowledge Base
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overview Section */}
      <CollapsibleSection
        title="Overview"
        icon={<BookOpen className="h-5 w-5" />}
        expanded={expandedSections.has("overview")}
        onToggle={() => toggleSection("overview")}
      >
        <p className="whitespace-pre-wrap text-muted-foreground">
          {content.overview}
        </p>
      </CollapsibleSection>

      {/* Key Responsibilities */}
      <CollapsibleSection
        title="Key Responsibilities"
        icon={<CheckSquare className="h-5 w-5" />}
        expanded={expandedSections.has("responsibilities")}
        onToggle={() => toggleSection("responsibilities")}
      >
        <ul className="space-y-2">
          {content.keyResponsibilities.map((responsibility, i) => (
            <li key={i} className="flex items-start gap-2 text-muted-foreground">
              <span className="text-purple-500 mt-1">•</span>
              {responsibility}
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* First Week Checklist */}
      <CollapsibleSection
        title="First Week Checklist"
        icon={<CheckSquare className="h-5 w-5 text-green-500" />}
        expanded={expandedSections.has("firstWeek")}
        onToggle={() => toggleSection("firstWeek")}
      >
        <ul className="space-y-2">
          {content.firstWeekChecklist.map((task, i) => (
            <li key={i} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-muted-foreground">{task}</span>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* Monthly Calendar */}
      <CollapsibleSection
        title="Monthly Calendar"
        icon={<Calendar className="h-5 w-5 text-blue-500" />}
        expanded={expandedSections.has("calendar")}
        onToggle={() => toggleSection("calendar")}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.monthlyCalendar.map((month, i) => (
            <div key={i} className="rounded-lg border border-border p-4">
              <h4 className="font-medium text-sm mb-2">{month.month}</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {month.tasks.map((task, j) => (
                  <li key={j} className="flex items-start gap-1">
                    <span className="text-blue-500">•</span>
                    {task}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Important Contacts */}
      <CollapsibleSection
        title="Important Contacts"
        icon={<Users className="h-5 w-5 text-amber-500" />}
        expanded={expandedSections.has("contacts")}
        onToggle={() => toggleSection("contacts")}
      >
        <ul className="space-y-2">
          {content.importantContacts.map((contact, i) => (
            <li key={i} className="flex items-start gap-2 text-muted-foreground">
              <Users className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
              {contact}
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* Tips from Predecessors */}
      <CollapsibleSection
        title="Tips from Predecessors"
        icon={<Lightbulb className="h-5 w-5 text-yellow-500" />}
        expanded={expandedSections.has("tips")}
        onToggle={() => toggleSection("tips")}
      >
        <ul className="space-y-3">
          {content.tipsFromPredecessors.map((tip, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3"
            >
              <Lightbulb className="h-4 w-4 mt-0.5 text-yellow-500 flex-shrink-0" />
              <span className="text-sm">{tip}</span>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* Resources */}
      <CollapsibleSection
        title="Resources"
        icon={<Link2 className="h-5 w-5 text-green-500" />}
        expanded={expandedSections.has("resources")}
        onToggle={() => toggleSection("resources")}
      >
        <div className="space-y-3">
          {content.resources.map((resource, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{resource.title}</span>
                {resource.url && (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-500 hover:text-purple-600"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {resource.description}
              </p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Sources Used */}
      {sourcesUsed.length > 0 && (
        <CollapsibleSection
          title={`Sources Used (${sourcesUsed.length})`}
          icon={<BookOpen className="h-5 w-5 text-gray-500" />}
          expanded={expandedSections.has("sources")}
          onToggle={() => toggleSection("sources")}
        >
          <div className="space-y-2">
            {sourcesUsed.map((source, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                    source.type === "handoff_note"
                      ? "bg-amber-500/10 text-amber-500"
                      : source.type === "knowledge_article"
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-green-500/10 text-green-500"
                  }`}
                >
                  {source.type.replace("_", " ")}
                </span>
                <span>{source.title}</span>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-500 hover:text-purple-600"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Generated At */}
      {guide.generatedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Generated on{" "}
          {new Date(guide.generatedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {expanded && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
