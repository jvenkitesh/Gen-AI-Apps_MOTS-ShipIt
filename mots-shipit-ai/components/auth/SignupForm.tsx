"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";
import { FormField } from "@/components/auth/FormField";
import { FormMessage } from "@/components/auth/FormMessage";
import { useJsonForm } from "@/lib/hooks/useJsonForm";

export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { submit, isSubmitting, error, success } = useJsonForm("/api/auth/signup");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submit({ fullName, email, password });
  }

  if (success) {
    return <FormMessage tone="success">{success}</FormMessage>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <FormField
        id="fullName"
        label="Full name"
        autoComplete="name"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <FormField
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? LOADING_TEXT : "Create account"}
      </Button>
    </form>
  );
}
