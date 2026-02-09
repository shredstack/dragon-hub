"use client";

import { useState } from "react";
import { publishArticle } from "@/actions/knowledge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface PublishButtonProps {
  slug: string;
}

export function PublishButton({ slug }: PublishButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handlePublish() {
    setLoading(true);
    try {
      await publishArticle(slug);
      router.refresh();
    } catch (error) {
      console.error("Failed to publish article:", error);
      alert("Failed to publish article");
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
