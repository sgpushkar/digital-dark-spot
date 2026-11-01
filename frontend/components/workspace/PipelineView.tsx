"use client";
import React, { useMemo, useState } from "react";
import ReactFlow, { Background, Handle, Position, type Edge, type Node, type NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import {
  AlertTriangle, Check, Circle, Loader2, SkipForward, Globe, FileText, Database,
  Compass, FileCheck, Calendar, GitCompare, Search, ShieldCheck, ListChecks,
  Sparkles, Terminal, Activity, Layers, ArrowRight, Clock, Zap
} from "lucide-react";
import { cn, fmtMs } from "@/lib/utils";
import type { PipelineEvent, StageInfo, StageStatus } from "@/lib/types";
import { CinematicAgentPipeline } from "./CinematicAgentPipeline";

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  source_collection: Globe,
  content_extraction: FileText,
  evidence_indexing: Database,
  research_planning: Compass,
  claim_extraction: FileCheck,
  freshness_analysis: Calendar,
  contradiction_analysis: GitCompare,
  gap_detection: Search,
  evidence_verification: ShieldCheck,
  checklist_generation: ListChecks,
  report_generation: Sparkles,
};

const TONE: Record<StageStatus, string> = {
  pending: "border-line text-mute bg-surface/50",
  running: "border-accent text-ink bg-accent/10 shadow-lg shadow-accent/20 animate-pulse ring-1 ring-accent",
  completed: "border-ok/50 text-ink bg-surface hover:border-ok/80",
  failed: "border-bad text-ink bg-bad/10",
  skipped: "border-line text-mute border-dashed bg-surface/30",
};

const STATUS_ICONS: Record<StageStatus, React.ReactNode> = {
  pending: <Circle className="h-3.5 w-3.5 text-mute" aria-hidden />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />,
  completed: <Check className="h-3.5 w-3.5 text-ok" aria-hidden />,
  failed: <AlertTriangle className="h-3.5 w-3.5 text-bad" aria-hidden />,
  skipped: <SkipForward className="h-3.5 w-3.5 text-mute" aria-hidden />,
};

const STATUS_TEXT: Record<StageStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

function getStageSummary(s: StageInfo): string | null {
  const stats = s.stats ?? {};
  switch (s.stage) {
    case "source_collection":
      return stats.fetched != null || stats.pending_urls != null
        ? `${stats.usable_sources ?? stats.fetched ?? stats.pending_urls} sources collected`
        : null;
    case "content_extraction":
      return stats.chunks != null ? `${stats.chunks} text chunks parsed` : null;
    case "evidence_indexing":
      return stats.chunks_indexed != null ? `${stats.chunks_indexed} indexed (${stats.embedder || "hash"})` : null;
    case "research_planning":
      return stats.categories != null ? `${stats.categories} categories defined` : null;
    case "claim_extraction":
      return stats.claims != null ? `${stats.claims} atomic claims extracted` : null;
    case "freshness_analysis":
      return stats.target_period ? `Target cycle: ${stats.target_period}` : null;
    case "contradiction_analysis":
      return stats.conflicts != null ? `${stats.conflicts} contradiction(s) found` : null;
    case "gap_detection":
      return stats.statuses?.NOT_FOUND != null ? `${stats.statuses.NOT_FOUND} critical gap(s)` : null;
    case "evidence_verification":
      return stats.findings != null ? `${stats.findings} findings verified` : null;
    case "checklist_generation":
      return stats.tasks != null ? `${stats.tasks} checklist tasks created` : null;
    case "report_generation":
      return stats.score != null ? `Score: ${stats.score}%` : null;
    default:
      return null;
  }
}

