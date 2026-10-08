import { cn } from "@/lib/utils/cn";

type FormMessageProps = {
  tone: "error" | "success";
  children: React.ReactNode;
};

// docs/design.md state colors: Error = Red 50 / Red 500 border / Red 700 text; Success = Green.
export function FormMessage({ tone, children }: FormMessageProps) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-body-sm",
        tone === "error" && "border-red-500 bg-red-50 text-red-700",
        tone === "success" && "border-green-500 bg-green-50 text-green-700"
      )}
    >
      {children}
    </p>
  );
}
