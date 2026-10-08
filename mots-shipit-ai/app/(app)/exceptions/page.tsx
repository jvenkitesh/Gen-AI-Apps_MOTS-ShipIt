import Link from "next/link";
import { Label } from "@/components/ui/Label";
import { FormMessage } from "@/components/auth/FormMessage";
import { ExceptionQueue, type QueueItem } from "@/components/exceptions/ExceptionQueue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listExceptions, markBreachedExceptions } from "@/lib/freight/exceptions";
import { loadExternalIds, viewerRole } from "@/lib/freight/viewer";
import { cn } from "@/lib/utils/cn";

export default async function ExceptionsPage({ searchParams }: { searchParams: { view?: string } }) {
  const showResolved = searchParams.view === "resolved";
  const supabase = createClient();
  let items: QueueItem[] = [];
  let loadError: string | null = null;

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) await markBreachedExceptions(createAdminClient());
    const rows = await listExceptions(supabase, showResolved ? "resolved" : "active");
    const ids = await loadExternalIds(supabase, rows.map((r) => r.load_id));
    items = rows.map((r) => ({ ...r, load_external_id: r.load_id ? ids[r.load_id] ?? null : null }));
  } catch (err) {
    console.error("[exceptions page]", err instanceof Error ? err.message : err);
    loadError = "Exceptions couldn't be loaded. Please try again.";
  }
  const role = await viewerRole(supabase);
  const canResolve = role !== null && role !== "viewer";

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h5 text-grey-900"><Label text="Exceptions" definition="openExceptions" /></h1>
        <p className="text-body-sm text-grey-500">Problems the automation stopped on, soonest deadline first. Breached exceptions stay here until someone handles them.</p>
      </div>
      <nav aria-label="Exception views" className="flex gap-2">
        {[{ href: "/exceptions", label: "Open and breached", active: !showResolved }, { href: "/exceptions?view=resolved", label: "Resolved", active: showResolved }].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "rounded-sm border px-3 py-1 text-body-sm font-medium transition duration-micro ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
              t.active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-grey-200 bg-white text-grey-500 hover:bg-grey-50"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {loadError ? <FormMessage tone="error">{loadError}</FormMessage> : <ExceptionQueue items={items} canResolve={canResolve} showResolved={showResolved} />}
    </main>
  );
}
