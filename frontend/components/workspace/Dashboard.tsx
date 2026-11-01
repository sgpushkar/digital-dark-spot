"use client";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COVERAGE_META } from "@/lib/utils";
import type { CoverageItem, Report, Source } from "@/lib/types";
import { Panel } from "@/components/ui/primitives";
import { FileCheck, AlertTriangle, Clock, HelpCircle, Layers, CheckCircle2, Info } from "lucide-react";

// User-specified semantic palette
const COLOR: Record<string, string> = {
  COVERED: "#438568",           // --color-success
  PARTIALLY_COVERED: "#D49A42", // --color-warning
  NEEDS_VERIFICATION: "#789487",// --color-muted
  UNCERTAIN: "#92978F",         // --color-neutral
  NOT_FOUND: "#C65D55",         // --color-danger
};

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  variant,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: any;
  variant?: "danger" | "warning" | "success" | "neutral";
}) {
  return (
    <Panel className="relative p-4 transition-all hover:border-line hover:shadow-sm">
      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-mute">
        <span>{label}</span>
        {Icon && <Icon className="h-4 w-4 text-mute/80" />}
      </div>
      <p
        className="mt-2 font-mono text-2xl sm:text-3xl font-bold tracking-tight text-heading"
        data-testid={`stat-${label}`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-xs text-mute font-body flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-line" />
          <span>{hint}</span>
        </p>
      )}
    </Panel>
  );
}

export function Dashboard({
  report,
  coverage,
  sources,
  claimsTotal,
}: {
  report: Report;
  coverage: CoverageItem[];
  sources: Source[];
  claimsTotal: number;
}) {
  const s = report.executive_summary;
  const outdated = sources.filter((x) => x.freshness && ["POTENTIALLY_OUTDATED", "EXPIRED"].includes(x.freshness.label)).length;
  const unanswered = coverage.filter((c) => c.status !== "COVERED").length;
  const gaps = coverage.filter((c) => ["NOT_FOUND", "UNCERTAIN", "PARTIALLY_COVERED"].includes(c.status)).length;
  const counts = Object.keys(COVERAGE_META).map((k) => ({
    key: k,
    name: COVERAGE_META[k].label,
    count: coverage.filter((c) => c.status === k).length,
  }));
  const verified = report.key_extracted_information.length;
  const sc = report.completeness;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Sources analyzed"
          value={sources.filter((x) => x.extraction_status === "done").length}
          hint={`${sources.length} added`}
          icon={Layers}
        />
        <Stat
          label="Extracted claims"
          value={claimsTotal}
          hint={`${verified} with verified quotes`}
          icon={FileCheck}
        />
        <Stat
          label="Potential gaps"
          value={gaps}
          variant={gaps > 0 ? "warning" : "neutral"}
          icon={HelpCircle}
        />
        <Stat
          label="Possible contradictions"
          value={s.possible_contradictions}
          variant={s.possible_contradictions > 0 ? "danger" : "neutral"}
          icon={AlertTriangle}
        />
        <Stat
          label="Potentially outdated"
          value={outdated}
          hint="sources"
          icon={Clock}
        />
        <Stat
          label="Unanswered questions"
          value={unanswered}
          icon={HelpCircle}
        />
        <Stat
          label="Coverage"
          value={`${coverage.length ? Math.round((coverage.filter((c) => c.status === "COVERED").length / coverage.length) * 100) : 0}%`}
          hint="categories fully covered"
          icon={CheckCircle2}
        />
        <Stat
          label="Completeness score"
          value={sc?.score != null ? sc.score : "n/a"}
          hint="product metric, not truth"
          icon={Info}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-mute">Audit Distribution</span>
              <h3 className="font-heading font-bold text-lg text-heading">Coverage by status</h3>
            </div>
            <span className="font-mono text-xs text-mute">{coverage.length} categories</span>
          </div>

          <div
            className="mt-4 h-64"
            role="img"
            aria-label={`Coverage: ${counts.map((c) => `${c.count} ${c.name}`).join(", ")}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={counts} layout="vertical" margin={{ top: 5, left: 10, right: 20, bottom: 5 }}>
                <XAxis
                  type="number"
                  allowDecimals={false}
                  stroke="#789487"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#789487"
                  fontSize={12}
                  width={140}
                  tickLine={false}
                  fontFamily="var(--font-body)"
                />
                <Tooltip
                  contentStyle={{
                    background: "#FFFFFF",
                    border: "1px solid #D8DAD1",
                    borderRadius: 8,
                    color: "#242823",
                    fontSize: 12,
                    boxShadow: "0 4px 12px rgba(24, 59, 50, 0.08)",
                  }}
                  cursor={{ fill: "rgba(24, 59, 50, 0.04)" }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {counts.map((c) => (
                    <Cell key={c.key} fill={COLOR[c.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <ScoreBreakdown score={sc} />
      </div>
    </div>
  );
}

export function ScoreBreakdown({ score }: { score: Report["completeness"] }) {
  if (!score?.components) return <Panel className="p-5 text-sm text-mute">No score yet.</Panel>;

  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-mute">Deductive Synthesis</span>
          <h3 className="font-heading font-bold text-lg text-heading">Why the score is {score.score}</h3>
        </div>
        <span className="rounded bg-accent/30 text-primary border border-primary/20 px-2 py-0.5 font-mono text-xs font-bold">
          {score.score} / 100
        </span>
      </div>

      <ul className="mt-4 space-y-4">
        {(Object.entries(score.components) as [string, Report["completeness"]["components"]["coverage"]][]).map(([k, c]) => (
          <li key={k} className="rounded-lg border border-line/60 bg-elevated/30 p-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="capitalize font-medium text-heading">
                {k} <span className="font-mono text-xs text-mute font-normal">(weight {Math.round(c.weight * 100)}%)</span>
              </span>
              <span className="font-mono text-sm font-bold text-heading">{Math.round(c.score * 100)}%</span>
            </div>

            <div className="mt-2 h-2 rounded-full bg-elevated overflow-hidden" role="presentation">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${c.score * 100}%` }}
              />
            </div>

            <details className="mt-2 text-xs text-mute">
              <summary className="cursor-pointer select-none hover:text-heading font-mono text-[11px] underline underline-offset-2">
                How this is calculated
              </summary>
              <div className="mt-1.5 space-y-1 rounded bg-surface p-2 border border-line text-xs font-body text-ink">
                <p>{c.method}</p>
                {k === "freshness" && (c.unknown_date_sources?.length ?? 0) > 0 && (
                  <p className="font-mono text-[11px] text-mute pt-1 border-t border-line/60">
                    Unknown date: {c.unknown_date_sources!.join(", ")}
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-mute font-body italic leading-relaxed border-t border-line/60 pt-3">
        {score.disclaimer}
      </p>
    </Panel>
  );
}
