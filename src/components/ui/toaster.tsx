"use client";

import { useToast } from "./toast";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const variantStyles: Record<string, string> = {
  default: "bg-card border-border",
  success: "bg-success text-success-foreground",
  destructive: "bg-destructive text-destructive-foreground",
};

export function Toaster() {
  const { toasts, removeToast } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn("flex items-center gap-2 rounded-md border px-4 py-3 text-sm shadow-lg", variantStyles[toast.variant ?? "default"])}
        >
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="shrink-0 opacity-70 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
