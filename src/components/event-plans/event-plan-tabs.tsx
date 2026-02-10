"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ClipboardList,
  ListTodo,
  MessageSquare,
  Users,
  FolderOpen,
  Sparkles,
} from "lucide-react";

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
      <TabsList className="h-auto flex-wrap gap-1 sm:h-10 sm:flex-nowrap sm:gap-1">
        <TabsTrigger value="overview" className="gap-1.5">
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="tasks" className="gap-1.5">
          <ListTodo className="h-4 w-4" />
          <span className="hidden sm:inline">Tasks</span>
        </TabsTrigger>
        <TabsTrigger value="discussion" className="gap-1.5">
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Discussion</span>
        </TabsTrigger>
        <TabsTrigger value="members" className="gap-1.5">
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Members</span>
        </TabsTrigger>
        <TabsTrigger value="resources" className="gap-1.5">
          <FolderOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Resources</span>
        </TabsTrigger>
        <TabsTrigger value="ai-history" className="gap-1.5">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">AI History</span>
        </TabsTrigger>
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
