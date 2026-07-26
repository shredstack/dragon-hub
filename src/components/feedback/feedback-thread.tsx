"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import {
  replyToFeedbackAsAdmin,
  replyToFeedbackAsUser,
} from "@/actions/feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface ThreadMessage {
  id: string;
  fromAdmin: boolean;
  body: string;
  /** ISO string — serialized on the server to avoid Date hydration issues. */
  createdAt: string;
  authorName: string | null;
}

interface Props {
  feedbackId: string;
  messages: ThreadMessage[];
  /** "admin" posts as the super admin; "user" posts as the submitter. */
  as: "admin" | "user";
  /** Hide the thread behind a "Conversation (N)" toggle, collapsed by default. */
  collapsible?: boolean;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FeedbackThread({
  feedbackId,
  messages,
  as,
  collapsible = false,
}: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);

  const handleSend = async () => {
    setError(null);
    if (!body.trim()) return;
    setIsSending(true);
    try {
      const result =
        as === "admin"
          ? await replyToFeedbackAsAdmin(feedbackId, body.trim())
          : await replyToFeedbackAsUser(feedbackId, body.trim());
      if (!result.success) {
        setError(result.error ?? "Couldn't send that message.");
        return;
      }
      setBody("");
      addToast("Message sent.", "success");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that message.");
    } finally {
      setIsSending(false);
    }
  };

  /** The current viewer's own messages sit on the right, in the primary color. */
  const mineIsAdmin = as === "admin";

  return (
    <div className="space-y-3">
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <MessageCircle className="h-4 w-4" />
          Conversation ({messages.length})
        </button>
      )}

      {expanded && (
        <>
      {messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((m) => {
            const mine = m.fromAdmin === mineIsAdmin;
            const who = mine
              ? "You"
              : m.fromAdmin
                ? "DragonHub team"
                : m.authorName || "Submitter";
            return (
              <div
                key={m.id}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={cn(
                      "mt-1 text-[11px]",
                      mine
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {who} · {formatWhen(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={
            as === "admin"
              ? "Ask for more detail or share an update…"
              : "Add more detail or reply…"
          }
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSend} disabled={isSending || !body.trim()}>
            {isSending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
