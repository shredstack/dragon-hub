"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Loader2, User, Calendar, Link as LinkIcon } from "lucide-react";
import { includeContentInCampaign, skipContentItem } from "@/actions/email-content";
import type { EmailAudience } from "@/types";

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

interface SectionData {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkText: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageLinkUrl: string | null;
  sectionType: string;
  recurringKey: string | null;
  audience: EmailAudience;
  sortOrder: number;
}

interface ContentInboxProps {
  campaignId: string;
  items: ContentItemData[];
  isReadOnly?: boolean;
  onContentAdded?: (itemId: string, section: SectionData) => void;
  onContentSkipped?: (itemId: string) => void;
}

export function ContentInbox({
  campaignId,
  items,
  isReadOnly,
  onContentAdded,
  onContentSkipped,
}: ContentInboxProps) {
  return (
    <div className="p-4">
      <h2 className="mb-4 font-semibold">Content Inbox ({items.length})</h2>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No pending content items
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ContentInboxItem
              key={item.id}
              item={item}
              campaignId={campaignId}
              isReadOnly={isReadOnly}
              onContentAdded={onContentAdded}
              onContentSkipped={onContentSkipped}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ContentInboxItemProps {
  item: ContentItemData;
  campaignId: string;
  isReadOnly?: boolean;
  onContentAdded?: (itemId: string, section: SectionData) => void;
  onContentSkipped?: (itemId: string) => void;
}

function ContentInboxItem({
  item,
  campaignId,
  isReadOnly,
  onContentAdded,
  onContentSkipped,
}: ContentInboxItemProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  async function handleAdd() {
    setIsAdding(true);
    try {
      const section = await includeContentInCampaign(item.id, campaignId);
      onContentAdded?.(item.id, section as SectionData);
    } catch (error) {
      console.error("Failed to add content:", error);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleSkip() {
    setIsSkipping(true);
    try {
      await skipContentItem(item.id);
      onContentSkipped?.(item.id);
    } catch (error) {
      console.error("Failed to skip content:", error);
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium line-clamp-2">{item.title}</h3>
        {item.audience === "pta_only" && (
          <Badge variant="outline" className="text-xs flex-shrink-0">
            PTA Only
          </Badge>
        )}
      </div>

      {item.description && (
        <p className="mb-2 text-xs text-muted-foreground line-clamp-2">
          {item.description}
        </p>
      )}

      {item.images.length > 0 && (
        <div className="mb-2 flex gap-1">
          {item.images.slice(0, 2).map((img) => (
            <img
              key={img.id}
              src={img.blobUrl}
              alt={img.fileName}
              className="h-10 w-10 rounded object-cover"
            />
          ))}
          {item.images.length > 2 && (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs">
              +{item.images.length - 2}
            </div>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {item.submitterName && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {item.submitterName}
          </span>
        )}
        {item.targetDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(item.targetDate).toLocaleDateString()}
          </span>
        )}
        {item.linkUrl && (
          <span className="flex items-center gap-1">
            <LinkIcon className="h-3 w-3" />
            Link
          </span>
        )}
      </div>

      {!isReadOnly && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleAdd}
            disabled={isAdding || isSkipping}
            className="flex-1"
          >
            {isAdding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSkip}
            disabled={isAdding || isSkipping}
          >
            {isSkipping ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
