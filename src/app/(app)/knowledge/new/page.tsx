"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createArticle } from "@/actions/knowledge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export default function NewKnowledgeArticlePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const tagsStr = fd.get("tags") as string;
    const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [];

    await createArticle({
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      googleDriveUrl: fd.get("googleDriveUrl") as string,
      category: fd.get("category") as string,
      tags,
      schoolYear: (fd.get("schoolYear") as string) || undefined,
    });

    router.push("/knowledge");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Add Knowledge Article</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input name="title" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea name="description" rows={3} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Google Drive URL</label>
          <input name="googleDriveUrl" type="url" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="https://drive.google.com/..." />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <select name="category" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Select category</option>
            {KNOWLEDGE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tags (comma-separated)</label>
          <input name="tags" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="fundraising, spring, 2025" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">School Year (optional)</label>
          <input name="schoolYear" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="2025-2026" />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating..." : "Create Article"}
        </Button>
      </form>
    </div>
  );
}
