"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? LOADING_TEXT : "Sign out"}
    </Button>
  );
}
