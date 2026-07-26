// Client-safe labels and badge styles for feedback, shared by the user-facing
// page and the super-admin dashboard so the two can't drift.

import type { FeedbackStatus, FeedbackType } from "@/actions/feedback";

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "new",
  "in_progress",
  "completed",
  "wont_do",
];

export function feedbackStatusLabel(status: FeedbackStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "wont_do":
      return "Won't do";
    default:
      return status;
  }
}

/** Tailwind classes for a status pill. */
export function feedbackStatusClasses(status: FeedbackStatus): string {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
    case "in_progress":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";
    case "wont_do":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function feedbackTypeLabel(type: FeedbackType): string {
  return type === "bug" ? "Bug" : "Improvement";
}

export function feedbackTypeClasses(type: FeedbackType): string {
  return type === "bug"
    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
    : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200";
}
