"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/auth/FormField";
import { FormMessage } from "@/components/auth/FormMessage";
import { useJsonForm } from "@/lib/hooks/useJsonForm";

export function LoginForm({ notice }: { notice?: { tone: "error" | "success"; text: string } }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { submit, isSubmitting, error } = useJsonForm("/api/auth/login");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await submit({ email, password });
    if (result.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {notice && !error && <FormMessage tone={notice.tone}>{notice.text}</FormMessage>}
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
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-body-sm font-medium text-blue-500 hover:text-blue-600">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
