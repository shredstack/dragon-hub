"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteArticle } from "@/actions/knowledge";
import { useRouter } from "next/navigation";

interface DeleteArticleButtonProps {
  articleSlug: string;
  articleTitle: string;
  redirectAfterDelete?: boolean;
}

export function DeleteArticleButton({
  articleSlug,
  articleTitle,
  redirectAfterDelete = false,
}: DeleteArticleButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteArticle(articleSlug);
      if (redirectAfterDelete) {
        router.push("/knowledge");
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to delete article:", error);
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted/80"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-muted-foreground hover:text-destructive"
      title={`Delete "${articleTitle}"`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
