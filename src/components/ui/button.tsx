import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "destructive" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantStyles: Record<string, string> = {
  default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-dark",
  secondary: "bg-muted text-muted-foreground shadow-sm hover:bg-muted/80",
  ghost: "hover:bg-muted hover:text-foreground",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  outline: "border border-border bg-transparent shadow-sm hover:bg-muted hover:text-foreground",
};

const sizeStyles: Record<string, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-8 text-base",
  icon: "h-9 w-9",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
