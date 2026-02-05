"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface EventPlanTabsProps {
  overviewContent: React.ReactNode;
  tasksContent: React.ReactNode;
  discussionContent: React.ReactNode;
  membersContent: React.ReactNode;
  resourcesContent: React.ReactNode;
}

export function EventPlanTabs({
  overviewContent,
  tasksContent,
  discussionContent,
  membersContent,
  resourcesContent,
}: EventPlanTabsProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="discussion">Discussion</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="resources">Resources</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overviewContent}</TabsContent>
      <TabsContent value="tasks">{tasksContent}</TabsContent>
      <TabsContent value="discussion">{discussionContent}</TabsContent>
      <TabsContent value="members">{membersContent}</TabsContent>
      <TabsContent value="resources">{resourcesContent}</TabsContent>
    </Tabs>
  );
}
