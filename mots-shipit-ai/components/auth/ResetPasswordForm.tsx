"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";
import { FormField } from "@/components/auth/FormField";
import { FormMessage } from "@/components/auth/FormMessage";
import { useJsonForm } from "@/lib/hooks/useJsonForm";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const { submit, isSubmitting, error, success } = useJsonForm("/api/auth/reset-password");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const result = await submit({ password });
    if (result.ok) {
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    }
  }

  if (success) {
    return <FormMessage tone="success">{success} Taking you to your dashboard…</FormMessage>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {mismatch && <FormMessage tone="error">The two passwords don&apos;t match.</FormMessage>}
      {error && !mismatch && <FormMessage tone="error">{error}</FormMessage>}
      <FormField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? LOADING_TEXT : "Set new password"}
      </Button>
    </form>
  );
}
