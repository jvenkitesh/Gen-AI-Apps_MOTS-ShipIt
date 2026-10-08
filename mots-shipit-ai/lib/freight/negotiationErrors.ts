import { NextResponse } from "next/server";
import { NegotiationError } from "@/lib/freight/negotiation";

export function negotiationErrorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof NegotiationError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.httpStatus });
  }
  console.error(`[${context}] failed:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "FAILED", message: "Something went wrong. Please try again." }, { status: 500 });
}
