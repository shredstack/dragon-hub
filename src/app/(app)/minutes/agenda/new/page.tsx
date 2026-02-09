"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAgenda, saveAgenda } from "@/actions/minutes";
import { ArticleRenderer } from "@/components/knowledge/article-renderer";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function NewAgendaPage() {
  const router = useRouter();
  const now = new Date();

  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1);
  const [targetYear, setTargetYear] = useState(now.getFullYear());
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [sourcesUsed, setSourcesUsed] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const result = await generateAgenda(targetMonth, targetYear);
      setGeneratedContent(result.agenda);
      setEditedContent(result.agenda);
      setSourcesUsed(result.sourcesUsed);
    } catch (err) {
      console.error("Failed to generate agenda:", err);
      setError("Failed to generate agenda. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!editedContent.trim()) {
      alert("Please generate or write an agenda first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const title = `${MONTHS[targetMonth - 1]} ${targetYear} PTA Meeting Agenda`;
      await saveAgenda({
        title,
        targetMonth,
        targetYear,
        content: editedContent,
        aiGeneratedContent: generatedContent || undefined,
      });
      router.push("/minutes/agenda");
    } catch (err) {
      console.error("Failed to save agenda:", err);
      setError("Failed to save agenda. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/minutes/agenda"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Agendas
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Generate Meeting Agenda</h1>
        <p className="text-muted-foreground">
          Use AI to create an agenda based on historical meeting patterns
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Month/Year Selector */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Target Meeting</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Month</label>
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {MONTHS.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Year</label>
            <select
              value={targetYear}
              onChange={(e) => setTargetYear(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
                (year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                )
              )}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Agenda
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Generated Content */}
      {editedContent && (
        <>
          <div className="mb-4 rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Agenda Content</h2>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-sm text-primary hover:underline"
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>

            {showPreview ? (
              <div className="rounded-md border border-border bg-background p-4">
                <ArticleRenderer content={editedContent} />
              </div>
            ) : (
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={20}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Agenda content in Markdown..."
              />
            )}
          </div>

          {/* Sources Used */}
          {sourcesUsed.length > 0 && (
            <div className="mb-4 rounded-lg border border-border bg-muted/50 p-4">
              <h3 className="mb-2 text-sm font-medium">Sources Used</h3>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {sourcesUsed.map((source, i) => (
                  <li key={i}>{source}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => router.push("/minutes/agenda")}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Agenda
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
