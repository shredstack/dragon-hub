"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/lib/csv";

export interface ReportFile {
  key: string;
  label: string;
  filename: string;
  csv: string;
}

/**
 * The four shapes of the same year, as files.
 *
 * The CSVs are built on the server and travel down as strings, so this
 * component is a download button and nothing else — no second implementation of
 * the grouping that the tables above it already show, and no way for the file
 * and the page to disagree about a total.
 */
export function ReportDownloads({ files }: { files: ReportFile[] }) {
  const { addToast } = useToast();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Download:</span>
      {files.map((file) => (
        <Button
          key={file.key}
          size="sm"
          variant="outline"
          onClick={() => {
            downloadCsv(file.filename, file.csv);
            addToast(`Downloaded ${file.filename}`, "success");
          }}
        >
          <Download className="h-4 w-4" />
          {file.label}
        </Button>
      ))}
    </div>
  );
}
