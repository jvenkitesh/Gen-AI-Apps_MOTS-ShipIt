import { LoadingIndicator } from "@/components/ui/LoadingIndicator";

export default function AppLoading() {
  return (
    <main className="flex w-full px-4 py-12 sm:px-16">
      <LoadingIndicator />
    </main>
  );
}
