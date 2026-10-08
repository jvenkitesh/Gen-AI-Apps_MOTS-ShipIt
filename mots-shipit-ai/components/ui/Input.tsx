import { cn } from "@/lib/utils/cn";

// docs/design.md: inputs radius 8px; focus = Blue 500 border, 100ms ease-out.
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-grey-200 bg-white px-4 py-2.5 text-body-lg text-grey-900",
        "transition duration-micro ease-out",
        "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}
