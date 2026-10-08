import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-white px-4 py-12 text-center sm:px-16">
      <span className="rounded-sm border border-blue-200 bg-blue-50 px-2 py-0.5 text-body-sm font-medium text-blue-700">
        Powered by Anthropic Claude
      </span>

      <h1 className="text-h2 text-grey-900 sm:text-h1">
        Cover every load.
        <br />
        Touch only the exceptions.
      </h1>

      <p className="max-w-xl text-body-lg text-grey-500">
        MOTS ShipIt sources carriers in parallel, negotiates inside your guardrails,
        verifies FMCSA authority and insurance before anything is booked, and writes the
        result back to your TMS -- with every decision logged for audit.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/signup"
          className="rounded-md bg-blue-500 px-8 py-3 text-body-lg font-medium text-white transition duration-micro ease-out hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-grey-200 px-8 py-3 text-body-lg font-medium text-grey-900 transition duration-micro ease-out hover:bg-grey-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Log in
        </Link>
      </div>

      <p className="text-body-sm text-grey-500">
        Dry van and reefer truckload, contiguous U.S. -- hard compliance gates on every booking.
      </p>
    </main>
  );
}
