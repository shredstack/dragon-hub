"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  regenerateSchoolCode,
  setCustomSchoolCode,
} from "@/actions/school-membership";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Copy, Check, Pencil, X } from "lucide-react";

interface SchoolCodeManagerProps {
  schoolId: string;
  currentCode: string;
}

export function SchoolCodeManager({
  schoolId,
  currentCode,
}: SchoolCodeManagerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [error, setError] = useState("");

  async function handleRegenerate() {
    if (
      !window.confirm(
        "Are you sure you want to regenerate the school code? The current code will no longer work for new sign-ups."
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      await regenerateSchoolCode(schoolId);
      router.refresh();
    } catch (error) {
      console.error("Failed to regenerate code:", error);
      setError(
        error instanceof Error ? error.message : "Failed to regenerate code"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSetCustomCode() {
    if (!customCode.trim()) {
      setError("Please enter a code");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await setCustomSchoolCode(schoolId, customCode);
      setIsEditing(false);
      setCustomCode("");
      router.refresh();
    } catch (error) {
      console.error("Failed to set custom code:", error);
      setError(
        error instanceof Error ? error.message : "Failed to set custom code"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }

  function handleStartEditing() {
    setIsEditing(true);
    setCustomCode(currentCode);
    setError("");
  }

  function handleCancelEditing() {
    setIsEditing(false);
    setCustomCode("");
    setError("");
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">School Sign-In Code</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Share this code with parents and volunteers so they can join your
        school.
      </p>

      {isEditing ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={customCode}
              onChange={(e) => {
                setCustomCode(e.target.value.toUpperCase());
                setError("");
              }}
              placeholder="Enter custom code"
              className="font-mono text-lg tracking-wider uppercase"
              maxLength={20}
              disabled={loading}
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleSetCustomCode}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancelEditing}
              disabled={loading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            4-20 characters, letters and numbers only
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 rounded-md border border-input bg-muted px-4 py-3 font-mono text-lg tracking-wider">
            {currentCode}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleStartEditing}
            title="Edit code"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}

      {!isEditing && (
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={loading}
            className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Regenerating..." : "Generate Random Code"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Generate a new random code or click the pencil icon to set your own.
            Previous code will stop working immediately.
          </p>
        </div>
      )}
    </div>
  );
}
