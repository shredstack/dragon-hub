"use client";

import { useState } from "react";
import { MessageBoard } from "./message-board";
import { Lock, Users } from "lucide-react";

interface Message {
  id: string;
  message: string;
  createdAt: string;
  authorId: string | null;
  author: { name: string | null; email: string } | null;
  accessLevel?: "public" | "room_parents_only";
}

interface MessageBoardWithTabsProps {
  classroomId: string;
  publicMessages: Message[];
  privateMessages: Message[];
  currentUserId: string;
}

export function MessageBoardWithTabs({
  classroomId,
  publicMessages,
  privateMessages,
  currentUserId,
}: MessageBoardWithTabsProps) {
  const [activeTab, setActiveTab] = useState<"public" | "private">("public");

  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-1">
        <button
          onClick={() => setActiveTab("public")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "public"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          All Parents
        </button>
        <button
          onClick={() => setActiveTab("private")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "private"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Lock className="h-4 w-4" />
          Room Parents
          {privateMessages.length > 0 && (
            <span className="rounded-full bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700">
              {privateMessages.length}
            </span>
          )}
        </button>
      </div>

      {/* Message boards */}
      {activeTab === "public" ? (
        <MessageBoard
          classroomId={classroomId}
          messages={publicMessages}
          currentUserId={currentUserId}
          accessLevel="public"
        />
      ) : (
        <MessageBoard
          classroomId={classroomId}
          messages={privateMessages}
          currentUserId={currentUserId}
          accessLevel="room_parents_only"
          canPostPrivate={true}
        />
      )}
    </div>
  );
}
