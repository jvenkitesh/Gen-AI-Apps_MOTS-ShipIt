import { NextResponse } from "next/server";
import { z } from "zod";
import { CONTROL_SCOPES } from "@/lib/freight/controlPlane";
import { TOKEN_LIMITS } from "@/lib/security/tokenLimiter";

// Every request body is checked here before any business logic or database call. A failed
// check answers 422 VALIDATION_ERROR (validationErrorResponse below), on every route.

const email = z
  .string({ required_error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254, "Email address is too long.");

// Supabase Auth (bcrypt) ignores anything past 72 bytes, so cap it rather than silently truncate.
const newPassword = z
  .string({ required_error: "Enter a password." })
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.");

// Auth

export const signupSchema = z.object({
  fullName: z
    .string({ required_error: "Enter your full name." })
    .trim()
    .min(1, "Enter your full name.")
    .max(100, "Name must be 100 characters or fewer."),
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: "Enter your password." }).min(1, "Enter your password.").max(72),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password: newPassword });

// Load estimate

export const estimateRequestSchema = z.object({
  query: z
    .string({ required_error: "Ask a question that includes a US zip code or state." })
    .trim()
    .min(2, "Ask a question that includes a US zip code or state.")
    .max(TOKEN_LIMITS.estimateQuestionMaxChars, "Keep the question under 500 characters."),
});

// Freight

export const outreachRequestSchema = z.object({
  batchSize: z.number({ invalid_type_error: "batchSize must be a whole number from 1 to 10." })
    .int("batchSize must be a whole number from 1 to 10.")
    .min(1, "batchSize must be a whole number from 1 to 10.")
    .max(10, "batchSize must be a whole number from 1 to 10.")
    .default(3),
});

export const carrierReplySchema = z.object({
  carrierId: z.string().uuid("carrierId must be a carrier id."),
  replyText: z
    .string({ required_error: "Paste the carrier's reply." })
    .trim()
    .min(1, "Paste the carrier's reply.")
    .max(TOKEN_LIMITS.carrierReplyMaxChars, "Keep the reply under 4,000 characters."),
});

export const offerResponseSchema = z.object({
  action: z.enum(["approve", "counter", "reject"], { errorMap: () => ({ message: "Choose approve, counter or reject." }) }),
  counterRateDollars: z.number().positive("The counter rate must be more than $0.").optional(),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export const bookingRequestSchema = z.object({
  offerId: z.string({ required_error: "offerId and idempotencyKey are required." }).uuid("offerId must be an offer id."),
  idempotencyKey: z
    .string({ required_error: "offerId and idempotencyKey are required." })
    .min(8, "idempotencyKey must be 8 to 100 characters.")
    .max(100, "idempotencyKey must be 8 to 100 characters."),
});

export const manualComplianceSchema = z.object({
  result: z.enum(["pass", "block"]),
  authorityActive: z.boolean(),
  insuranceValid: z.boolean(),
  note: z.string().trim().min(3, "Say how you verified the carrier.").max(1000),
});

export const exceptionResolutionSchema = z.object({
  action: z.enum(["resolve", "escalate"]),
  resolution: z.string().trim().min(3, "Say what was done or why it's escalated.").max(1000),
});

export const controlActionSchema = z
  .object({
    scope: z.enum(CONTROL_SCOPES),
    scopeId: z.string().trim().min(1).max(100).nullable().optional(),
    action: z.enum(["pause", "resume", "override", "cancel"]),
    reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(1000),
  })
  .refine((b) => (b.scope === "global") === !b.scopeId, {
    message: "Global needs no target; every other scope needs one.",
    path: ["scopeId"],
  });

// The TMS webhook payload schema lives with the intake logic it describes.
export { tmsLoadPayloadSchema } from "@/lib/freight/loadIntake";

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

/** 422 VALIDATION_ERROR naming the first problem and, when there is one, its field. */
export function validationErrorResponse(error: z.ZodError): NextResponse {
  const issue = error.issues[0];
  return NextResponse.json(
    { error: "VALIDATION_ERROR", field: issue?.path.join(".") || null, message: firstIssueMessage(error) },
    { status: 422 }
  );
}

/** Parses a JSON body; a missing or malformed body fails validation like any other bad input. */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  emptyBody: unknown = null
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const raw = await request.json().catch(() => emptyBody);
  const parsed = schema.safeParse(raw ?? emptyBody);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: validationErrorResponse(parsed.error) };
}
