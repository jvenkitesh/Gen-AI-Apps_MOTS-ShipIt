import Link from "next/link";

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
// middleware.ts, not here -- this layout only renders shared chrome (nav).
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-grey-25">
      <header className="border-b border-grey-100 bg-white">
        <nav className="flex flex-wrap items-center gap-6 px-4 py-3 sm:px-16">
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
      </header>
      {children}
    </div>
  );
}
