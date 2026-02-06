"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface EventPlanTabsProps {
  overviewContent: React.ReactNode;
  tasksContent: React.ReactNode;
  discussionContent: React.ReactNode;
  membersContent: React.ReactNode;
  resourcesContent: React.ReactNode;
  aiHistoryContent: React.ReactNode;
}

export function EventPlanTabs({
  overviewContent,
  tasksContent,
  discussionContent,
  membersContent,
  resourcesContent,
  aiHistoryContent,
}: EventPlanTabsProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex-wrap">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="discussion">Discussion</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="resources">Resources</TabsTrigger>
        <TabsTrigger value="ai-history">AI History</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overviewContent}</TabsContent>
      <TabsContent value="tasks">{tasksContent}</TabsContent>
      <TabsContent value="discussion">{discussionContent}</TabsContent>
      <TabsContent value="members">{membersContent}</TabsContent>
      <TabsContent value="resources">{resourcesContent}</TabsContent>
      <TabsContent value="ai-history">{aiHistoryContent}</TabsContent>
    </Tabs>
  );
}
