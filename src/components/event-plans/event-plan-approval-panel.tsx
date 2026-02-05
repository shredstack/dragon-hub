"use client";

import { useState } from "react";
import { voteOnEventPlan } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { APPROVAL_THRESHOLD } from "@/lib/constants";
import { CheckCircle2, XCircle, MessageSquare } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import type { EventPlanStatus } from "@/types";

interface Vote {
  userId: string;
  userName: string | null;
  vote: "approve" | "reject";
  comment: string | null;
  createdAt: string;
}

interface EventPlanApprovalPanelProps {
  eventPlanId: string;
  status: EventPlanStatus;
  votes: Vote[];
  isBoardMember: boolean;
  currentUserId: string;
}

export function EventPlanApprovalPanel({
  eventPlanId,
  status,
  votes,
  isBoardMember,
  currentUserId,
}: EventPlanApprovalPanelProps) {
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const approveCount = votes.filter((v) => v.vote === "approve").length;
  const hasVoted = votes.some((v) => v.userId === currentUserId);
  const canVote =
    isBoardMember && status === "pending_approval" && !hasVoted;

  async function handleVote(vote: "approve" | "reject") {
    setLoading(true);
    await voteOnEventPlan(eventPlanId, vote, comment || undefined);
    setComment("");
    setLoading(false);
  }

  if (status === "draft") return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Approval Status</h3>

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {approveCount} of {APPROVAL_THRESHOLD} approvals needed
        </span>
        {status === "approved" && (
          <Badge variant="success">Approved</Badge>
        )}
        {status === "rejected" && (
          <Badge variant="destructive">Rejected</Badge>
        )}
        {status === "pending_approval" && (
          <Badge variant="outline">Pending</Badge>
        )}
      </div>

      {votes.length > 0 && (
        <div className="mb-4 space-y-2">
          {votes.map((vote) => (
            <div
              key={vote.userId}
              className="flex items-start gap-2 text-sm"
            >
              {vote.vote === "approve" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
              )}
              <div>
                <span className="font-medium">
                  {vote.userName ?? "Board Member"}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  {vote.vote === "approve" ? "approved" : "rejected"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {" "}
                  {formatRelativeDate(vote.createdAt)}
                </span>
                {vote.comment && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                    <MessageSquare className="mt-0.5 h-3 w-3" />
                    {vote.comment}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canVote && (
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Add a comment with your vote..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleVote("approve")}
              disabled={loading}
            >
              <CheckCircle2 className="h-4 w-4" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleVote("reject")}
              disabled={loading}
              className="text-destructive hover:text-destructive"
            >
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          </div>
        </div>
      )}

      {hasVoted && status === "pending_approval" && (
        <p className="text-xs text-muted-foreground">
          You have already voted on this plan.
        </p>
      )}
    </div>
  );
}
