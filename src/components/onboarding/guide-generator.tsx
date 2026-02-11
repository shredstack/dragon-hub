"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, FileText, BookOpen, Folder } from "lucide-react";
import { generateGuide } from "@/actions/onboarding-guides";
import type { PtaBoardPosition } from "@/types";

interface GuideGeneratorProps {
  position: PtaBoardPosition;
}

export function GuideGenerator({ position }: GuideGeneratorProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateGuide(position);
      if (!result.success) {
        setError(result.error || "Failed to generate guide");
      } else {
        // Reload to show the new guide
        window.location.reload();
      }
    });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* What will be used */}
          <div className="space-y-3">
            <h3 className="font-medium">
              The AI will use these sources to create your guide:
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                <FileText className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Handoff Notes</p>
                  <p className="text-xs text-muted-foreground">
                    Notes from previous position holders
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                <BookOpen className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Knowledge Base</p>
                  <p className="text-xs text-muted-foreground">
                    Relevant articles and guides
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                <Folder className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">School Documents</p>
                  <p className="text-xs text-muted-foreground">
                    Indexed Drive files
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Generate button */}
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating Guide...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate My Guide
                </>
              )}
            </Button>
          </div>

          {isPending && (
            <p className="text-center text-sm text-muted-foreground">
              This may take a minute while we gather context and create your
              personalized guide...
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
