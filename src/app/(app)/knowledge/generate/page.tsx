"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createArticle } from "@/actions/knowledge";
import { KNOWLEDGE_CATEGORIES, CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  FileSpreadsheet,
  File,
  Presentation,
  Loader2,
  ArrowLeft,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

interface GeneratedArticle {
  title: string;
  description: string;
  category: string;
  tags: string[];
}

function fileIcon(mimeType: string) {
  if (mimeType.includes("document") || mimeType.includes("text"))
    return <FileText className="h-5 w-5 text-blue-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv"))
    return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  if (mimeType.includes("presentation"))
    return <Presentation className="h-5 w-5 text-orange-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatMimeType(mimeType: string) {
  if (mimeType.includes("document")) return "Google Doc";
  if (mimeType.includes("spreadsheet")) return "Google Sheet";
  if (mimeType.includes("presentation")) return "Google Slides";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("text")) return "Text";
  return "File";
}

export default function GenerateFromDrivePage() {
  const router = useRouter();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedArticle | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Editable form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tagsStr, setTagsStr] = useState("");

  async function loadFiles() {
    setLoadingFiles(true);
    setFilesError(null);
    try {
      const res = await fetch("/api/drive/files");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load files");
      setFiles(data.files);
      setFilesLoaded(true);
    } catch (err) {
      setFilesError(
        err instanceof Error ? err.message : "Failed to load files"
      );
    } finally {
      setLoadingFiles(false);
    }
  }

  async function handleGenerate(file: DriveFile) {
    setSelectedFile(file);
    setGenerating(true);
    setGenerateError(null);
    setGenerated(null);

    try {
      const res = await fetch("/api/drive/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate article");

      const article: GeneratedArticle = data.article;
      setGenerated(article);
      setTitle(article.title);
      setDescription(article.description);
      setCategory(article.category);
      setTagsStr(article.tags.join(", "));
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate article"
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!selectedFile) return;
    setSaving(true);

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const driveUrl =
      selectedFile.webViewLink ||
      `https://drive.google.com/file/d/${selectedFile.id}/view`;

    await createArticle({
      title,
      description,
      googleDriveUrl: driveUrl,
      category,
      tags,
      schoolYear: CURRENT_SCHOOL_YEAR,
    });

    router.push("/knowledge");
  }

  function handleBack() {
    if (generated || generateError) {
      setSelectedFile(null);
      setGenerated(null);
      setGenerateError(null);
    } else {
      router.push("/knowledge");
    }
  }

  // Step 2: Review generated article
  if (selectedFile && (generating || generated || generateError)) {
    return (
      <div className="mx-auto max-w-lg">
        <button
          onClick={handleBack}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to file list
        </button>

        <h1 className="mb-2 text-2xl font-bold">Generate Article</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          From: {selectedFile.name}
        </p>

        {generating && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Reading file and generating article...
            </p>
          </div>
        )}

        {generateError && (
          <div className="flex flex-col items-center rounded-lg border border-destructive/50 bg-destructive/5 p-6">
            <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{generateError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => handleGenerate(selectedFile)}
            >
              Try again
            </Button>
          </div>
        )}

        {generated && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-4 rounded-lg border border-border bg-card p-6"
          >
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              AI-generated — review and edit before saving
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                Tags (comma-separated)
              </label>
              <input
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Article"}
            </Button>
          </form>
        )}
      </div>
    );
  }

  // Step 1: Browse files
  return (
    <div>
      <button
        onClick={() => router.push("/knowledge")}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Knowledge Base
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Generate from Drive</h1>
        <p className="text-muted-foreground">
          Select a file from Google Drive to generate a knowledge article
        </p>
      </div>

      {!filesLoaded && !loadingFiles && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">
            Load files from the shared Google Drive folder
          </p>
          <Button onClick={loadFiles}>Browse Drive Files</Button>
        </div>
      )}

      {loadingFiles && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Loading files from Google Drive...
          </p>
        </div>
      )}

      {filesError && (
        <div className="flex flex-col items-center rounded-lg border border-destructive/50 bg-destructive/5 p-6">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{filesError}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadFiles}>
            Try again
          </Button>
        </div>
      )}

      {filesLoaded && files.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No files found in the Drive folder.</p>
        </div>
      )}

      {filesLoaded && files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <button
              key={file.id}
              onClick={() => handleGenerate(file)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
            >
              {fileIcon(file.mimeType)}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMimeType(file.mimeType)}
                  {file.modifiedTime &&
                    ` · Modified ${new Date(file.modifiedTime).toLocaleDateString()}`}
                </p>
              </div>
              <Badge variant="secondary">
                <Sparkles className="mr-1 h-3 w-3" />
                Generate
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
