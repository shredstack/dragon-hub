"use client";

import { useState } from "react";
import { publishArticle } from "@/actions/knowledge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { actionErrorMessage } from "@/lib/action-error";
import { useRouter } from "next/navigation";

interface PublishButtonProps {
  slug: string;
}

export function PublishButton({ slug }: PublishButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handlePublish() {
    setLoading(true);
    try {
      await publishArticle(slug);
      router.refresh();
      addToast("Article published.", "success");
    } catch (error) {
      console.error("Failed to publish article:", error);
      addToast(
        actionErrorMessage(
          error,
          "Couldn't publish this article. Please try again."
        ),
        "destructive"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handlePublish} disabled={loading} size="sm">
      {loading ? "Publishing..." : "Publish"}
    </Button>
  );
}
