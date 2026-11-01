import { COVERAGE_META, FRESH_META, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

export function CoverageBadge({ status }: { status: string }) {
  const m = COVERAGE_META[status] ?? COVERAGE_META.UNCERTAIN;
  return <Badge className={m.tone}><span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} aria-hidden />{m.label}</Badge>;
}
export function FreshnessBadge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  const m = FRESH_META[label] ?? FRESH_META.DATE_UNAVAILABLE;
  return <Badge className={m.tone}>{m.label}</Badge>;
}
const EPI: Record<string, { t: string; c: string }> = {
  supported: { t: "Evidence-backed", c: "text-ok border-ok/40 bg-ok/10" },
  inference: { t: "Inference from evidence", c: "text-accent border-accent/40 bg-accent/10" },
  uncertain: { t: "Uncertain: needs review", c: "text-warn border-warn/40 bg-warn/10" },
};
export function EpistemicBadge({ status }: { status: string }) {
  const m = EPI[status] ?? EPI.uncertain;
  return <Badge className={m.c}>{m.t}</Badge>;
}
export function SeverityBadge({ severity }: { severity: string }) {
  const c = severity === "high" ? "text-bad border-bad/40 bg-bad/10" : severity === "medium" ? "text-warn border-warn/40 bg-warn/10" : "text-mute border-line bg-elevated";
  return <Badge className={c}>{severity[0].toUpperCase() + severity.slice(1)} severity</Badge>;
}
export function PriorityBadge({ priority }: { priority: string }) {
  const c = priority === "HIGH" ? "text-bad border-bad/40 bg-bad/10" : priority === "MEDIUM" ? "text-warn border-warn/40 bg-warn/10" : "text-mute border-line bg-elevated";
  return <Badge className={c}>{priority[0] + priority.slice(1).toLowerCase()} priority</Badge>;
}
