"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const EXAMPLES = ["Estimate to zip 30303", "Cost to California for 150 lbs", "How long to ship to Texas by reefer?"];

export function EstimateInput({ onAsk, disabled }: { onAsk: (query: string) => void; disabled: boolean }) {
  const [query, setQuery] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="estimate-query" className="sr-only">
          Ask for a load estimate
        </label>
        <Input
          id="estimate-query"
          placeholder="Ask for an estimate, e.g. “cost to 30303 for 40 lbs”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={500}
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !query.trim()} className="shrink-0">
          Get estimate
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm text-grey-500">Try:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(example)}
            className="rounded-sm border border-grey-200 bg-white px-2 py-1 text-body-sm text-grey-900 transition duration-micro ease-out hover:bg-grey-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
