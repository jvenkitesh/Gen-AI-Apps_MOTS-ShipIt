import { cn } from "@/lib/utils/cn";

// docs/design.md: Cards/panels = radius 12px, White surface, Elevation 1.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg bg-white shadow-elevation-1", className)} {...props} />;
}
