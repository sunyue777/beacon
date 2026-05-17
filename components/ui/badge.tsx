import { cn } from "@/lib/utils/cn";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline" | "warning" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
        variant === "default" && "bg-primary text-primary-foreground",
        variant === "secondary" && "bg-muted text-foreground",
        variant === "outline" && "border border-border bg-transparent text-muted-foreground",
        variant === "warning" && "bg-warning/16 text-foreground",
        variant === "success" && "bg-success/16 text-foreground",
        className
      )}
      {...props}
    />
  );
}
