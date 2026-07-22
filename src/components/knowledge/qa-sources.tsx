"use client";

import { useState } from "react";
import {
  FileText,
  ExternalLink,
  Eye,
  DollarSign,
  Calendar,
  FileBox,
  Users,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import {
  DocumentViewer,
  type ViewableDocument,
} from "@/components/documents/document-viewer";
import { previewKind } from "@/lib/documents/preview";
import type { QASource } from "@/actions/knowledge-qa";

const SOURCE_ICONS: Record<string, typeof FileText> = {
  knowledge_article: BookOpen,
  budget_category: DollarSign,
  event_plan: Calendar,
  fundraiser: DollarSign,
  handoff_note: Users,
  drive_file: FileBox,
};

/**
 * Citation list for an answer. Shared by the live Q&A and saved Q&As so a
 * saved answer's sources stay as followable as they were when first asked.
 */
export function QaSources({ sources }: { sources: QASource[] }) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null);

  if (sources.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <FileText className="h-3 w-3" />
        Sources ({sources.length})
      </div>
      <ul className="space-y-2">
        {sources.map((source, i) => {
          const Icon = SOURCE_ICONS[source.type] || FileText;
          const isExternal = source.url?.startsWith("http");
          // Files we can render in-app get a reader view. Without it the only
          // way to check a citation is downloading the file, which on a phone
          // hands it to another app entirely.
          const viewable =
            source.document && previewKind(source.document)
              ? source.document
              : null;

          return (
            <li
              key={i}
              className="rounded-md border border-border bg-muted/50 p-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div>
                    <span className="font-medium">{source.title}</span>
                    <p className="mt-0.5 text-muted-foreground">
                      {source.snippet}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {viewable && (
                    <button
                      type="button"
                      onClick={() => setViewing(viewable)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`View ${viewable.title || viewable.fileName}`}
                      title="View in DragonHub"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {source.url && (
                    <Link
                      href={source.url}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                      className="text-primary hover:underline"
                      aria-label={`Open ${source.title} at the source`}
                      title="Open original"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {viewing && (
        <DocumentViewer
          document={viewing}
          open={Boolean(viewing)}
          onOpenChange={(open) => !open && setViewing(null)}
        />
      )}
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence || confidence === "no_data") return null;

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        confidence === "high"
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : confidence === "medium"
            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
      }`}
    >
      {confidence} confidence
    </span>
  );
}
