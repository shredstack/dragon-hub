"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  Heading,
  RefreshCw,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { SectionList } from "./section-list";
import { EmailPreview } from "./email-preview";
import { ContentInbox } from "./content-inbox";
import { EmailHeaderEditor, type CampaignHeader } from "./email-header-editor";
import { EmailReviewPanel } from "./email-review-panel";
import {
  markCampaignSent,
  markCampaignUnsent,
  compileAndSaveEmailHtml,
  reviewEmailDraft,
  syncRelevantContent,
} from "@/actions/email-campaigns";
import type { EmailImagePosition } from "@/lib/email/image-position";
import type { EmailImageWidth } from "@/lib/email/image-width";
import type { EmailAudience, EmailCampaignStatus, EmailSectionType } from "@/types";
import type { EmailReviewResult } from "@/lib/ai/email-review";

interface SectionData {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkText: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageLinkUrl: string | null;
  imagePosition: EmailImagePosition;
  imageWidth: EmailImageWidth;
  sectionType: EmailSectionType;
  recurringKey: string | null;
  audience: EmailAudience;
  sortOrder: number;
  sourceContentItemId: string | null;
}

interface ContentItemData {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string | null;
  linkText: string | null;
  audience: EmailAudience;
  startDate: string;
  endDate: string;
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
    headerHtml: string | null;
    headerImageUrl: string | null;
    headerImageAlt: string | null;
    headerImageWidth: EmailImageWidth;
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
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [isCompiling, setIsCompiling] = useState(false);
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileTab>("preview");
  const [previewAudience, setPreviewAudience] = useState<"pta_only" | "all">(
    "pta_only"
  );
  const [showInbox, setShowInbox] = useState(false);

  const [header, setHeader] = useState<CampaignHeader>({
    headerHtml: campaign.headerHtml,
    headerImageUrl: campaign.headerImageUrl,
    headerImageAlt: campaign.headerImageAlt,
    headerImageWidth: campaign.headerImageWidth,
  });
  const [showHeaderEditor, setShowHeaderEditor] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [showReview, setShowReview] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState<EmailReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  /**
   * Pulls in anything submitted since this email was created. Deliberately
   * additive — there is no path here that rewrites a section the secretary has
   * been editing.
   */
  async function handleSyncContent() {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const { added } = await syncRelevantContent(campaign.id);
      setSyncMessage(
        added === 0
          ? "Nothing new — everything submitted for this week is already here."
          : `Added ${added} new item${added === 1 ? "" : "s"}.`
      );
      router.refresh();
    } catch (error) {
      console.error("Failed to check for new content:", error);
      setSyncMessage("Couldn't check for new content. Try again.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  }

  async function handleReview() {
    setShowReview(true);
    setIsReviewing(true);
    setReviewError(null);
    setReview(null);
    try {
      setReview(await reviewEmailDraft(campaign.id));
    } catch (error) {
      console.error("Failed to review draft:", error);
      setReviewError(
        error instanceof Error
          ? error.message
          : "The review didn't come back. Try again."
      );
    } finally {
      setIsReviewing(false);
    }
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
    const ok = await confirm({
      title: "Mark this email as sent?",
      description:
        "It becomes part of the school's record of what went out, and from then on can only be archived — not deleted.",
      confirmLabel: "Mark as sent",
      tone: "default",
    });
    if (!ok) return;
    closeConfirm();

    setIsMarkingSent(true);
    try {
      await markCampaignSent(campaign.id);
      router.push("/emails");
    } catch (error) {
      console.error("Failed to mark as sent:", error);
      setIsMarkingSent(false);
    }
  }

  /**
   * The other half of "Mark Sent". Nothing observed the send — a board member
   * ticked a box — so ticking it wrongly must be undoable, and while it stands
   * the email can only be archived, never deleted.
   */
  async function handleMarkUnsent() {
    const ok = await confirm({
      title: "Mark this email as not sent?",
      description:
        "It goes back to being a draft, and the record of who marked it sent and when is cleared. You can edit it and mark it sent again, or delete it from the email list.",
      confirmLabel: "Mark as not sent",
      tone: "default",
    });
    if (!ok) return;
    closeConfirm();

    setIsMarkingSent(true);
    try {
      await markCampaignUnsent(campaign.id);
      router.refresh();
    } catch (error) {
      console.error("Failed to mark as not sent:", error);
    } finally {
      setIsMarkingSent(false);
    }
  }

  /**
   * Which submissions this email already has a section for. Derived from the
   * live section list rather than handed down from the server, so deleting a
   * section offers it back immediately and adding one stops offering it —
   * neither of which survives a `router.refresh()` into component state.
   */
  const includedItemIds = useMemo(
    () =>
      new Set(
        sections
          .map((s) => s.sourceContentItemId)
          .filter((id): id is string => Boolean(id))
      ),
    [sections]
  );

  function handleContentAdded(_itemId: string, section: SectionData) {
    // The server hands back the existing section when the item is already in
    // this email, so add it only if it isn't in the list yet. The item stays
    // in the inbox either way — the inbox is what arrived this week, not a
    // queue that empties.
    setSections((prev) =>
      prev.some((s) => s.id === section.id) ? prev : [...prev, section]
    );
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
        {/* Wraps rather than overflows: five icon buttons, a back arrow, the
            title and a status badge do not fit one phone-width row. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/emails">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="min-w-0 truncate font-semibold">{campaign.title}</h1>
            <div className="flex-shrink-0">{getStatusBadge(campaign.status)}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHeaderEditor(true)}
              disabled={campaign.status === "sent"}
            >
              <Heading className="h-4 w-4" />
              <span className="hidden sm:inline">Header</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncContent}
              disabled={isSyncing || campaign.status === "sent"}
              title="Pull in anything submitted since this email was created"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Check submissions</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReview}
              disabled={isReviewing || sections.length === 0}
              title="Ask for readability suggestions — nothing is changed for you"
            >
              {isReviewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Review</span>
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

            {campaign.status === "sent" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkUnsent}
                disabled={isMarkingSent}
              >
                {isMarkingSent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Mark Not Sent</span>
              </Button>
            ) : (
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

        {syncMessage && (
          <p className="mt-2 text-xs text-muted-foreground">{syncMessage}</p>
        )}
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
            header={header}
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
            includedItemIds={includedItemIds}
            isReadOnly={campaign.status === "sent"}
            onContentAdded={handleContentAdded}
            onContentSkipped={handleContentSkipped}
          />
        </div>
      </div>

      {showHeaderEditor && (
        <EmailHeaderEditor
          campaignId={campaign.id}
          header={header}
          onClose={() => setShowHeaderEditor(false)}
          onSave={setHeader}
        />
      )}

      {showReview && (
        <EmailReviewPanel
          result={review}
          isReviewing={isReviewing}
          error={reviewError}
          onClose={() => setShowReview(false)}
        />
      )}

      {confirmDialog}
    </div>
  );
}
