"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ClassroomTabsProps {
  messagesContent: React.ReactNode;
  tasksContent: React.ReactNode;
  rosterContent: React.ReactNode;
  roomParentsContent: React.ReactNode;
}

export function ClassroomTabs({ messagesContent, tasksContent, rosterContent, roomParentsContent }: ClassroomTabsProps) {
  return (
    <Tabs defaultValue="messages">
      <TabsList>
        <TabsTrigger value="messages">Messages</TabsTrigger>
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="roster">Roster</TabsTrigger>
        <TabsTrigger value="room-parents">Room Parents</TabsTrigger>
      </TabsList>
      <TabsContent value="messages">{messagesContent}</TabsContent>
      <TabsContent value="tasks">{tasksContent}</TabsContent>
      <TabsContent value="roster">{rosterContent}</TabsContent>
      <TabsContent value="room-parents">{roomParentsContent}</TabsContent>
    </Tabs>
  );
}
