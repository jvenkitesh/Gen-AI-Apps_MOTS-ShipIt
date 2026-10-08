import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Sign-up is open to approved company email addresses. We'll email you a link to confirm your account."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-500 hover:text-blue-600">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
