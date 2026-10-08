import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { USER_ROLE_LABELS, isUserRole } from "@/types/userRole";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/loads", label: "Loads" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/carriers", label: "Carriers" },
  { href: "/policies", label: "Policies" },
  { href: "/estimate", label: "Estimate" },
  { href: "/reports", label: "Reports" },
];

// App shell for all authenticated routes. Session check is enforced in
// middleware.ts, not here -- this layout only renders shared chrome (nav, user).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = user?.email ?? "";
  let roleLabel: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .schema("data_foundation")
      .from("user_profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.full_name) displayName = profile.full_name;
    if (isUserRole(profile?.role)) roleLabel = USER_ROLE_LABELS[profile.role];
  }

  return (
    <div className="min-h-screen bg-grey-25">
      <header className="border-b border-grey-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-16">
          <nav className="flex flex-wrap items-center gap-6">
            <Link href="/dashboard" className="text-body-lg font-medium text-blue-500">
              MOTS ShipIt
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm text-body-lg font-medium text-grey-500 transition duration-micro ease-out hover:text-grey-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {user && (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-body-lg font-medium text-grey-900">{displayName}</span>
                {roleLabel && <span className="text-body-sm text-grey-500">{roleLabel}</span>}
              </div>
              <SignOutButton />
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
