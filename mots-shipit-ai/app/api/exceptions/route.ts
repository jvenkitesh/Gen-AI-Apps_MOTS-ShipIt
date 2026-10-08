import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { listExceptions, markBreachedExceptions } from "@/lib/freight/exceptions";

// Open and breached exceptions, soonest-to-breach first.
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) await markBreachedExceptions(createAdminClient());
    const status = new URL(request.url).searchParams.get("status") === "resolved" ? "resolved" : "active";
    const items = await listExceptions(createClient(), status);
    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error("[api/exceptions] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "EXCEPTIONS_FAILED", message: "Exceptions couldn't be loaded." }, { status: 500 });
  }
}
