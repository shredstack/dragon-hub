"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Lock, Users } from "lucide-react";
import {
  CommitteeMessageBoard,
  type CommitteeMessage,
} from "./committee-message-board";
import { CommitteeTaskList, type CommitteeTask } from "./committee-task-list";
import { CommitteeRoster, type CommitteeRosterProps } from "./committee-roster";

interface Props {
  committeeId: string;
  currentUserId: string;
  messages: CommitteeMessage[];
  tasks: CommitteeTask[];
  taskMembers: Array<{ userId: string; name: string }>;
  roster: CommitteeRosterProps;
  isChair: boolean;
}

export function CommitteeTabs({
  committeeId,
  currentUserId,
  messages,
  tasks,
  taskMembers,
  roster,
  isChair,
}: Props) {
  const openMessages = messages.filter((m) => !m.chairsOnly);
  const chairMessages = messages.filter((m) => m.chairsOnly);

  return (
    <Tabs defaultValue="messages">
      <TabsList>
        <TabsTrigger value="messages">Messages</TabsTrigger>
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="roster">Roster</TabsTrigger>
      </TabsList>

      <TabsContent value="messages">
        {isChair ? (
          <BoardWithChairTabs
            committeeId={committeeId}
            currentUserId={currentUserId}
            openMessages={openMessages}
            chairMessages={chairMessages}
          />
        ) : (
          <CommitteeMessageBoard
            committeeId={committeeId}
            messages={openMessages}
            currentUserId={currentUserId}
          />
        )}
      </TabsContent>

      <TabsContent value="tasks">
        <CommitteeTaskList
          committeeId={committeeId}
          tasks={tasks}
          members={taskMembers}
          canManage={isChair}
        />
      </TabsContent>

      <TabsContent value="roster">
        <CommitteeRoster {...roster} />
      </TabsContent>
    </Tabs>
  );
}

/** The chairs-only board, mirroring `MessageBoardWithTabs` on classrooms. */
function BoardWithChairTabs({
  committeeId,
  currentUserId,
  openMessages,
  chairMessages,
}: {
  committeeId: string;
  currentUserId: string;
  openMessages: CommitteeMessage[];
  chairMessages: CommitteeMessage[];
}) {
  const [active, setActive] = useState<"all" | "chairs">("all");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-1">
        <button
          onClick={() => setActive("all")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            active === "all"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Everyone
        </button>
        <button
          onClick={() => setActive("chairs")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            active === "chairs"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Lock className="h-4 w-4" />
          Chairs
          {chairMessages.length > 0 && (
            <span className="rounded-full bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700">
              {chairMessages.length}
            </span>
          )}
        </button>
      </div>

      {active === "all" ? (
        <CommitteeMessageBoard
          committeeId={committeeId}
          messages={openMessages}
          currentUserId={currentUserId}
        />
      ) : (
        <CommitteeMessageBoard
          committeeId={committeeId}
          messages={chairMessages}
          currentUserId={currentUserId}
          chairsOnly
        />
      )}
    </div>
  );
}
