import { cn } from "@/lib/utils/cn";

export const LOADING_TEXT = "Transmogrifying…";

// The app's one spinner. Every loading state uses this wording.
export function LoadingIndicator({ className }: { className?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-2 text-body-sm text-grey-500", className)}>
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-grey-100 border-t-blue-500 motion-reduce:animate-none"
      />
      {LOADING_TEXT}
    </span>
  );
}
