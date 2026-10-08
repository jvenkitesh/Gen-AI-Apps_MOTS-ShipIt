import { Badge } from "@/components/ui/Badge";
import type { LoadStatus } from "@/lib/freight/loadQueries";

// docs/design.md: sourcing = Blue, negotiating = Yellow, booked = Green, exception = Saffron (SLA urgency).
const STATUS_STYLE: Record<LoadStatus, { color: "blue" | "yellow" | "green" | "saffron" | "red"; label: string }> = {
  sourcing: { color: "blue", label: "Sourcing" },
  negotiating: { color: "yellow", label: "Negotiating" },
  booked: { color: "green", label: "Booked" },
  exception: { color: "saffron", label: "Exception" },
  cancelled: { color: "red", label: "Cancelled" },
};

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  const style = STATUS_STYLE[status];
  return <Badge color={style.color}>{style.label}</Badge>;
}
