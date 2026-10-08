"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const text = h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
  return ms >= 0 ? `${text} left` : `${text} overdue`;
}

// docs/design.md "SLA Countdown Badge": Saffron 50/200/700 while time remains,
// Red 50/200/700 once the deadline has passed; value in Data/Mono.
export function SlaCountdownBadge({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!deadline) return <span className="text-body-sm text-grey-500">No deadline</span>;
  const remaining = new Date(deadline).getTime() - now;
  const breached = remaining < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border px-2 py-0.5 transition duration-modal ease-in-out",
        breached ? "border-red-200 bg-red-50 text-red-700" : "border-saffron-200 bg-saffron-50 text-saffron-700"
      )}
    >
      <span className="text-body-sm">{breached ? "SLA breached" : "SLA"}</span>
      <span className="font-mono text-data-mono">{formatRemaining(remaining)}</span>
    </span>
  );
}
