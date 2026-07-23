"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createArticle } from "@/actions/knowledge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { AudiencePicker } from "@/components/knowledge/audience-picker";
import type { AudienceGrant } from "@/lib/knowledge-audience-shared";

export default function NewKnowledgeArticlePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [bodyPreview, setBodyPreview] = useState(false);
  const [body, setBody] = useState("");
  // Starts empty on purpose: a new article is board-only until someone decides
  // otherwise. See src/lib/knowledge-audience.ts.
  const [audiences, setAudiences] = useState<AudienceGrant[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const fd = new FormData(e.currentTarget);
      const tagsStr = fd.get("tags") as string;
      const tags = tagsStr
        ? tagsStr
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      await createArticle({
        title: fd.get("title") as string,
        summary: (fd.get("summary") as string) || undefined,
        body: fd.get("body") as string,
        category: (fd.get("category") as string) || undefined,
        tags,
        googleDriveUrl: (fd.get("googleDriveUrl") as string) || undefined,
        schoolYear: (fd.get("schoolYear") as string) || undefined,
        status: "draft",
        audiences,
      });

      router.push("/knowledge");
    } catch (error) {
      console.error("Failed to create article:", error);
      alert("Failed to create article");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Create Knowledge Article</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Title *</label>
          <input
            name="title"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Summary (optional)
          </label>
          <input
            name="summary"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Brief description of the article"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium">Content (Markdown) *</label>
            <button
              type="button"
              onClick={() => setBodyPreview(!bodyPreview)}
              className="text-xs text-primary hover:underline"
            >
              {bodyPreview ? "Edit" : "Preview"}
            </button>
          </div>
          {bodyPreview ? (
            <div className="min-h-[200px] rounded-md border border-input bg-muted p-3 text-sm">
              <pre className="whitespace-pre-wrap">{body || "Nothing to preview"}</pre>
            </div>
          ) : (
            <textarea
              name="body"
              rows={10}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Write your article content in Markdown..."
            />
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Supports Markdown formatting (headers, lists, bold, italics, links)
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <select
              name="category"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select category</option>
              {KNOWLEDGE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              School Year
            </label>
            <input
              name="schoolYear"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="2025-2026"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Tags (comma-separated)
          </label>
          <input
            name="tags"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="fundraising, spring, events"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Google Drive URL (optional)
          </label>
          <input
            name="googleDriveUrl"
            type="url"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://drive.google.com/..."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Link to related Google Drive document for reference
          </p>
        </div>

        <AudiencePicker value={audiences} onChange={setAudiences} />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Creating..." : "Create as Draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
