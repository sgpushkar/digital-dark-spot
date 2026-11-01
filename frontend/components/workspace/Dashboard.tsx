"use client";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COVERAGE_META } from "@/lib/utils";
import type { CoverageItem, Report, Source } from "@/lib/types";
import { Panel } from "@/components/ui/primitives";

const COLOR: Record<string, string> = { COVERED: "#35B779", PARTIALLY_COVERED: "#E7AD52", NEEDS_VERIFICATION: "#8B9CF6", UNCERTAIN: "#B88A3E", NOT_FOUND: "#E36C75" };

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Panel className="p-4">
      <p className="text-sm text-mute">{label}</p>
      <p className="mt-1 font-serif text-3xl" data-testid={`stat-${label}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </Panel>
  );
}

export function Dashboard({ report, coverage, sources, claimsTotal }: { report: Report; coverage: CoverageItem[]; sources: Source[]; claimsTotal: number }) {
  const s = report.executive_summary;
  const outdated = sources.filter((x) => x.freshness && ["POTENTIALLY_OUTDATED", "EXPIRED"].includes(x.freshness.label)).length;
  const unanswered = coverage.filter((c) => c.status !== "COVERED").length;
  const gaps = coverage.filter((c) => ["NOT_FOUND", "UNCERTAIN", "PARTIALLY_COVERED"].includes(c.status)).length;
  const counts = Object.keys(COVERAGE_META).map((k) => ({ key: k, name: COVERAGE_META[k].label, count: coverage.filter((c) => c.status === k).length }));
  const verified = report.key_extracted_information.length;
  const sc = report.completeness;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sources analyzed" value={sources.filter((x) => x.extraction_status === "done").length} hint={`${sources.length} added`} />
        <Stat label="Extracted claims" value={claimsTotal} hint={`${verified} with verified quotes`} />
        <Stat label="Potential gaps" value={gaps} />
        <Stat label="Possible contradictions" value={s.possible_contradictions} />
        <Stat label="Potentially outdated" value={outdated} hint="sources" />
        <Stat label="Unanswered questions" value={unanswered} />
        <Stat label="Coverage" value={`${coverage.length ? Math.round((coverage.filter((c) => c.status === "COVERED").length / coverage.length) * 100) : 0}%`} hint="categories fully covered" />
        <Stat label="Completeness score" value={sc?.score != null ? sc.score : "n/a"} hint="product metric, not truth" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h3 className="text-lg">Coverage by status</h3>
          <div className="mt-2 h-56" role="img" aria-label={`Coverage: ${counts.map((c) => `${c.count} ${c.name}`).join(", ")}`}>
            <ResponsiveContainer>
              <BarChart data={counts} layout="vertical" margin={{ left: 40, right: 16 }}>
                <XAxis type="number" allowDecimals={false} stroke="#929BA8" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#929BA8" fontSize={12} width={130} />
                <Tooltip contentStyle={{ background: "#191F27", border: "1px solid #242B35", borderRadius: 6 }} cursor={{ fill: "#191F27" }} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>{counts.map((c) => <Cell key={c.key} fill={COLOR[c.key]} />)}</Bar>
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
  if (!score?.components) return <Panel className="p-4 text-sm text-mute">No score yet.</Panel>;
  return (
    <Panel className="p-4">
      <h3 className="text-lg">Why the score is {score.score}</h3>
      <ul className="mt-3 space-y-3">
        {(Object.entries(score.components) as [string, Report["completeness"]["components"]["coverage"]][]).map(([k, c]) => (
          <li key={k}>
            <div className="flex items-baseline justify-between text-sm"><span className="capitalize">{k} <span className="text-mute">(weight {Math.round(c.weight * 100)}%)</span></span><span>{Math.round(c.score * 100)}%</span></div>
            <div className="mt-1 h-1.5 rounded bg-elevated" role="presentation"><div className="h-1.5 rounded bg-accent" style={{ width: `${c.score * 100}%` }} /></div>
            <details className="mt-1 text-xs text-mute"><summary className="cursor-pointer">How this is calculated</summary><p className="mt-1">{c.method}</p>
              {k === "freshness" && (c.unknown_date_sources?.length ?? 0) > 0 && <p className="mt-1">Unknown date: {c.unknown_date_sources!.join(", ")}</p>}</details>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-mute">{score.disclaimer}</p>
    </Panel>
  );
}
