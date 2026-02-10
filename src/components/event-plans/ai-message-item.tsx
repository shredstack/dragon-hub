"use client";

import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Trash2,
} from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import type { SourceUsed } from "@/actions/ai-recommendations";
import { deleteEventPlanMessage } from "@/actions/event-plans";

interface AiMessageItemProps {
  id: string;
  message: string;
  createdAt: string;
  sources: SourceUsed[] | null;
  canDelete: boolean;
}

export function AiMessageItem({
  id,
  message,
  createdAt,
  sources,
  canDelete,
}: AiMessageItemProps) {
  const [showSources, setShowSources] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const hasSources = sources && sources.length > 0;

  async function handleDelete() {
    if (!confirm("Delete this AI response?")) return;
    setIsDeleting(true);
    try {
      await deleteEventPlanMessage(id);
    } catch (error) {
      console.error("Failed to delete message:", error);
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 items-start group">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-dragon-gold-500" />
        <span className="text-xs font-medium text-dragon-gold-600">
          DragonHub AI
        </span>
      </div>
      <div className="max-w-[85%] rounded-lg bg-dragon-gold-50 border border-dragon-gold-200 px-3 py-2 text-sm dark:bg-dragon-gold-900/20 dark:border-dragon-gold-800">
        <p className="whitespace-pre-wrap">{message}</p>

        {hasSources && (
          <div className="mt-2 border-t border-dragon-gold-200 dark:border-dragon-gold-800 pt-2">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1 text-xs text-dragon-gold-600 hover:text-dragon-gold-700 dark:text-dragon-gold-400"
            >
              <FileText className="h-3 w-3" />
              {sources.length} source{sources.length !== 1 ? "s" : ""}
              {showSources ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>

            {showSources && (
              <ul className="mt-1 space-y-1">
                {sources.map((source, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className="rounded bg-dragon-gold-100 dark:bg-dragon-gold-900/40 px-1 py-0.5 text-[9px] font-medium uppercase text-dragon-gold-700 dark:text-dragon-gold-400">
                      {source.type === "knowledge_article"
                        ? "KB"
                        : source.type === "attached_resource"
                          ? "Res"
                          : "Doc"}
                    </span>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-primary hover:underline truncate"
                      >
                        {source.title}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate">{source.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(createdAt)}
        </span>
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity disabled:opacity-50"
            title="Delete AI response"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
