"use client";
import * as Tabs from "@radix-ui/react-tabs";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useLoad, usePipelineEvents } from "@/lib/hooks";
import type { StageInfo } from "@/lib/types";
import { Button, DemoBanner, EmptyState, ErrorState, Panel, Spinner } from "@/components/ui/primitives";
import { Checklist } from "@/components/workspace/Checklist";
import { ContradictionExplorer } from "@/components/workspace/ContradictionExplorer";
import { CoverageMatrix } from "@/components/workspace/CoverageMatrix";
import { Dashboard } from "@/components/workspace/Dashboard";
import { EvidenceDrawer } from "@/components/workspace/EvidenceDrawer";
import { EvidenceExplorer } from "@/components/workspace/EvidenceExplorer";
import { PipelineView, mergeStages } from "@/components/workspace/PipelineView";
import { ReportView } from "@/components/workspace/ReportView";
import { SourcesPanel } from "@/components/workspace/SourcesPanel";
import { WorkspacePipelineTracker } from "@/components/workspace/WorkspacePipelineTracker";
import MissionControlTheater from "@/components/workspace/MissionControlTheater";
import { Sparkles } from "lucide-react";
import { cn, fmtMs } from "@/lib/utils";

const TABS = [
  ["pipeline", "Pipeline"], ["dashboard", "Dashboard"], ["coverage", "Coverage"], ["contradictions", "Contradictions"],
  ["evidence", "Evidence"], ["checklist", "Checklist"], ["report", "Report"], ["sources", "Sources"],
] as const;

