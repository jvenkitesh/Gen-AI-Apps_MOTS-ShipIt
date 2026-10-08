import { Card } from "@/components/ui/Card";

type PagePlaceholderProps = {
  title: string;
  description: string;
  spec: string;
};

// Stage 3 scaffold only -- each page is replaced by its real feature in Stage 4.
export function PagePlaceholder({ title, description, spec }: PagePlaceholderProps) {
  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <section className="flex w-full flex-col gap-6">
        <h1 className="text-h5 text-grey-900">{title}</h1>
        <Card className="flex flex-col gap-2 p-6">
          <p className="text-body-lg text-grey-900">{description}</p>
          <p className="text-body-sm text-grey-500">
            Not built yet -- see <span className="font-mono">specs/{spec}</span>
          </p>
        </Card>
      </section>
    </main>
  );
}
