"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Check, FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMinutesById } from "@/actions/minutes";
import {
  extractFromMinutes,
  saveExtractedArticles,
} from "@/actions/knowledge";
import { ArticleRenderer } from "@/components/knowledge/article-renderer";

type Minutes = Awaited<ReturnType<typeof getMinutesById>>;

interface ExtractedArticle {
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  confidence: "high" | "medium" | "low";
  selected: boolean;
}

export default function ExtractKnowledgePage() {
  const router = useRouter();
  const params = useParams();
  const minutesId = params.minutesId as string;

  const [minutes, setMinutes] = useState<Minutes | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [articles, setArticles] = useState<ExtractedArticle[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMinutes();
  }, [minutesId]);

  async function loadMinutes() {
    try {
      const result = await getMinutesById(minutesId);
      if (!result) {
        router.push("/minutes");
        return;
      }
      setMinutes(result);
    } catch (err) {
      console.error("Failed to load minutes:", err);
      setError("Failed to load minutes");
    } finally {
      setLoading(false);
    }
  }

  async function handleExtract() {
    setExtracting(true);
    setError(null);

    try {
      const result = await extractFromMinutes(minutesId);
      setArticles(
        result.articles.map((a) => ({
          ...a,
          selected: a.confidence !== "low",
        }))
      );
      setSkipped(result.skipped);
    } catch (err) {
      console.error("Extraction failed:", err);
      setError("Failed to extract knowledge. Please try again.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    const selectedArticles = articles.filter((a) => a.selected);
    if (selectedArticles.length === 0) {
      alert("Please select at least one article to save.");
      return;
    }

    setSaving(true);

    try {
      await saveExtractedArticles(
        minutesId,
        selectedArticles.map((a) => ({
          title: a.title,
          summary: a.summary,
          body: a.body,
          category: a.category,
          tags: a.tags,
        }))
      );
      router.push("/knowledge");
    } catch (err) {
      console.error("Failed to save articles:", err);
      setError("Failed to save articles. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggleArticle(index: number) {
    setArticles((prev) =>
      prev.map((a, i) => (i === index ? { ...a, selected: !a.selected } : a))
    );
  }

  function updateArticle(
    index: number,
    updates: Partial<Omit<ExtractedArticle, "selected" | "confidence">>
  ) {
    setArticles((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...updates } : a))
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!minutes) {
    return null;
  }

  const selectedCount = articles.filter((a) => a.selected).length;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/minutes/${minutesId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Minutes
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Extract Knowledge Articles</h1>
        <p className="text-muted-foreground">
          Use AI to extract valuable knowledge from meeting minutes
        </p>
      </div>

      {/* Minutes Info */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-1 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">{minutes.fileName}</h2>
            {minutes.meetingDate && (
              <p className="text-sm text-muted-foreground">
                Meeting Date:{" "}
                {new Date(minutes.meetingDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
            {minutes.aiSummary && (
              <p className="mt-2 text-sm">{minutes.aiSummary}</p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {articles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">
            Ready to Extract Knowledge
          </h3>
          <p className="mb-4 text-muted-foreground">
            AI will analyze the meeting minutes and suggest knowledge articles
            to create.
          </p>
          <Button onClick={handleExtract} disabled={extracting}>
            {extracting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Extracting...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Extract Knowledge
              </>
            )}
          </Button>
        </div>
      ) : (
        <>
          {/* Extracted Articles */}
          <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Extracted Articles ({articles.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedCount} selected
              </p>
            </div>

            <div className="space-y-4">
              {articles.map((article, index) => (
                <div
                  key={index}
                  className={`rounded-lg border bg-card transition-colors ${
                    article.selected
                      ? "border-primary"
                      : "border-border opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3 p-4">
                    <button
                      onClick={() => toggleArticle(index)}
                      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        article.selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {article.selected && <Check className="h-3 w-3" />}
                    </button>

                    <div className="flex-1">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{article.title}</h3>
                        <ConfidenceBadge confidence={article.confidence} />
                      </div>
                      <p className="mb-2 text-sm text-muted-foreground">
                        {article.summary}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{article.category}</Badge>
                        {article.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                        <button
                          onClick={() =>
                            setExpandedArticle(
                              expandedArticle === index ? null : index
                            )
                          }
                          className="text-xs text-primary hover:underline"
                        >
                          {expandedArticle === index
                            ? "Hide content"
                            : "Show content"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {expandedArticle === index && (
                    <div className="border-t border-border p-4">
                      <div className="mb-4">
                        <label className="mb-1 block text-sm font-medium">
                          Title
                        </label>
                        <input
                          value={article.title}
                          onChange={(e) =>
                            updateArticle(index, { title: e.target.value })
                          }
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="mb-4">
                        <label className="mb-1 block text-sm font-medium">
                          Summary
                        </label>
                        <input
                          value={article.summary}
                          onChange={(e) =>
                            updateArticle(index, { summary: e.target.value })
                          }
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Content (Markdown)
                        </label>
                        <textarea
                          value={article.body}
                          onChange={(e) =>
                            updateArticle(index, { body: e.target.value })
                          }
                          rows={10}
                          className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                        <details className="rounded-md border border-border">
                          <summary className="cursor-pointer p-2 text-sm text-muted-foreground hover:bg-muted">
                            Preview
                          </summary>
                          <div className="border-t border-border p-4">
                            <ArticleRenderer content={article.body} />
                          </div>
                        </details>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Skipped Topics */}
          {skipped.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                Skipped Topics
              </h3>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {skipped.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="outline" onClick={handleExtract} disabled={extracting}>
              <Sparkles className="mr-2 h-4 w-4" />
              Re-extract
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/minutes/${minutesId}`)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || selectedCount === 0}
              >
                {saving ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save {selectedCount} Article{selectedCount !== 1 ? "s" : ""} as Drafts
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  const styles = {
    high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    medium:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[confidence]}`}>
      {confidence}
    </span>
  );
}
