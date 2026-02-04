import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/utils";

interface MessageItemProps {
  message: string;
  authorName: string | null;
  createdAt: string;
  isOwnMessage: boolean;
}

export function MessageItem({ message, authorName, createdAt, isOwnMessage }: MessageItemProps) {
  return (
    <div className={cn("flex flex-col gap-1", isOwnMessage ? "items-end" : "items-start")}>
      <span className="text-xs text-muted-foreground">{authorName ?? "Unknown"}</span>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isOwnMessage ? "bg-dragon-blue-500 text-white" : "bg-muted"
        )}
      >
        {message}
      </div>
      <span className="text-xs text-muted-foreground">{formatRelativeDate(createdAt)}</span>
    </div>
  );
}
