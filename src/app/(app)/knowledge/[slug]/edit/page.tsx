"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getArticleBySlug, updateArticle } from "@/actions/knowledge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ArticleRenderer } from "@/components/knowledge/article-renderer";

type Article = Awaited<ReturnType<typeof getArticleBySlug>>;

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bodyPreview, setBodyPreview] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");

  useEffect(() => {
    loadArticle();
  }, [slug]);

  async function loadArticle() {
    try {
      const result = await getArticleBySlug(slug);
      if (!result) {
        router.push("/knowledge");
        return;
      }
      setArticle(result);
      setTitle(result.title);
      setSummary(result.summary || "");
      setBody(result.body);
      setCategory(result.category || "");
      setTags(result.tags?.join(", ") || "");
      setGoogleDriveUrl(result.googleDriveUrl || "");
      setStatus(result.status as "draft" | "published" | "archived");
    } catch (error) {
      console.error("Failed to load article:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const tagsList = tags
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const { slug: newSlug } = await updateArticle(slug, {
        title,
        summary: summary || undefined,
        body,
        category: category || undefined,
        tags: tagsList,
        googleDriveUrl: googleDriveUrl || undefined,
        status,
      });

      router.push(`/knowledge/${newSlug}`);
    } catch (error) {
      console.error("Failed to update article:", error);
      alert("Failed to update article");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!article) {
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/knowledge/${slug}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Article
      </Link>

      <h1 className="mb-6 text-2xl font-bold">Edit Article</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Summary (optional)
          </label>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
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
            <div className="min-h-[200px] rounded-md border border-input bg-muted/50 p-4">
              <ArticleRenderer content={body || "Nothing to preview"} />
            </div>
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={15}
              required
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
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
            <label className="mb-1 block text-sm font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "published" | "archived")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Tags (comma-separated)
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="fundraising, spring, events"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Google Drive URL (optional)
          </label>
          <input
            value={googleDriveUrl}
            onChange={(e) => setGoogleDriveUrl(e.target.value)}
            type="url"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://drive.google.com/..."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Link to related Google Drive document for reference
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "Saving..." : "Save Changes"}
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
