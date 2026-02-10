"use client";

import {
  useRef,
  useEffect,
  useState,
  useOptimistic,
  startTransition,
} from "react";
import { sendEventPlanMessage } from "@/actions/event-plans";
import { MessageItem } from "@/components/classrooms/message-item";
import { AiMessageItem } from "./ai-message-item";
import { Send, Sparkles, Loader2, X } from "lucide-react";
import type { SourceUsed } from "@/actions/ai-recommendations";

interface Message {
  id: string;
  message: string;
  createdAt: string;
  authorId: string | null;
  author: { name: string | null; email: string } | null;
  isAiResponse: boolean;
  aiSources: SourceUsed[] | null;
}

interface EventPlanMessageBoardProps {
  eventPlanId: string;
  messages: Message[];
  currentUserId: string;
  canSend: boolean;
  canDeleteAiMessages: boolean;
}

export function EventPlanMessageBoard({
  eventPlanId,
  messages,
  currentUserId,
  canSend,
  canDeleteAiMessages,
}: EventPlanMessageBoardProps) {
  const [input, setInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [dismissedAiInfo, setDismissedAiInfo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage]
  );

  const hasAiMessages = optimisticMessages.some((m) => m.isAiResponse);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [optimisticMessages, isAiThinking]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const msg = input;
    setInput("");

    // Check if message mentions @dragonhub
    const hasMention = /@dragonhub\b/i.test(msg);
    if (hasMention) {
      setIsAiThinking(true);
    }

    startTransition(() => {
      addOptimisticMessage({
        id: `temp-${Date.now()}`,
        message: msg,
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
        author: { name: "You", email: "" },
        isAiResponse: false,
        aiSources: null,
      });
    });

    await sendEventPlanMessage(eventPlanId, msg);
    setIsAiThinking(false);
  }

  function insertMention() {
    setInput((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return "@dragonhub ";
      return prev + (prev.endsWith(" ") ? "" : " ") + "@dragonhub ";
    });
  }

  return (
    <div className="flex h-[60dvh] max-h-[500px] min-h-[300px] flex-col rounded-lg border border-border bg-card">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Informational callout for AI feature */}
        {!hasAiMessages && !dismissedAiInfo && optimisticMessages.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-dragon-gold-200 bg-dragon-gold-50/50 p-3 dark:border-dragon-gold-800 dark:bg-dragon-gold-900/20">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-dragon-gold-500" />
            <div className="flex-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                DragonHub AI is available in this discussion
              </p>
              <p className="mt-0.5">
                Type{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  @dragonhub
                </code>{" "}
                followed by your question to get AI-powered answers based on
                this event&apos;s details, tasks, resources, and past
                recommendations.
              </p>
            </div>
            <button
              onClick={() => setDismissedAiInfo(true)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {optimisticMessages.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the discussion!
            </p>
            {canSend && (
              <p className="mt-2 text-xs text-muted-foreground">
                <Sparkles className="inline h-3 w-3 text-dragon-gold-500" /> Tip:
                Type{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                  @dragonhub
                </code>{" "}
                to ask the AI assistant
              </p>
            )}
          </div>
        )}

        {optimisticMessages.map((msg) =>
          msg.isAiResponse ? (
            <AiMessageItem
              key={msg.id}
              id={msg.id}
              message={msg.message}
              createdAt={msg.createdAt}
              sources={msg.aiSources}
              canDelete={canDeleteAiMessages}
            />
          ) : (
            <MessageItem
              key={msg.id}
              message={msg.message}
              authorName={msg.author?.name ?? null}
              createdAt={msg.createdAt}
              isOwnMessage={msg.authorId === currentUserId}
            />
          )
        )}

        {/* AI thinking indicator */}
        {isAiThinking && (
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-dragon-gold-500" />
            <div className="flex items-center gap-2 rounded-lg bg-dragon-gold-50 border border-dragon-gold-200 px-3 py-2 text-sm text-dragon-gold-600 dark:bg-dragon-gold-900/20 dark:border-dragon-gold-800 dark:text-dragon-gold-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              DragonHub AI is thinking...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {canSend && (
        <div className="flex items-center gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={insertMention}
            className="rounded-md border border-dragon-gold-200 bg-dragon-gold-50 p-2 text-dragon-gold-600 hover:bg-dragon-gold-100 dark:border-dragon-gold-800 dark:bg-dragon-gold-900/20 dark:text-dragon-gold-400 dark:hover:bg-dragon-gold-900/40"
            title="Ask DragonHub AI"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={(e) => {
                setTimeout(() => {
                  e.target.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }, 300);
              }}
              placeholder="Type a message..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!input.trim() || isAiThinking}
              className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary-dark disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
