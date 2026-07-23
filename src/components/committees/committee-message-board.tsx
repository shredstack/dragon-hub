"use client";

import { useEffect, useOptimistic, useRef, useState, startTransition } from "react";
import { sendCommitteeMessage } from "@/actions/committees";
import { MessageItem } from "@/components/classrooms/message-item";
import { Send, Lock } from "lucide-react";

/**
 * The committee message board.
 *
 * Deliberately a sibling of the classroom board rather than a reuse of it: that
 * component is bound to `sendClassroomMessage` and to the `accessLevel` enum,
 * where a committee's private board is a `chairsOnly` boolean. `MessageItem` —
 * the part that's genuinely presentational — is shared.
 */

export interface CommitteeMessage {
  id: string;
  message: string;
  createdAt: string;
  authorId: string | null;
  chairsOnly: boolean;
  author: { name: string | null; email: string } | null;
}

interface Props {
  committeeId: string;
  messages: CommitteeMessage[];
  currentUserId: string;
  /** Renders the chairs-only board and posts to it. */
  chairsOnly?: boolean;
}

export function CommitteeMessageBoard({
  committeeId,
  messages,
  currentUserId,
  chairsOnly = false,
}: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, next: CommitteeMessage) => [...state, next]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [optimisticMessages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const body = input;
    setInput("");

    startTransition(() => {
      addOptimisticMessage({
        id: `temp-${Date.now()}`,
        message: body,
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
        chairsOnly,
        author: { name: "You", email: "" },
      });
    });

    await sendCommitteeMessage(committeeId, body, chairsOnly);
  }

  const emptyMessage = chairsOnly
    ? "A private board for the chairs and the PTA board. Committee members can't see anything posted here."
    : "No messages yet. Start the conversation!";

  return (
    <div className="flex h-[60dvh] max-h-[500px] min-h-[300px] flex-col rounded-lg border border-border bg-card">
      {chairsOnly && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Chairs Only — Private Board
          </span>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {optimisticMessages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
        {optimisticMessages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg.message}
            authorName={msg.author?.name ?? null}
            createdAt={msg.createdAt}
            isOwnMessage={msg.authorId === currentUserId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-border p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={(e) => {
            setTimeout(() => {
              e.target.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
          }}
          placeholder={chairsOnly ? "Message the chairs…" : "Type a message…"}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary-dark disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
