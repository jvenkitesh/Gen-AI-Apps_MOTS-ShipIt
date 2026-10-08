"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { FormMessage } from "@/components/auth/FormMessage";
import { EstimateAnswerCard } from "@/components/estimate/EstimateAnswerCard";
import { EstimateInput } from "@/components/estimate/EstimateInput";
import type { EstimateResult } from "@/lib/estimate/types";

type Exchange = { id: number; question: string; result?: EstimateResult; error?: string };

type HistoryItem = { id: string; enquiry_text: string; enquired_at: string; answered_from_cache: boolean };

async function postEstimate(query: string): Promise<EstimateResult> {
  const res = await fetch("/api/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message ?? "The estimate couldn't be calculated right now. Please try again.");
  return json as EstimateResult;
}

async function getHistory(): Promise<HistoryItem[]> {
  const res = await fetch("/api/estimate/history");
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return (json?.items ?? []) as HistoryItem[];
}

export function EstimateChat() {
  const queryClient = useQueryClient();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const history = useQuery({ queryKey: ["estimate-history"], queryFn: getHistory });

  const mutation = useMutation({
    mutationFn: postEstimate,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["estimate-history"] }),
  });

  async function ask(question: string) {
    const id = Date.now();
    setExchanges((prev) => [{ id, question }, ...prev]);
    try {
      const result = await mutation.mutateAsync(question);
      setExchanges((prev) => prev.map((x) => (x.id === id ? { ...x, result } : x)));
    } catch (err) {
      const error = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setExchanges((prev) => prev.map((x) => (x.id === id ? { ...x, error } : x)));
    }
  }

  return (
    <div className="grid w-full gap-10 lg:grid-cols-[1fr_280px]">
      <section className="flex min-w-0 flex-col gap-6">
        <EstimateInput onAsk={ask} disabled={mutation.isPending} />

        {exchanges.length === 0 && (
          <Card className="p-6">
            <p className="text-body-lg text-grey-900">Ask for a freight estimate to any US zip code or state.</p>
            <p className="text-body-sm text-grey-500">
              Answers compare the routing guide with live ShipStation rates and show the cheapest option. Add a weight
              (e.g. “150 lbs”) for a closer estimate.
            </p>
          </Card>
        )}

        {exchanges.map((x) =>
          x.result ? (
            <EstimateAnswerCard key={x.id} question={x.question} result={x.result} />
          ) : x.error ? (
            <Card key={x.id} className="flex flex-col gap-2 p-6">
              <p className="text-body-sm text-grey-500">“{x.question}”</p>
              <FormMessage tone="error">{x.error}</FormMessage>
            </Card>
          ) : (
            <Card key={x.id} className="flex flex-col gap-3 p-6" aria-busy="true">
              <p className="text-body-sm text-grey-500">“{x.question}”</p>
              <p className="text-body-sm text-grey-500">Checking knowledge bases…</p>
              <div className="h-4 w-3/4 animate-pulse rounded-sm bg-grey-50" />
              <div className="h-4 w-1/2 animate-pulse rounded-sm bg-grey-50" />
            </Card>
          )
        )}
      </section>

      <aside className="flex flex-col gap-3">
        <h2 className="text-body-lg font-medium text-grey-900">Your recent questions</h2>
        {history.isLoading && <div className="h-4 w-full animate-pulse rounded-sm bg-grey-50" />}
        {!history.isLoading && (history.data ?? []).length === 0 && (
          <p className="text-body-sm text-grey-500">No questions yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(history.data ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => ask(item.enquiry_text)}
                disabled={mutation.isPending}
                className="w-full rounded-md border border-grey-100 bg-white px-3 py-2 text-left text-body-sm text-grey-900 transition duration-micro ease-out hover:bg-grey-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {item.enquiry_text}
                <span className="block text-grey-500">
                  {new Date(item.enquired_at).toLocaleString()}
                  {item.answered_from_cache ? " · from cache" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
