import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";

const NOTICES: Record<string, { tone: "error" | "success"; text: string }> = {
  link_invalid: {
    tone: "error",
    text: "That link is invalid or has expired. Log in, or request a new link.",
  },
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const notice = searchParams.error ? NOTICES[searchParams.error] : undefined;

  return (
    <AuthCard
      title="Log in"
      subtitle="Use your work email to access the ShipIt operations console."
      footer={
        <>
          New to ShipIt?{" "}
          <Link href="/signup" className="font-medium text-blue-500 hover:text-blue-600">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm notice={notice} />
    </AuthCard>
  );
}
