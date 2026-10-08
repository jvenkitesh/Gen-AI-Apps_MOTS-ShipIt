import { cn } from "@/lib/utils/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

// docs/design.md: Interactive/brand = Blue 500; buttons radius 8px; hover/focus 100ms ease-out.
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "rounded-md px-6 py-2.5 text-body-lg font-medium transition duration-micro ease-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-blue-500 text-white hover:bg-blue-600",
        variant === "ghost" && "border border-grey-200 text-grey-900 hover:bg-grey-50",
        className
      )}
      {...props}
    />
  );
}