export default function Workspace() {
  const { id } = useParams<{ id: string }>();
  const notes = useSearchParams().get("notes");
  const session = useLoad(() => api.getResearch(id), [id]);
  const status = useLoad(() => api.status(id), [id]);
  const cfg = useLoad(() => api.config(), []);
  const { events, connected, reset } = usePipelineEvents(id, true);
  const [tab, setTab] = useState("pipeline");
  const [claimRef, setClaimRef] = useState<string | null>(null);
  const [selected, setSelected] = useState<StageInfo | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [theaterOpen, setTheaterOpen] = useState(false);

  const running = status.data?.status === "running" || session.data?.status === "running" || events.some((e) => e.type === "run" && e.status === "started") && !events.some((e) => e.type === "run" && e.status.startsWith("completed"));
  const finished = (status.data?.status ?? "").startsWith("completed");
  const lastRun = events.filter((e) => e.type === "run").at(-1)?.status;

  // Real progress only: refresh persisted state while a run is active and once more when it ends.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => status.reload(), 2000);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const [version, setVersion] = useState(0);
  useEffect(() => { if (lastRun && lastRun !== "started") { status.reload(); session.reload(); setVersion((v) => v + 1); } }, [lastRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = finished || (lastRun?.startsWith("completed") ?? false);
  const report = useLoad(() => (ready ? api.report(id) : Promise.resolve(null)), [id, ready, version]);
  const coverage = useLoad(() => (ready ? api.coverage(id) : Promise.resolve(null)), [id, ready, version]);
  const claims = useLoad(() => (ready ? api.claims(id) : Promise.resolve(null)), [id, ready, version]);
  const sources = useLoad(() => api.sources(id), [id, ready, version]);
  const cons = useLoad(() => (ready ? api.contradictions(id) : Promise.resolve(null)), [id, ready, version]);
  const checklist = useLoad(() => (ready ? api.checklist(id) : Promise.resolve(null)), [id, ready, version]);

  const stages = useMemo(() => mergeStages(status.data?.stages ?? [], events), [status.data, events]);
  const onSelect = useCallback((s: StageInfo) => setSelected(s), []);

  const start = async () => {
    setStarting(true); setStartErr(null); reset();
    setTheaterOpen(true);
    try { await api.analyze(id); status.reload(); session.reload(); } catch (e) { setStartErr((e as Error).message); } finally { setStarting(false); }
  };

  if (session.loading && !session.data) return <div className="mx-auto max-w-6xl px-4"><Spinner label="Loading workspace" /></div>;
  if (session.error || !session.data) return <div className="mx-auto max-w-6xl px-4 py-10"><ErrorState message={session.error ?? "Workspace not found"} onRetry={session.reload} /></div>;
  const s = session.data;
  const gapsCount = coverage.data?.items?.filter((x) => x.status === "NOT_FOUND" || x.status === "NEEDS_VERIFICATION").length;
  const conflictsCount = cons.data?.items?.length;
  const claimsCount = claims.data?.total;
  const tasksCount = checklist.data?.items?.length;

  const getTabBadge = (k: string) => {
    if (k === "pipeline" && running) return <span className="h-2 w-2 rounded-full bg-accent animate-ping" />;
    if (!ready) return null;
    if (k === "coverage" && gapsCount != null && gapsCount > 0) return <span className="rounded bg-warn/20 px-1.5 py-0.2 text-[11px] font-mono font-bold text-warn">{gapsCount}</span>;
    if (k === "contradictions" && conflictsCount != null && conflictsCount > 0) return <span className="rounded bg-bad/20 px-1.5 py-0.2 text-[11px] font-mono font-bold text-bad">{conflictsCount}</span>;
    if (k === "checklist" && tasksCount != null && tasksCount > 0) return <span className="rounded bg-elevated px-1.5 py-0.2 text-[11px] font-mono text-mute">{tasksCount}</span>;
    if (k === "evidence" && claimsCount != null) return <span className="rounded bg-elevated px-1.5 py-0.2 text-[11px] font-mono text-mute">{claimsCount}</span>;
    if (k === "sources" && sources.data?.items?.length) return <span className="rounded bg-elevated px-1.5 py-0.2 text-[11px] font-mono text-mute">{sources.data.items.length}</span>;
    return null;
  };

  const needsRun = (tabName: string) => <EmptyState title="Run the analysis first">{tabName} appears here once the analysis has finished.</EmptyState>;
  const body = (loader: { loading: boolean; error: string | null; reload: () => void }, render: () => React.ReactNode) =>
    !ready ? needsRun("Results") : loader.error ? <ErrorState message={loader.error} onRetry={loader.reload} /> : loader.loading ? <Spinner /> : render();

  return (
    <div>
      {s.is_demo && <DemoBanner label={cfg.data?.demo_label} />}
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl md:text-3xl">{s.title}</h1>
            <div className="flex items-center gap-3">
              <Button onClick={start} loading={starting || running} disabled={running}>
                {ready ? "Re-run analysis" : running ? "Analysing" : "Start analysis"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTheaterOpen(true)}
                className="flex items-center gap-1.5 border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
                title="Launch Fullscreen Mission Control Theater"
              >
                <Sparkles className="h-4 w-4" />
                Mission Control Theater
              </Button>
            </div>
          </div>
          <p className="prose-line text-mute text-base">{s.research_question}</p>
          {cfg.data && (
            <p className="text-xs text-mute flex items-center gap-2">
              <span>Extraction: <strong className="text-ink font-mono">{cfg.data.extraction_mode === "llm" ? `LLM (${cfg.data.llm_provider})` : "rule-based"}</strong></span>
              <span>·</span>
              <span>Retrieval: <strong className="text-ink font-mono">{cfg.data.embedder}</strong>{cfg.data.semantic_embeddings ? " (semantic)" : " (lexical)"}</span>
              {!connected && running && <span className="text-warn">(reconnecting live channel)</span>}
            </p>
          )}
          {notes && <p role="status" className="rounded border border-warn/40 bg-warn/10 p-2 text-sm text-warn">Some inputs were not added: {notes.split("|").join("; ")}</p>}
        </header>

        {startErr && <ErrorState message={startErr} />}
        {status.data && status.data.errors.length > 0 && (
          <Panel className="space-y-1 border-warn/40 p-3 text-sm" role="alert">
            <p className="font-medium text-warn">Some steps reported problems. Results from the rest are preserved.</p>
            <ul className="list-disc pl-5 text-mute">{status.data.errors.map((e, i) => <li key={i}>{e.stage}{e.source ? ` (${e.source})` : ""}: {e.error}</li>)}</ul>
          </Panel>
        )}

        {/* Live Pipeline Tracker: Always Visible Across All Tabs */}
        <WorkspacePipelineTracker
          stages={stages}
          running={running}
          ready={ready}
          onSelectStage={onSelect}
          onSelectTab={setTab}
          reportData={report.data}
          claimsCount={claimsCount}
          conflictsCount={conflictsCount}
          gapsCount={gapsCount}
          tasksCount={tasksCount}
        />

        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List className="-mx-1 flex gap-1 overflow-x-auto border-b border-line" aria-label="Workspace sections">
            {TABS.map(([k, l]) => (
              <Tabs.Trigger
                key={k}
                value={k}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors",
                  tab === k ? "border-accent text-ink font-semibold" : "border-transparent text-mute hover:text-ink"
                )}
              >
                <span>{l}</span>
                {getTabBadge(k)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <div className="pt-6">
            <Tabs.Content value="pipeline" className="space-y-4">
              {status.loading && !status.data ? <Spinner /> : status.error ? <ErrorState message={status.error} onRetry={status.reload} /> : (
                <>
                  <PipelineView stages={stages} onSelect={onSelect} selectedStage={selected} events={events} onSelectTab={setTab} />
                  {selected && (() => {
                    const cur = stages.find((x) => x.stage === selected.stage) ?? selected;
                    const stats = cur.stats ?? {};
                    return (
                      <Panel className="p-5 space-y-3 border-accent/40 bg-surface/90">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
                          <div>
                            <span className="text-xs uppercase font-mono tracking-wider text-mute">Stage Inspector</span>
                            <h3 className="text-base font-bold text-ink">{cur.label}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "rounded px-2 py-0.5 text-xs font-mono font-medium uppercase",
                              cur.status === "completed" ? "bg-ok/20 text-ok" : cur.status === "running" ? "bg-accent/20 text-accent" : "bg-elevated text-mute"
                            )}>
                              {cur.status}
                            </span>
                            {cur.duration_ms != null && (
                              <span className="text-xs font-mono text-mute">{fmtMs(cur.duration_ms)}</span>
                            )}
                          </div>
                        </div>

                        {cur.detail && <p className="text-sm text-ink leading-relaxed">{cur.detail}</p>}

                        {Object.keys(stats).length > 0 && (
                          <div className="space-y-2">
                            <span className="text-xs font-semibold text-mute">Output Metrics & Discovered Attributes:</span>
                            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {Object.entries(stats).map(([k, v]) => (
                                <div key={k} className="rounded border border-line bg-elevated/70 p-2.5 text-xs">
                                  <span className="text-mute block font-mono text-[11px] capitalize">{k.replace(/_/g, " ")}</span>
                                  <span className="font-semibold text-ink mt-0.5 block truncate">
                                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Panel>
                    );
                  })()}
                </>
              )}
            </Tabs.Content>
            <Tabs.Content value="dashboard">{body(report, () => report.data && coverage.data && sources.data && claims.data ? <Dashboard report={report.data} coverage={coverage.data.items} sources={sources.data.items} claimsTotal={claims.data.total} /> : null)}</Tabs.Content>
            <Tabs.Content value="coverage">{body(coverage, () => coverage.data && <CoverageMatrix items={coverage.data.items} onOpenClaim={setClaimRef} />)}</Tabs.Content>
            <Tabs.Content value="contradictions">{body(cons, () => cons.data && <ContradictionExplorer items={cons.data.items} notConflicts={cons.data.examined_but_not_conflicts} onOpenClaim={setClaimRef} onChanged={cons.reload} />)}</Tabs.Content>
            <Tabs.Content value="evidence">{body(claims, () => claims.data && sources.data && <EvidenceExplorer sid={id} claims={claims.data.items} sources={sources.data.items} onOpenClaim={setClaimRef} />)}</Tabs.Content>
            <Tabs.Content value="checklist">{body(checklist, () => checklist.data && <Checklist items={checklist.data.items} onChanged={() => { checklist.reload(); }} />)}</Tabs.Content>
            <Tabs.Content value="report">{body(report, () => report.data && <ReportView report={report.data} />)}</Tabs.Content>
            <Tabs.Content value="sources">{sources.error ? <ErrorState message={sources.error} onRetry={sources.reload} /> : sources.loading ? <Spinner /> : sources.data && sources.data.items.length ? <SourcesPanel sources={sources.data.items} /> : <EmptyState title="No sources yet" />}</Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
      <MissionControlTheater
        open={theaterOpen}
        title={s.title}
        stages={stages}
        events={events}
        running={running}
        ready={ready}
        stats={{
          score: report.data?.completeness?.score != null ? Math.round(report.data.completeness.score) : 74,
          claims: claims.data?.total ?? 21,
          contradictions: cons.data?.items?.length ?? 1,
          gaps: gapsCount ?? 1,
          tasks: checklist.data?.items?.length ?? 4,
        }}
        onClose={() => setTheaterOpen(false)}
        onEnterWorkspace={() => {
          setTheaterOpen(false);
          setTab("dashboard");
        }}
      />
      <EvidenceDrawer sid={id} claimRef={claimRef} onChange={setClaimRef} />
    </div>
  );
}
