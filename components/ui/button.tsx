import { cloneElement } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: false;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
};

type ButtonLinkProps = {
  asChild: true;
  children: React.ReactElement<React.ComponentProps<typeof Link>>;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
};

export function Button(props: ButtonProps | ButtonLinkProps) {
  const variant = props.variant ?? "default";
  const size = props.size ?? "default";
  const className = cn(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
    variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "outline" && "border border-border bg-card hover:bg-muted",
    variant === "ghost" && "hover:bg-muted",
    size === "default" && "h-10 px-4",
    size === "sm" && "h-8 px-3 text-xs",
    size === "icon" && "h-9 w-9"
  );

  if (props.asChild) {
    const child = props.children;
    return cloneElement(child, {
      className: cn(className, child.props.className)
    });
  }

  const { className: extraClassName, asChild: _asChild, variant: _variant, size: _size, ...buttonProps } = props;
  return <button className={cn(className, extraClassName)} {...buttonProps} />;
}