function StageNode({ data }: NodeProps<StageInfo & { onSelect: (s: StageInfo) => void; isSelected?: boolean }>) {
  const IconComp = STAGE_ICONS[data.stage] || Activity;
  const summary = getStageSummary(data);
  return (
    <button
      onClick={() => data.onSelect(data)}
      className={cn(
        "w-60 rounded-lg border p-3 text-left transition-all",
        TONE[data.status],
        data.isSelected ? "ring-2 ring-accent border-accent" : ""
      )}
      aria-label={`${data.label}: ${STATUS_TEXT[data.status]}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-line !w-2 !h-2" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconComp className="h-4 w-4 text-mute shrink-0" />
          <span className="text-sm font-semibold truncate text-ink">{data.label}</span>
        </div>
        {STATUS_ICONS[data.status]}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-mute">
        <span>{STATUS_TEXT[data.status]}</span>
        {data.duration_ms != null && <span>{fmtMs(data.duration_ms)}</span>}
      </div>
      {summary && (
        <div className="mt-1.5 truncate rounded bg-bg/60 px-1.5 py-0.5 text-[11px] font-mono text-accent/90">
          {summary}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-line !w-2 !h-2" />
    </button>
  );
}
const nodeTypes = { stage: StageNode };

/** Merge persisted stage state with live events: the most recent real event for a stage wins. */
export function mergeStages(base: StageInfo[], events: PipelineEvent[]): StageInfo[] {
  const latest = new Map<string, PipelineEvent>();
  for (const e of events) if (e.type === "stage" && e.stage) latest.set(e.stage, e);
  return base.map((s) => {
    const e = latest.get(s.stage);
    return e
      ? {
        ...s,
        status: e.status as StageStatus,
        detail: e.detail ?? s.detail,
        duration_ms: e.duration_ms ?? s.duration_ms,
        stats: (e.stats as Record<string, any>) ?? s.stats,
      }
      : s;
  });
}

export function PipelineView({
  stages,
  onSelect,
  selectedStage,
  events = [],
  onSelectTab,
}: {
  stages: StageInfo[];
  onSelect: (s: StageInfo) => void;
  selectedStage?: StageInfo | null;
  events?: PipelineEvent[];
  onSelectTab?: (tab: string) => void;
}) {
  const [viewMode, setViewMode] = useState<"agents" | "cards" | "flow">("agents");

  const running = stages.some((s) => s.status === "running");
  const ready = stages.every((s) => s.status === "completed" || s.status === "skipped");

  const { nodes, edges } = useMemo(() => {
    const cols = 4;
    const nodes: Node[] = stages.map((s, i) => ({
      id: s.stage,
      type: "stage",
      position: { x: (i % cols) * 280, y: Math.floor(i / cols) * 125 },
      data: { ...s, onSelect, isSelected: selectedStage?.stage === s.stage },
      draggable: false,
    }));
    const edges: Edge[] = stages.slice(1).map((s, i) => ({
      id: `${stages[i].stage}-${s.stage}`,
      source: stages[i].stage,
      target: s.stage,
      animated: s.status === "running" || stages[i].status === "running",
      style: {
        stroke: s.status === "completed" ? "#35B779" : s.status === "running" ? "#8B9CF6" : "#242B35",
        strokeWidth: s.status === "running" ? 2 : 1.5,
      },
    }));
    return { nodes, edges };
  }, [stages, onSelect, selectedStage]);

  return (
    <div className="space-y-4" role="group" aria-label="Analysis pipeline view">
      {/* View mode toggle header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-ink">Multi-Agent Evidence Orchestration</span>
          <span className="text-xs text-mute">
            ({stages.filter((s) => s.status === "completed").length} of {stages.length} nodes verified)
          </span>
        </div>
        <div className="flex rounded-md border border-line bg-surface p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("agents")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded transition-colors",
              viewMode === "agents" ? "bg-accent/20 text-accent font-semibold shadow-sm" : "text-mute hover:text-ink"
            )}
          >
            <Zap className="h-3 w-3" />
            Neural Agent Mesh
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={cn(
              "px-3 py-1 rounded transition-colors",
              viewMode === "cards" ? "bg-elevated text-ink font-medium shadow-sm" : "text-mute hover:text-ink"
            )}
          >
            Grid Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode("flow")}
            className={cn(
              "px-3 py-1 rounded transition-colors",
              viewMode === "flow" ? "bg-elevated text-ink font-medium shadow-sm" : "text-mute hover:text-ink"
            )}
          >
            Architecture Flow
          </button>
        </div>
      </div>

      {viewMode === "agents" ? (
        <CinematicAgentPipeline
          stages={stages}
          running={running}
          ready={ready}
          events={events}
          onSelectStage={onSelect}
          onSelectTab={onSelectTab || (() => {})}
        />
      ) : viewMode === "flow" ? (
        <div className="h-[430px] rounded-lg border border-line bg-surface shadow-inner" role="region" aria-label="Pipeline graph">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView nodesConnectable={false} proOptions={{ hideAttribution: true }} minZoom={0.35}>
            <Background color="#242B35" gap={24} />
          </ReactFlow>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stages.map((s, idx) => {
            const IconComp = STAGE_ICONS[s.stage] || Activity;
            const summary = getStageSummary(s);
            const isSelected = selectedStage?.stage === s.stage;
            const isRunning = s.status === "running";

            return (
              <button
                key={s.stage}
                type="button"
                onClick={() => onSelect(s)}
                className={cn(
                  "relative flex flex-col justify-between rounded-lg border p-3.5 text-left transition-all group",
                  TONE[s.status],
                  isSelected ? "ring-2 ring-accent border-accent" : "hover:border-line/90"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-mute">#{String(idx + 1).padStart(2, "0")}</span>
                    <div className="flex items-center gap-1.5">
                      {s.duration_ms != null && (
                        <span className="text-[11px] font-mono text-mute">{fmtMs(s.duration_ms)}</span>
                      )}
                      {STATUS_ICONS[s.status]}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md border text-mute",
                      isRunning ? "border-accent bg-accent/20 text-accent animate-spin" : "border-line bg-surface"
                    )}>
                      <IconComp className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-semibold text-ink leading-tight">{s.label}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-line/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn(
                      "font-medium",
                      s.status === "completed" ? "text-ok" : isRunning ? "text-accent" : "text-mute"
                    )}>
                      {STATUS_TEXT[s.status]}
                    </span>
                    <span className="text-[11px] text-mute group-hover:text-ink transition-colors flex items-center gap-0.5">
                      Inspect <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                  {summary && (
                    <div className="mt-1.5 rounded bg-elevated/80 px-2 py-1 text-xs font-mono text-accent/90 truncate">
                      {summary}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Live Pipeline Streaming Terminal */}
      <div className="rounded-lg border border-line bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-elevated/60 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 font-mono text-mute">
            <Terminal className="h-3.5 w-3.5 text-accent" />
            <span className="font-semibold text-ink">Live Activity Feed</span>
            {events.length > 0 && <span className="text-mute">({events.length} events logged)</span>}
          </div>
          <span className="flex items-center gap-1.5 text-ok text-[11px] font-mono">
            <span className="h-2 w-2 rounded-full bg-ok animate-pulse" /> Live WebSocket
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto p-3 font-mono text-xs space-y-1.5 bg-bg/90">
          {events.length === 0 ? (
            <p className="text-mute italic py-2">
              Waiting for pipeline execution... Activity logs will stream here as each processing node executes.
            </p>
          ) : (
            events.slice().reverse().map((e, idx) => (
              <div key={idx} className="flex items-start gap-2 text-mute hover:text-ink transition-colors">
                <span className="text-[11px] text-mute/60 shrink-0">
                  {e.ts ? new Date(e.ts).toLocaleTimeString() : "—"}
                </span>
                <span className={cn(
                  "rounded px-1 text-[10px] uppercase font-bold shrink-0",
                  e.status === "completed" ? "bg-ok/20 text-ok" : e.status === "running" ? "bg-accent/20 text-accent" : "bg-elevated text-mute"
                )}>
                  {e.status}
                </span>
                <span className="text-ink font-semibold shrink-0">
                  {e.label ?? e.stage ?? e.type}:
                </span>
                <span className="truncate text-mute">
                  {e.detail || (e.stats ? JSON.stringify(e.stats) : "Stage status update")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}