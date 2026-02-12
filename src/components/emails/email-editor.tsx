"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  Copy,
  Eye,
  Inbox,
  List,
} from "lucide-react";
import Link from "next/link";
import { SectionList } from "./section-list";
import { EmailPreview } from "./email-preview";
import { ContentInbox } from "./content-inbox";
import { ContentSuggestions } from "./content-suggestions";
import {
  generateEmailDraft,
  markCampaignSent,
  compileAndSaveEmailHtml,
  addEmailSection,
} from "@/actions/email-campaigns";
import type { EmailAudience, EmailCampaignStatus, EmailSectionType } from "@/types";
import type { ContentSuggestion } from "@/lib/ai/email-generator";

interface SectionData {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkText: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageLinkUrl: string | null;
  sectionType: EmailSectionType;
  recurringKey: string | null;
  audience: EmailAudience;
  sortOrder: number;
}

interface ContentItemData {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string | null;
  linkText: string | null;
  audience: EmailAudience;
  targetDate: string | null;
  submitterName: string | null;
  images: Array<{
    id: string;
    blobUrl: string;
    fileName: string;
  }>;
}

interface EmailEditorProps {
  campaign: {
    id: string;
    title: string;
    weekStart: string;
    weekEnd: string;
    status: EmailCampaignStatus;
    ptaHtml: string | null;
    schoolHtml: string | null;
  };
  sections: SectionData[];
  pendingContentItems: ContentItemData[];
  schoolName: string;
}

type MobileTab = "sections" | "preview" | "inbox";

export function EmailEditor({
  campaign,
  sections: initialSections,
  pendingContentItems: initialPendingItems,
  schoolName,
}: EmailEditorProps) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [pendingContentItems, setPendingContentItems] = useState(initialPendingItems);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileTab>("preview");
  const [previewAudience, setPreviewAudience] = useState<"pta_only" | "all">(
    "pta_only"
  );
  const [showInbox, setShowInbox] = useState(false);
  const [suggestions, setSuggestions] = useState<ContentSuggestion[]>([]);

  async function handleRegenerate() {
    if (
      !confirm(
        "This will replace all existing sections with AI-generated content. Continue?"
      )
    )
      return;

    setIsGenerating(true);
    try {
      const result = await generateEmailDraft(campaign.id);
      if (result?.suggestions) {
        setSuggestions(result.suggestions);
      }
      router.refresh();
    } catch (error) {
      console.error("Failed to regenerate:", error);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAddSuggestion(suggestion: ContentSuggestion) {
    const section = await addEmailSection(campaign.id, {
      title: suggestion.title,
      body: suggestion.suggestedBlurb || `<p>${suggestion.reason}</p>`,
      audience: "all",
      sectionType: "custom",
    });
    setSections((prev) => [...prev, section as SectionData]);
  }

  async function handleCompileHtml() {
    setIsCompiling(true);
    try {
      await compileAndSaveEmailHtml(campaign.id);
      router.refresh();
    } catch (error) {
      console.error("Failed to compile HTML:", error);
    } finally {
      setIsCompiling(false);
    }
  }

  async function handleMarkSent() {
    if (!confirm("Mark this email as sent?")) return;

    setIsMarkingSent(true);
    try {
      await markCampaignSent(campaign.id);
      router.push("/emails");
    } catch (error) {
      console.error("Failed to mark as sent:", error);
      setIsMarkingSent(false);
    }
  }

  function handleContentAdded(itemId: string, section: SectionData) {
    // Add the new section to the list
    setSections((prev) => [...prev, section]);
    // Remove the item from pending
    setPendingContentItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  function handleContentSkipped(itemId: string) {
    // Remove the item from pending
    setPendingContentItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  function getStatusBadge(status: EmailCampaignStatus) {
    switch (status) {
      case "draft":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            Draft
          </Badge>
        );
      case "review":
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            Review
          </Badge>
        );
      case "sent":
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            Sent
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/emails">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="font-semibold">{campaign.title}</h1>
            </div>
            {getStatusBadge(campaign.status)}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={isGenerating || campaign.status === "sent"}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Regenerate</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCompileHtml}
              disabled={isCompiling || sections.length === 0}
            >
              {isCompiling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Compile HTML</span>
            </Button>

            {/* Content Inbox toggle (desktop only) */}
            <Button
              variant={showInbox ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowInbox(!showInbox)}
              className="hidden lg:flex"
            >
              <Inbox className="h-4 w-4" />
              <span className="hidden sm:inline">Inbox</span>
              {pendingContentItems.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                  {pendingContentItems.length}
                </Badge>
              )}
            </Button>

            {campaign.status !== "sent" && (
              <Button
                size="sm"
                onClick={handleMarkSent}
                disabled={isMarkingSent}
              >
                {isMarkingSent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Mark Sent</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Tab Navigation */}
      <div className="flex-shrink-0 border-b border-border bg-muted/50 px-4 lg:hidden">
        <div className="flex gap-1 py-2">
          <Button
            variant={activeTab === "sections" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("sections")}
          >
            <List className="h-4 w-4" />
            Sections
          </Button>
          <Button
            variant={activeTab === "preview" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("preview")}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button
            variant={activeTab === "inbox" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("inbox")}
          >
            <Inbox className="h-4 w-4" />
            Inbox ({pendingContentItems.length})
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sections Panel (Left) */}
        <div
          className={`w-full flex-shrink-0 overflow-y-auto border-r border-border bg-muted/30 lg:block lg:w-80 ${
            activeTab === "sections" ? "block" : "hidden"
          }`}
        >
          <div className="p-3 space-y-3">
            {/* AI Suggestions */}
            {suggestions.length > 0 && campaign.status !== "sent" && (
              <ContentSuggestions
                suggestions={suggestions}
                onAddSuggestion={handleAddSuggestion}
                onDismiss={() => setSuggestions([])}
              />
            )}
          </div>
          <SectionList
            campaignId={campaign.id}
            sections={sections}
            onSectionsChange={setSections}
            isReadOnly={campaign.status === "sent"}
          />
        </div>

        {/* Preview Panel (Center) */}
        <div
          className={`min-w-0 flex-1 overflow-hidden bg-background lg:block ${
            activeTab === "preview" ? "block" : "hidden"
          }`}
        >
          <EmailPreview
            sections={sections}
            schoolName={schoolName}
            ptaHtml={campaign.ptaHtml}
            schoolHtml={campaign.schoolHtml}
            previewAudience={previewAudience}
            onAudienceChange={setPreviewAudience}
          />
        </div>

        {/* Content Inbox Panel (Right) - toggleable on desktop, tabbed on mobile */}
        <div
          className={`w-full flex-shrink-0 overflow-y-auto border-l border-border bg-muted/30 lg:w-80 ${
            activeTab === "inbox" ? "block lg:hidden" : "hidden"
          } ${showInbox ? "lg:block" : "lg:hidden"}`}
        >
          <ContentInbox
            campaignId={campaign.id}
            items={pendingContentItems}
            isReadOnly={campaign.status === "sent"}
            onContentAdded={handleContentAdded}
            onContentSkipped={handleContentSkipped}
          />
        </div>
      </div>
    </div>
  );
}
