"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TagFilter } from "@/components/minutes/tag-filter";
import { DeleteMinutesButton } from "@/components/minutes/delete-minutes-button";
import { ExpandableSummary } from "@/components/minutes/expandable-summary";

interface Minutes {
  id: string;
  fileName: string;
  documentType: "minutes" | "agenda";
  meetingDate: string | null;
  schoolYear: string;
  aiSummary: string | null;
  tags: string[] | null;
  googleDriveUrl: string;
}

interface Tag {
  id: string;
  name: string;
  displayName: string;
  usageCount: number;
}

interface MinutesListClientProps {
  minutes: Minutes[];
  tags: Tag[];
  isPtaBoard: boolean;
}

export function MinutesListClient({
  minutes,
  tags,
  isPtaBoard,
}: MinutesListClientProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");

  // Get unique school years for filtering
  const schoolYears = useMemo(() => {
    const years = [...new Set(minutes.map((m) => m.schoolYear))];
    return years.sort().reverse();
  }, [minutes]);

  // Filter minutes based on selected tags and year
  const filteredMinutes = useMemo(() => {
    return minutes.filter((m) => {
      // Year filter
      if (selectedYear && m.schoolYear !== selectedYear) {
        return false;
      }

      // Tag filter - must have ALL selected tags
      if (selectedTags.length > 0) {
        const minuteTags = m.tags || [];
        const hasAllTags = selectedTags.every((tag) =>
          minuteTags.some((t) => t.toLowerCase() === tag.toLowerCase())
        );
        if (!hasAllTags) return false;
      }

      return true;
    });
  }, [minutes, selectedTags, selectedYear]);

  const handleTagToggle = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Tag Filter */}
        {tags.length > 0 && (
          <div className="flex-1">
            <TagFilter
              tags={tags}
              selectedTags={selectedTags}
              onTagToggle={handleTagToggle}
              onClearAll={handleClearTags}
            />
          </div>
        )}

        {/* Year Filter */}
        {schoolYears.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="year-filter"
              className="text-sm text-muted-foreground"
            >
              School Year:
            </label>
            <select
              id="year-filter"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All Years</option>
              {schoolYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Results count */}
      {(selectedTags.length > 0 || selectedYear) && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredMinutes.length} of {minutes.length} documents
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3">File Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Meeting Date</th>
                <th className="p-3">School Year</th>
                <th className="p-3">Tags</th>
                <th className="max-w-xs p-3">Summary</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMinutes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No documents match your filters.
                  </td>
                </tr>
              ) : (
                filteredMinutes.map((m) => (
                  <tr key={m.id} className="border-b border-border">
                    <td className="p-3">
                      <Link
                        href={`/minutes/${m.id}`}
                        className="font-medium hover:underline"
                      >
                        {m.fileName}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          m.documentType === "agenda" ? "secondary" : "outline"
                        }
                      >
                        {m.documentType === "agenda" ? "Agenda" : "Minutes"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {m.meetingDate
                        ? new Date(m.meetingDate).toLocaleDateString()
                        : "Not set"}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{m.schoolYear}</Badge>
                    </td>
                    <td className="p-3">
                      {m.tags && m.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="cursor-pointer text-xs"
                              onClick={() => handleTagToggle(tag.toLowerCase())}
                            >
                              {tag}
                            </Badge>
                          ))}
                          {m.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{m.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-xs p-3 text-sm">
                      <ExpandableSummary summary={m.aiSummary} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={m.googleDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Open in Drive
                        </a>
                        {isPtaBoard && (
                          <DeleteMinutesButton
                            minutesId={m.id}
                            fileName={m.fileName}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
