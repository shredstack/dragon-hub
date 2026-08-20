"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  FileText,
  User,
  Trash2,
  Archive,
  Loader2,
  Undo2,
} from "lucide-react";
import {
  archiveEmailCampaign,
  deleteEmailCampaign,
  markCampaignUnsent,
} from "@/actions/email-campaigns";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { EmailCampaignStatus } from "@/types";
import { formatDateOnlyRange } from "@/lib/date-only";

interface CampaignData {
  id: string;
  title: string;
  weekStart: string;
  weekEnd: string;
  status: EmailCampaignStatus;
  creatorName: string | null;
  createdAt: string | null;
  sentAt: string | null;
  sectionCount: number;
}

interface CampaignListProps {
  campaigns: CampaignData[];
}

function formatDateRange(weekStart: string, weekEnd: string): string {
  return formatDateOnlyRange(weekStart, weekEnd, { month: "short" });
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

export function CampaignList({ campaigns }: CampaignListProps) {
  // Group campaigns by status
  const draftCampaigns = campaigns.filter((c) => c.status === "draft");
  const reviewCampaigns = campaigns.filter((c) => c.status === "review");
  const sentCampaigns = campaigns.filter((c) => c.status === "sent");

  return (
    <div className="space-y-8">
      {draftCampaigns.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Drafts</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {draftCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}

      {reviewCampaigns.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">In Review</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviewCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}

      {sentCampaigns.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Sent</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sentCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignData }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  // Both of these used to console.error and stop. A refused delete looked
  // exactly like a successful one — the spinner stopped, the dialog closed,
  // and the card was still sitting there — which is no way to find out that
  // the server said no.
  const { addToast } = useToast();

  // A sent campaign is the record of what the school was told and when, so the
  // server only allows archiving. Drafts are still just drafts.
  const isSent = Boolean(campaign.sentAt) || campaign.status === "sent";
  const canDelete = !isSent;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const ok = await confirm({
      title: `Delete "${campaign.title}"?`,
      description:
        "This draft has not been sent, so nothing is lost. It is removed along with its sections.",
      confirmLabel: "Delete draft",
    });
    if (!ok) return;

    setIsDeleting(true);
    try {
      await deleteEmailCampaign(campaign.id);
      addToast(`Deleted "${campaign.title}".`, "success");
      router.refresh();
    } catch (error) {
      addToast(
        error instanceof Error && error.message
          ? error.message
          : "That email couldn't be deleted.",
        "destructive"
      );
    } finally {
      setIsDeleting(false);
      closeConfirm();
    }
  }

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const ok = await confirm({
      title: `Archive "${campaign.title}"?`,
      description:
        "It comes off this list but stays in the database, so what went out is still on the record. You can restore it later.",
      confirmLabel: "Archive",
      tone: "default",
    });
    if (!ok) return;

    setIsDeleting(true);
    try {
      await archiveEmailCampaign(campaign.id);
      addToast(`Archived "${campaign.title}".`, "success");
      router.refresh();
    } catch (error) {
      addToast(
        error instanceof Error && error.message
          ? error.message
          : "That email couldn't be archived.",
        "destructive"
      );
    } finally {
      setIsDeleting(false);
      closeConfirm();
    }
  }

  /**
   * "Sent" is a bookmark someone ticked, not something the app watched happen,
   * so it has to be untickable — and until it is, this card offers Archive
   * where Delete would be.
   */
  async function handleMarkUnsent(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const ok = await confirm({
      title: `Mark "${campaign.title}" as not sent?`,
      description:
        "It goes back to the drafts list, and the record of who marked it sent and when is cleared. From there it can be edited, marked sent again, or deleted.",
      confirmLabel: "Mark as not sent",
      tone: "default",
    });
    if (!ok) return;

    setIsDeleting(true);
    try {
      await markCampaignUnsent(campaign.id);
      addToast(`"${campaign.title}" is a draft again.`, "success");
      router.refresh();
    } catch (error) {
      addToast(
        error instanceof Error && error.message
          ? error.message
          : "That email couldn't be marked unsent.",
        "destructive"
      );
    } finally {
      setIsDeleting(false);
      closeConfirm();
    }
  }

  return (
    <Card className="p-4 transition-colors hover:bg-muted/50">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Link href={`/emails/${campaign.id}`} className="flex-1 min-w-0">
          <h3 className="font-semibold line-clamp-2 hover:underline">
            {campaign.title}
          </h3>
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          {getStatusBadge(campaign.status)}
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="sr-only">Delete draft</span>
            </Button>
          ) : (
            /* Sent campaigns are part of the record, so archiving is the only
               way to clear them off this list — unless the send was ticked by
               mistake, which is what Mark not sent undoes. */
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground"
                onClick={handleMarkUnsent}
                disabled={isDeleting}
                title="Mark as not sent"
              >
                <Undo2 className="h-4 w-4" />
                <span className="sr-only">Mark as not sent</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground"
                onClick={handleArchive}
                disabled={isDeleting}
                title="Archive"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                <span className="sr-only">Archive</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <Link href={`/emails/${campaign.id}`}>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>
              {formatDateRange(campaign.weekStart, campaign.weekEnd)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>
              {campaign.sectionCount}{" "}
              {campaign.sectionCount === 1 ? "section" : "sections"}
            </span>
          </div>

          {campaign.creatorName && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{campaign.creatorName}</span>
            </div>
          )}
        </div>

        {campaign.sentAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sent {new Date(campaign.sentAt).toLocaleDateString()}
          </p>
        )}
      </Link>

      {confirmDialog}
    </Card>
  );
}
