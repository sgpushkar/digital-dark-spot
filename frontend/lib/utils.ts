import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const COVERAGE_META: Record<string, { label: string; tone: string; dot: string }> = {
  COVERED: { label: "Covered", tone: "text-ok border-ok/40 bg-ok/10", dot: "bg-ok" },
  PARTIALLY_COVERED: { label: "Partially covered", tone: "text-warn border-warn/40 bg-warn/10", dot: "bg-warn" },
  NEEDS_VERIFICATION: { label: "Needs verification", tone: "text-accent border-accent/40 bg-accent/10", dot: "bg-accent" },
  UNCERTAIN: { label: "Uncertain", tone: "text-warn border-warn/40 bg-warn/10", dot: "bg-warn" },
  NOT_FOUND: { label: "Not found", tone: "text-bad border-bad/40 bg-bad/10", dot: "bg-bad" },
};
export const FRESH_META: Record<string, { label: string; tone: string }> = {
  CURRENT: { label: "Current", tone: "text-ok border-ok/40 bg-ok/10" },
  POTENTIALLY_OUTDATED: { label: "Potentially outdated", tone: "text-warn border-warn/40 bg-warn/10" },
  EXPIRED: { label: "Expired", tone: "text-bad border-bad/40 bg-bad/10" },
  UNDATED: { label: "Undated", tone: "text-mute border-line bg-elevated" },
  DATE_UNAVAILABLE: { label: "Date unavailable", tone: "text-mute border-line bg-elevated" },
};
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "unknown");
export const fmtMs = (ms: number | null | undefined) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/** Wrap the first occurrence of `quote` inside `text` so the supporting passage is visible in context. */
export function splitAround(text: string, quote: string): { before: string; hit: string; after: string } | null {
  const norm = (s: string) => s.replace(/\s+/g, " ");
  const t = norm(text), q = norm(quote).trim();
  const i = q ? t.indexOf(q) : -1;
  if (i < 0) return null;
  return { before: t.slice(0, i), hit: t.slice(i, i + q.length), after: t.slice(i + q.length) };
}
