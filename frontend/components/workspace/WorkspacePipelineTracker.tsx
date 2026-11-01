"use client";
import React from "react";
import {
  Check, Loader2, AlertTriangle, Circle, ArrowRight, ShieldCheck,
  Search, GitCompare, ListChecks, Sparkles, FileCheck, Layers
} from "lucide-react";
import { cn, fmtMs } from "@/lib/utils";
import type { StageInfo, StageStatus } from "@/lib/types";

const STAGE_SHORT_NAMES: Record<string, string> = {
  source_collection: "Sources",
  content_extraction: "Extraction",
  evidence_indexing: "Indexing",
  research_planning: "Planning",
  claim_extraction: "Claims",
  freshness_analysis: "Freshness",
  contradiction_analysis: "Conflicts",
  gap_detection: "Gaps",
  evidence_verification: "Verification",
  checklist_generation: "Checklist",
  report_generation: "Report",
};

interface WorkspacePipelineTrackerProps {
  stages: StageInfo[];
  running: boolean;
  ready: boolean;
  onSelectStage: (stage: StageInfo) => void;
  onSelectTab: (tab: string) => void;
  reportData?: any;
  claimsCount?: number;
  conflictsCount?: number;
  gapsCount?: number;
  tasksCount?: number;
}

export function WorkspacePipelineTracker({
  stages,
  running,
  ready,
  onSelectStage,
  onSelectTab,
  reportData,
  claimsCount,
  conflictsCount,
  gapsCount,
  tasksCount,
}: WorkspacePipelineTrackerProps) {
  const totalStages = stages.length || 11;
  const completedCount = stages.filter((s) => s.status === "completed").length;
  const runningStage = stages.find((s) => s.status === "running");
  const runningStageIdx = stages.findIndex((s) => s.status === "running");
  const progressPercent = ready
    ? 100
    : Math.max(5, Math.round((completedCount / totalStages) * 100));

  const score = reportData?.completeness?.score != null ? Math.round(reportData.completeness.score) : null;

  return (
    <div className="rounded-xl border border-line bg-surface/80 p-4 shadow-sm backdrop-blur-sm transition-all space-y-4">
      {/* Top Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border",
            running
              ? "border-accent bg-accent/20 text-accent animate-pulse"
              : ready
              ? "border-ok/40 bg-ok/15 text-ok"
              : "border-line bg-elevated text-mute"
          )}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : ready ? (
              <Check className="h-4 w-4 text-ok" />
            ) : (
              <Layers className="h-4 w-4 text-mute" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">
                {running
                  ? `Processing Stage ${runningStageIdx + 1} of ${totalStages}`
                  : ready
                  ? "Pipeline Execution Complete"
                  : "Pipeline Ready"}
              </span>
              <span className={cn(
                "rounded px-2 py-0.5 text-[11px] font-mono font-medium uppercase",
                running ? "bg-accent/20 text-accent ring-1 ring-accent/30" : ready ? "bg-ok/15 text-ok" : "bg-elevated text-mute"
              )}>
                {running ? "Live Execution" : ready ? "All 11 Nodes Completed" : "Awaiting Run"}
              </span>
            </div>
            <p className="text-xs text-mute mt-0.5">
              {running
                ? runningStage?.detail || `Executing ${runningStage?.label || "analysis"} in LangGraph...`
                : ready
                ? "Every finding is verified and cross-referenced with passage-level evidence."
                : "Click 'Start analysis' to trigger all 11 stages across the evidence graph."}
            </p>
          </div>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:w-36 h-2 rounded-full bg-elevated overflow-hidden border border-line/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                running
                  ? "bg-gradient-to-r from-accent to-ok animate-pulse"
                  : ready
                  ? "bg-ok"
                  : "bg-mute/40"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="font-mono text-xs font-semibold text-ink shrink-0">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Horizontal Stepper Beads */}
      <div className="relative overflow-x-auto pb-1 pt-1 -mx-1 px-1">
        <div className="flex items-center justify-between min-w-[620px] gap-1">
          {stages.map((s, idx) => {
            const isCompleted = s.status === "completed";
            const isRunning = s.status === "running";
            const isFailed = s.status === "failed";
            const shortName = STAGE_SHORT_NAMES[s.stage] || s.label;

            return (
              <button
                key={s.stage}
                type="button"
                onClick={() => {
                  onSelectStage(s);
                  onSelectTab("pipeline");
                }}
                className={cn(
                  "group relative flex flex-1 flex-col items-center rounded-lg py-2 px-1 text-center transition-all",
                  isRunning
                    ? "bg-accent/15 ring-1 ring-accent"
                    : isCompleted
                    ? "hover:bg-elevated/80"
                    : "opacity-60 hover:opacity-100"
                )}
                title={`${s.label}: ${s.status}${s.duration_ms != null ? ` (${fmtMs(s.duration_ms)})` : ""}`}
              >
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold font-mono transition-transform group-hover:scale-110",
                  isRunning
                    ? "border-accent bg-accent text-bg animate-spin"
                    : isCompleted
                    ? "border-ok/40 bg-ok/20 text-ok"
                    : isFailed
                    ? "border-bad bg-bad/20 text-bad"
                    : "border-line bg-surface text-mute"
                )}>
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5" />
                  ) : isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isFailed ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span className={cn(
                  "mt-1 text-[11px] font-medium truncate max-w-full leading-tight",
                  isRunning ? "text-accent font-semibold" : isCompleted ? "text-ink" : "text-mute"
                )}>
                  {shortName}
                </span>
                {s.duration_ms != null && (
                  <span className="text-[10px] text-mute/80 font-mono mt-0.5">
                    {fmtMs(s.duration_ms)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* When Finished: Quick Action Findings Pills */}
      {ready && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line/50">
          <span className="text-xs font-medium text-mute mr-1">Quick Jump:</span>
          {score != null && (
            <button
              type="button"
              onClick={() => onSelectTab("dashboard")}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Completeness Score: {score}/100
            </button>
          )}
          {gapsCount != null && gapsCount > 0 && (
            <button
              type="button"
              onClick={() => onSelectTab("coverage")}
              className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-xs font-semibold text-warn hover:bg-warn/20 transition-colors"
            >
              <Search className="h-3 w-3" />
              {gapsCount} Potential Gap{gapsCount > 1 ? "s" : ""}
            </button>
          )}
          {conflictsCount != null && conflictsCount > 0 && (
            <button
              type="button"
              onClick={() => onSelectTab("contradictions")}
              className="inline-flex items-center gap-1.5 rounded-full border border-bad/40 bg-bad/10 px-3 py-1 text-xs font-semibold text-bad hover:bg-bad/20 transition-colors"
            >
              <GitCompare className="h-3 w-3" />
              {conflictsCount} Contradiction{conflictsCount > 1 ? "s" : ""}
            </button>
          )}
          {claimsCount != null && (
            <button
              type="button"
              onClick={() => onSelectTab("evidence")}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1 text-xs font-medium text-ink hover:border-accent/40 transition-colors"
            >
              <FileCheck className="h-3 w-3 text-ok" />
              {claimsCount} Claims Verified
            </button>
          )}
          {tasksCount != null && (
            <button
              type="button"
              onClick={() => onSelectTab("checklist")}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1 text-xs font-medium text-ink hover:border-accent/40 transition-colors"
            >
              <ListChecks className="h-3 w-3 text-accent" />
              {tasksCount} Tasks
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelectTab("report")}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-mute hover:text-ink transition-colors"
          >
            Full Report <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
