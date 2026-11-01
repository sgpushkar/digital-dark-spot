"use client";
import { Printer } from "lucide-react";
import type { Report } from "@/lib/types";
import { Button, Panel } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { CoverageBadge, FreshnessBadge, PriorityBadge } from "./badges";
import { ScoreBreakdown } from "./Dashboard";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section className="break-inside-avoid space-y-2"><h2 className="text-xl">{n}. {title}</h2>{children}</section>;
}

export function ReportView({ report }: { report: Report }) {
  const cov = report.information_coverage as { category: string; label: string; status: string; explanation: string; claim_refs: string[] }[];
  const conflicts = report.possible_contradictions as { conflict_id: string; explanation: string; severity: string; recommended_verification: string }[];
  return (
    <article className="space-y-8" aria-label="Research report">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-mute">Generated {new Date((report as any).generated_at ?? Date.now()).toLocaleString()}</p>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print or save as PDF</Button>
      </div>
      {report.is_demo && <p className="rounded border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Demonstration report: all sources are fictional.</p>}
      <Section n={1} title="Research objective">
        <p className="prose-line">{report.research_objective.question}</p>
        {report.research_objective.objective && <p className="prose-line text-mute">{report.research_objective.objective}</p>}
        <p className="text-xs text-mute">Information categories came from: {report.research_objective.category_method}</p>
      </Section>
      <Section n={2} title="Sources reviewed">
        <ul className="space-y-1 text-sm">{report.sources_reviewed.map((s) => (
          <li key={s.ref}><span className="font-mono text-xs text-mute">{s.ref}</span> {s.title ?? s.url} <span className="text-mute">· published {fmtDate(s.publication_date)} · modified {fmtDate(s.modified_date)}</span> <FreshnessBadge label={s.freshness} /></li>))}</ul>
      </Section>
      <Section n={3} title="Executive summary"><p className="prose-line">{report.executive_summary.text}</p></Section>
      <Section n={4} title="Key extracted information">
        <ul className="space-y-2 text-sm">{report.key_extracted_information.map((k) => <li key={k.claim_ref}><strong>{k.category}:</strong> {k.value} <span className="text-mute">({k.source_ref}, {k.claim_ref}) “{k.evidence_quote}”</span></li>)}</ul>
      </Section>
      <Section n={5} title="Information coverage">
        <ul className="space-y-2 text-sm">{cov.map((c) => <li key={c.category} className="flex flex-wrap items-center gap-2"><CoverageBadge status={c.status} /><span>{c.label}</span><span className="text-mute">{c.explanation}</span></li>)}</ul>
      </Section>
      <Section n={6} title="Potential information gaps">
        {report.potential_information_gaps.length === 0 ? <p className="text-sm text-mute">None identified.</p> :
          <ul className="space-y-2 text-sm">{report.potential_information_gaps.map((g) => <li key={g.title}>{g.title}. <span className="text-mute">{g.description}</span></li>)}</ul>}
      </Section>
      <Section n={7} title="Possible contradictions">
        {conflicts.length === 0 ? <p className="text-sm text-mute">None detected.</p> : <ul className="space-y-2 text-sm">{conflicts.map((c) => <li key={c.conflict_id}>{c.explanation} <span className="text-mute">{c.recommended_verification}</span></li>)}</ul>}
      </Section>
      <Section n={8} title="Potentially outdated information">
        {report.potentially_outdated_information.length === 0 ? <p className="text-sm text-mute">All sources appear current.</p> :
          <ul className="space-y-2 text-sm">{report.potentially_outdated_information.map((f) => <li key={f.source_ref}><span className="font-mono text-xs text-mute">{f.source_ref}</span> <FreshnessBadge label={f.label} /> <span className="text-mute">{f.reasons.join(" ")}</span></li>)}</ul>}
      </Section>
      <Section n={9} title="Unanswered questions">
        <ul className="list-disc space-y-1 pl-5 text-sm">{report.unanswered_questions.map((u) => <li key={u.category}>{u.question} <span className="text-mute">({u.category})</span></li>)}</ul>
      </Section>
      <Section n={10} title="Verification checklist">
        <ul className="space-y-2 text-sm">{report.verification_checklist.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-2"><span aria-hidden>{t.status === "COMPLETED" ? "☑" : "☐"}</span>{t.title}<PriorityBadge priority={t.priority} /></li>)}</ul>
      </Section>
      <Section n={11} title="Limitations and uncertainty">
        <ul className="list-disc space-y-1 pl-5 text-sm text-mute">{report.limitations_and_uncertainty.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <Panel className="mt-3 print:hidden"><ScoreBreakdown score={report.completeness} /></Panel>
      </Section>
    </article>
  );
}
