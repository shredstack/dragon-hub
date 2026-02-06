"use client";

import { useRef, useEffect, useState, useOptimistic } from "react";
import { sendClassroomMessage } from "@/actions/classrooms";
import { MessageItem } from "./message-item";
import { Send } from "lucide-react";

interface Message {
  id: string;
  message: string;
  createdAt: string;
  authorId: string | null;
  author: { name: string | null; email: string } | null;
}

interface MessageBoardProps {
  classroomId: string;
  messages: Message[];
  currentUserId: string;
}

export function MessageBoard({ classroomId, messages, currentUserId }: MessageBoardProps) {
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

    addOptimisticMessage({
      id: `temp-${Date.now()}`,
      message: msg,
      createdAt: new Date().toISOString(),
      authorId: currentUserId,
      author: { name: "You", email: "" },
    });

    await sendClassroomMessage(classroomId, msg);
  }

  return (
    <div className="flex h-[60dvh] max-h-[500px] min-h-[300px] flex-col rounded-lg border border-border bg-card">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {optimisticMessages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
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
          placeholder="Type a message..."
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
