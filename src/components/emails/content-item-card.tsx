"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Link as LinkIcon, Calendar, User, Loader2 } from "lucide-react";
import { deleteContentItem } from "@/actions/email-content";
import type { EmailAudience, EmailContentStatus } from "@/types";

interface ContentItemData {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string | null;
  linkText: string | null;
  audience: EmailAudience;
  targetDate: string | null;
  status: EmailContentStatus;
  submitterName: string | null;
  createdAt: string | null;
  images: Array<{
    id: string;
    blobUrl: string;
    fileName: string;
  }>;
}

interface ContentItemCardProps {
  item: ContentItemData;
  showActions?: boolean;
}

function getStatusBadge(status: EmailContentStatus) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          Pending
        </Badge>
      );
    case "included":
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          Included
        </Badge>
      );
    case "skipped":
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-800">
          Skipped
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getAudienceBadge(audience: EmailAudience) {
  if (audience === "pta_only") {
    return (
      <Badge variant="outline" className="text-xs">
        PTA Only
      </Badge>
    );
  }
  return null;
}

export function ContentItemCard({ item, showActions }: ContentItemCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this content item?")) return;

    setIsDeleting(true);
    try {
      await deleteContentItem(item.id);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete:", error);
      setIsDeleting(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-semibold">{item.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {getAudienceBadge(item.audience)}
          {getStatusBadge(item.status)}
        </div>
      </div>

      {item.description && (
        <p className="mb-3 text-sm text-muted-foreground line-clamp-3">
          {item.description}
        </p>
      )}

      {item.images.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {item.images.slice(0, 3).map((image) => (
            <img
              key={image.id}
              src={image.blobUrl}
              alt={image.fileName}
              className="h-16 w-16 rounded-md object-cover"
            />
          ))}
          {item.images.length > 3 && (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
              +{item.images.length - 3}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {item.linkUrl && (
          <div className="flex items-center gap-1">
            <LinkIcon className="h-3 w-3" />
            <span className="truncate max-w-[150px]">{item.linkUrl}</span>
          </div>
        )}
        {item.targetDate && (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{new Date(item.targetDate).toLocaleDateString()}</span>
          </div>
        )}
        {item.submitterName && (
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{item.submitterName}</span>
          </div>
        )}
      </div>

      {showActions && item.status === "pending" && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-600 hover:text-red-700"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
