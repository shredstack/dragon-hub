"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, User, Trash2, Loader2 } from "lucide-react";
import { deleteEmailCampaign } from "@/actions/email-campaigns";
import type { EmailCampaignStatus } from "@/types";

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
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
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

  const canDelete = campaign.status !== "sent";

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Delete "${campaign.title}"? This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      await deleteEmailCampaign(campaign.id);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete campaign:", error);
    } finally {
      setIsDeleting(false);
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
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="sr-only">Delete</span>
            </Button>
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
    </Card>
  );
}
