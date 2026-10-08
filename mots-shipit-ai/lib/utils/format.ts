export const formatDollars = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatPounds = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Number(n).toLocaleString("en-US")} lb`;

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

// For text that leaves the app (carrier messages): always explicit about the time zone.
export const formatDateTimeUtc = (iso: string | null | undefined) =>
  iso ? `${new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : "—";

export const EQUIPMENT_LABELS: Record<string, string> = { dry_van: "Dry van", reefer: "Reefer" };
