"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ClassroomTabsProps {
  messagesContent: React.ReactNode;
  tasksContent: React.ReactNode;
  /**
   * The one people list. There used to be two — a "Roster" reading
   * `classroom_members` beside a "Room Parents" reading the signups — which
   * showed most of the room twice and disagreed about the rest, because
   * `classroom_members` is an authorization table and not a record of who
   * volunteered. `VolunteersSection` is the roster now.
   */
  rosterContent: React.ReactNode;
}

export function ClassroomTabs({ messagesContent, tasksContent, rosterContent }: ClassroomTabsProps) {
  return (
    <Tabs defaultValue="messages">
      <TabsList>
        <TabsTrigger value="messages">Messages</TabsTrigger>
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="roster">Roster</TabsTrigger>
      </TabsList>
      <TabsContent value="messages">{messagesContent}</TabsContent>
      <TabsContent value="tasks">{tasksContent}</TabsContent>
      <TabsContent value="roster">{rosterContent}</TabsContent>
    </Tabs>
  );
}
