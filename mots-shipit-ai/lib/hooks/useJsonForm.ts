"use client";

import { useState } from "react";

type SubmitResult = { ok: boolean; status: number; message?: string; data?: Record<string, unknown> | null };

// Posts JSON to an API route and tracks submitting / error / success message state.
export function useJsonForm(endpoint: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(body: Record<string, unknown>): Promise<SubmitResult> {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as ({ message?: string } & Record<string, unknown>) | null;
      if (res.ok) {
        if (json?.message) setSuccess(json.message);
      } else {
        setError(json?.message ?? "Something went wrong. Please try again.");
      }
      return { ok: res.ok, status: res.status, message: json?.message, data: json };
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
      return { ok: false, status: 0 };
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, isSubmitting, error, success };
}
