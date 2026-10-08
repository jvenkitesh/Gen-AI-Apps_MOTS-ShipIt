"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";
import { FormField } from "@/components/auth/FormField";
import { FormMessage } from "@/components/auth/FormMessage";
import { useJsonForm } from "@/lib/hooks/useJsonForm";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const { submit, isSubmitting, error, success } = useJsonForm("/api/auth/forgot-password");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submit({ email });
  }

  if (success) {
    return <FormMessage tone="success">{success}</FormMessage>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? LOADING_TEXT : "Send reset link"}
      </Button>
    </form>
  );
}
