import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "destructive" | "outline";
}

const variantStyles: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-muted text-muted-foreground",
  success: "bg-success text-success-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  outline: "border border-border text-foreground",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", variantStyles[variant], className)}
      {...props}
    />
  );
}
