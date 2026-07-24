"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getArticleBySlug, updateArticle } from "@/actions/knowledge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ArticleRenderer } from "@/components/knowledge/article-renderer";
import { TagPicker } from "@/components/ui/tag-picker";
import { AudiencePicker } from "@/components/knowledge/audience-picker";
import { ArticleAttachments } from "@/components/knowledge/article-attachments";
import { useToast } from "@/components/ui/toast";
import { actionErrorMessage } from "@/lib/action-error";
import { normalizeTags } from "@/lib/tags";
import {
  toAudienceGrants,
  type AudienceGrant,
} from "@/lib/knowledge-audience-shared";

type Article = Awaited<ReturnType<typeof getArticleBySlug>>;

interface EditArticleFormProps {
  /** The school's configured tags, from the PTA Board Hub's tag admin. */
  availableTags: { name: string; displayName: string }[];
}

/**
 * The edit form itself. Rendered only by `page.tsx`, which gates on
 * board/admin — so every control here (including the attachment uploader) is
 * shown to someone who can actually use it. The server actions re-check
 * authorization regardless; this keeps the UI honest.
 */
export function EditArticleForm({ availableTags }: EditArticleFormProps) {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const { addToast } = useToast();

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Shown inline above the buttons as well as in a toast. The toast is easy to
   * miss on a long form — the article body alone can outrun the viewport — and
   * this is the message that explains why the page didn't navigate away.
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bodyPreview, setBodyPreview] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [audiences, setAudiences] = useState<AudienceGrant[]>([]);

  useEffect(() => {
    loadArticle();
  }, [slug]);

  async function loadArticle() {
    setLoadError(null);
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
      // Normalized on load as well as on save: articles tagged through the old
      // free-text field can hold "Field Day", which wouldn't match the school's
      // "field day" in the picker.
      setTags(normalizeTags(result.tags));
      setGoogleDriveUrl(result.googleDriveUrl || "");
      setStatus(result.status as "draft" | "published" | "archived");
      setAudiences(toAudienceGrants(result.audiences));
    } catch (error) {
      console.error("Failed to load article:", error);
      setLoadError(
        actionErrorMessage(error, "Couldn't load this article for editing.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const { slug: newSlug } = await updateArticle(slug, {
        title,
        summary: summary || undefined,
        body,
        category: category || undefined,
        tags,
        googleDriveUrl: googleDriveUrl || undefined,
        status,
        audiences,
      });

      router.push(`/knowledge/${newSlug}`);
    } catch (error) {
      console.error("Failed to update article:", error);
      const message = actionErrorMessage(
        error,
        "Couldn't save your changes. Please try again."
      );
      setSaveError(message);
      addToast(message, "destructive");
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

  // Previously `return null` — a load failure rendered a blank page with no
  // way forward and no explanation.
  if (!article) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/knowledge/${slug}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Article
        </Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium">
            {loadError ?? "Couldn't load this article for editing."}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setLoading(true);
              loadArticle();
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
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

        <TagPicker
          value={tags}
          onChange={setTags}
          available={availableTags}
          helpText="Pick from the tags your board has configured, or type a new one."
        />

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

        <AudiencePicker value={audiences} onChange={setAudiences} />

        {saveError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm"
          >
            {saveError}
          </p>
        )}

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

      {/* Outside the form: uploads take effect immediately rather than waiting
          on Save, so an attachment can't be lost by navigating away.
          `canManage` is unconditional because the page is board-gated. */}
      <ArticleAttachments
        articleId={article.id}
        articleSlug={slug}
        canManage
      />
    </div>
  );
}
