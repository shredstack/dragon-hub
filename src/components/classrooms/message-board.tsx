"use client";

import { useRef, useEffect, useState, useOptimistic, startTransition } from "react";
import { sendClassroomMessage } from "@/actions/classrooms";
import { MessageItem } from "./message-item";
import { Send, Lock } from "lucide-react";

interface Message {
  id: string;
  message: string;
  createdAt: string;
  authorId: string | null;
  author: { name: string | null; email: string } | null;
  accessLevel?: "public" | "room_parents_only";
}

interface MessageBoardProps {
  classroomId: string;
  messages: Message[];
  currentUserId: string;
  accessLevel?: "public" | "room_parents_only";
  canPostPrivate?: boolean;
}

export function MessageBoard({
  classroomId,
  messages,
  currentUserId,
  accessLevel = "public",
}: MessageBoardProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [optimisticMessages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const msg = input;
    setInput("");

    startTransition(() => {
      addOptimisticMessage({
        id: `temp-${Date.now()}`,
        message: msg,
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
        author: { name: "You", email: "" },
        accessLevel,
      });
    });

    await sendClassroomMessage(classroomId, msg, accessLevel);
  }

  const isPrivate = accessLevel === "room_parents_only";

  const emptyMessage = isPrivate
    ? "This is a private board for you and your room parents to coordinate parties and classroom events. Parents on the general classroom board cannot see these discussions."
    : "No messages yet. Start the conversation!";

  return (
    <div className="flex h-[60dvh] max-h-[500px] min-h-[300px] flex-col rounded-lg border border-border bg-card">
      {isPrivate && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Room Parents Only - Private Board
          </span>
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {optimisticMessages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
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
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={(e) => {
            setTimeout(() => {
              e.target.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
          }}
          placeholder={isPrivate ? "Message room parents..." : "Type a message..."}
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
