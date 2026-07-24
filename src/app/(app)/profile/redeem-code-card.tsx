"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinSchool } from "@/actions/school-membership";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound } from "lucide-react";

/**
 * Redeem a code from inside the app.
 *
 * `/join-school` only ever answered the first question — "which school are
 * you?" — and nothing linked to it once you were in one. But a code is no
 * longer only a way through the front door: staff codes grant school
 * administrator access to people who are already members, and the SCC code will
 * do the same. Someone who is already signed in needs somewhere to type one.
 */
export function RedeemCodeCard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<
    { tone: "ok" | "error"; text: string } | null
  >(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const result = await joinSchool(code);

      if (!result.success) {
        setMessage({ tone: "error", text: result.error ?? "That code didn't work." });
      } else if ("staffRequestPending" in result && result.staffRequestPending) {
        setMessage({
          tone: "ok",
          text: "Request sent. A school administrator has to approve it — your access is unchanged until they do.",
        });
        setCode("");
      } else if ("pending" in result && result.pending) {
        setMessage({
          tone: "ok",
          text: "Request sent. You'll get access once a school administrator approves it.",
        });
        setCode("");
      } else if ("alreadyMember" in result && result.alreadyMember) {
        setMessage({ tone: "ok", text: "You already have that access." });
        setCode("");
      } else {
        setMessage({ tone: "ok", text: "Done — your access has been updated." });
        setCode("");
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Have a code?</h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Staff access codes and other invitations go here. Codes that grant
        administrator access need approval before they take effect.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter a code"
          className="font-mono uppercase tracking-wider"
          maxLength={20}
        />
        <Button type="submit" disabled={loading || !code.trim()}>
          {loading ? "Checking..." : "Redeem"}
        </Button>
      </form>

      {message && (
        <p
          className={`mt-3 text-sm ${
            message.tone === "error" ? "text-destructive" : "text-green-700 dark:text-green-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
