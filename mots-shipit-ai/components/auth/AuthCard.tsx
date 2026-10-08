import Link from "next/link";
import { Card } from "@/components/ui/Card";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-grey-25 px-4 py-12">
      <Link href="/" className="text-body-lg font-medium text-blue-500">
        MOTS ShipIt
      </Link>
      <Card className="flex w-full max-w-sm flex-col gap-6 p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-h5 text-grey-900">{title}</h1>
          {subtitle && <p className="text-body-sm text-grey-500">{subtitle}</p>}
        </div>
        {children}
      </Card>
      {footer && <div className="text-body-sm text-grey-500">{footer}</div>}
    </main>
  );
}
