"use client";

import { useId } from "react";

type InfoTipProps = {
  label: string;
  definition: string;
};

// The ⓘ that follows a label. Shows the label's definition on hover or keyboard focus.
export function InfoTip({ label, definition }: InfoTipProps) {
  const tooltipId = useId();
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-describedby={tooltipId}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-grey-300 text-body-sm font-medium leading-none text-grey-500 transition duration-micro ease-out hover:border-blue-500 hover:text-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
      >
        i
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-md bg-grey-900 px-3 py-2 text-left text-body-sm font-normal normal-case text-white opacity-0 shadow-elevation-2 transition duration-popover ease-out group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {definition}
      </span>
    </span>
  );
}
