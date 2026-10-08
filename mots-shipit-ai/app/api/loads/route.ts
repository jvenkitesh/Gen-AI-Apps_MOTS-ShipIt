import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/security/authGuard";
import { listLoads } from "@/lib/freight/loadQueries";

// Any signed-in role can see all loads for now (assignment model is out of MVP scope).
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  try {
    const items = await listLoads(createClient(), {
      status: searchParams.get("status"),
      customerId: searchParams.get("customer_id"),
    });
    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error("[api/loads] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "LOADS_FAILED", message: "Loads couldn't be loaded." }, { status: 500 });
  }
}
