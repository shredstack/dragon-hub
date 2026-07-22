"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getGuideGenerationStatus,
  startGuideGeneration,
} from "@/actions/onboarding-guides";
import type { PtaBoardPosition } from "@/types";

const POLL_INTERVAL_MS = 3000;
// Mirror of GUIDE_GENERATION_STALE_MS on the server. Once elapsed, the server
// will report a stale run as terminal, so we surface a manual retry as a
// backstop in case a poll is missed.
const STALE_AFTER_MS = 8 * 60 * 1000;

interface GuideGeneratingStatusProps {
  position: PtaBoardPosition;
  /** ISO timestamp of when the current run started, if known. */
  startedAt?: string | null;
}

export function GuideGeneratingStatus({
  position,
  startedAt,
}: GuideGeneratingStatusProps) {
  const [isStale, setIsStale] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const startedAtMs = useRef(
    startedAt ? new Date(startedAt).getTime() : Date.now()
  );

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { status } = await getGuideGenerationStatus();
        if (cancelled) return;
        // Any terminal status means the row changed underneath us — reload so
        // the server component re-renders the correct branch (guide or
        // generator).
        if (status !== "generating") {
          window.location.reload();
          return;
        }
        if (Date.now() - startedAtMs.current > STALE_AFTER_MS) {
          setIsStale(true);
        }
      } catch {
        // Transient error (network blip, brief 5xx) — keep polling.
      }
    };

    const interval = setInterval(check, POLL_INTERVAL_MS);
    // Poll once immediately so a run that finished between page load and the
    // first tick resolves without waiting a full interval.
    check();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    const result = await startGuideGeneration(position);
    if (result.success) {
      window.location.reload();
      return;
    }
    setIsRetrying(false);
    setIsStale(false);
    startedAtMs.current = Date.now();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      {isStale ? (
        <div>
          <Sparkles className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium">
            This is taking longer than expected
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The generation may have been interrupted. You can try again.
          </p>
          <div className="mt-4 flex justify-center">
            <Button onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Try Again
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="animate-pulse">
          <Sparkles className="mx-auto h-12 w-12 text-purple-500" />
          <p className="mt-4 text-lg font-medium">
            Generating your personalized guide...
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This may take a minute. The guide is being created based on handoff
            notes, knowledge base articles, and school resources. You can leave
            this page and come back — it&apos;ll keep working.
          </p>
        </div>
      )}
    </div>
  );
}
