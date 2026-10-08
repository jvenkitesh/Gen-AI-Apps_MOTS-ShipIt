import { EstimateChat } from "@/components/estimate/EstimateChat";

export default function EstimatePage() {
  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h5 text-grey-900">Load estimate</h1>
        <p className="text-body-sm text-grey-500">
          Transit time and freight cost from the North America routing guide and live ShipStation rates. Estimates only:
          nothing is booked.
        </p>
      </div>
      <EstimateChat />
    </main>
  );
}
