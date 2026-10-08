import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

// Reached from the password-reset email via /auth/confirm, which signs the user in first.
// middleware.ts sends visitors without that session back to /login.
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password for your ShipIt account.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
