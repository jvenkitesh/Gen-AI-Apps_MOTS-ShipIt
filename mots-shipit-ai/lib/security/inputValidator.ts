import { z } from "zod";

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

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
