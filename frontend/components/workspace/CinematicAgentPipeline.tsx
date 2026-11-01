"use client";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, FileText, Database, Compass, FileCheck, Calendar,
  GitCompare, Search, ShieldCheck, ListChecks, Sparkles,
  Play, RotateCcw, Activity, ArrowRight, Zap, CheckCircle2,
  AlertTriangle, Clock, Layers, Eye
} from "lucide-react";
import { cn, fmtMs } from "@/lib/utils";
import type { StageInfo, StageStatus, PipelineEvent } from "@/lib/types";

interface AgentDef {
  id: string;
  codename: string;
  role: string;
  division: "Ingestion" | "Mining" | "Analysis" | "Synthesis";
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  glowColor: string;
  description: string;
  targetTab?: string;
}

const AGENTS: AgentDef[] = [
  {
    id: "source_collection",
    codename: "SCOUT-01",
    role: "Collector Agent",
    division: "Ingestion",
    icon: Globe,
    color: "#38BDF8", // Cyan
    glowColor: "rgba(56, 189, 248, 0.4)",
    description: "Navigates web URLs, validates SSRF boundaries, inspects robots.txt, and streams raw payloads.",
    targetTab: "sources",
  },
  {
    id: "content_extraction",
    codename: "PARSER-02",
    role: "Document Ingestion",
    division: "Ingestion",
    icon: FileText,
    color: "#60A5FA", // Blue
    glowColor: "rgba(96, 165, 250, 0.4)",
    description: "Cleans HTML/PDF artifacts, segments passages into bounded chunks, and checks for prompt injections.",
    targetTab: "sources",
  },
  {
    id: "evidence_indexing",
    codename: "NEXUS-03",
    role: "Neural Indexer",
    division: "Ingestion",
    icon: Database,
    color: "#818CF8", // Indigo
    glowColor: "rgba(129, 140, 248, 0.4)",
    description: "Computes lexical hash & embeddings, generates BM25 inverted indices, and prepares reciprocal rank fusion.",
    targetTab: "evidence",
  },
  {
    id: "research_planning",
    codename: "ARCHITECT-04",
    role: "Research Planner",
    division: "Mining",
    icon: Compass,
    color: "#A78BFA", // Violet
    glowColor: "rgba(167, 139, 250, 0.4)",
    description: "Evaluates research objective, formulates expected information categories, and anchors inquiry scope.",
    targetTab: "coverage",
  },
  {
    id: "claim_extraction",
    codename: "MINER-05",
    role: "Claim Extractor",
    division: "Mining",
    icon: FileCheck,
    color: "#C084FC", // Purple
    glowColor: "rgba(192, 132, 252, 0.4)",
    description: "Extracts atomic Subject-Predicate-Object claims and strictly verifies verbatim quotes against passages.",
    targetTab: "evidence",
  },
  {
    id: "freshness_analysis",
    codename: "CHRONOS-06",
    role: "Temporal Auditor",
    division: "Analysis",
    icon: Calendar,
    color: "#F472B6", // Pink
    glowColor: "rgba(244, 114, 182, 0.4)",
    description: "Calculates temporal drift against target cycle (2026-27), flags expired terms, and isolates historical documents.",
    targetTab: "report",
  },
  {
    id: "contradiction_analysis",
    codename: "ARBITER-07",
    role: "Contradiction Detective",
    division: "Analysis",
    icon: GitCompare,
    color: "#FB7185", // Rose
    glowColor: "rgba(251, 113, 133, 0.4)",
    description: "Cross-examines claim pairs for numerical, financial, and date conflicts while disambiguating scope & cycles.",
    targetTab: "contradictions",
  },
  {
    id: "gap_detection",
    codename: "HUNTER-08",
    role: "Dark Spot Hunter",
    division: "Analysis",
    icon: Search,
    color: "#FBBF24", // Amber
    glowColor: "rgba(251, 191, 36, 0.4)",
    description: "Constructs the coverage matrix, computes heuristic gap priorities, and illuminates missing knowledge.",
    targetTab: "coverage",
  },
  {
    id: "evidence_verification",
    codename: "SENTINEL-09",
    role: "Epistemic Guardian",
    division: "Synthesis",
    icon: ShieldCheck,
    color: "#34D399", // Emerald
    glowColor: "rgba(52, 211, 153, 0.4)",
    description: "Verifies reference chains, audits epistemic status (supported vs inferred), and checks integrity of claims.",
    targetTab: "evidence",
  },
  {
    id: "checklist_generation",
    codename: "STRATEGIST-10",
    role: "Action Synthesizer",
    division: "Synthesis",
    icon: ListChecks,
    color: "#2DD4BF", // Teal
    glowColor: "rgba(45, 212, 191, 0.4)",
    description: "Transforms gaps and disputed facts into actionable, user-completable verification checklist items.",
    targetTab: "checklist",
  },
  {
    id: "report_generation",
    codename: "ORACLE-11",
    role: "Executive Synthesizer",
    division: "Synthesis",
    icon: Sparkles,
    color: "#8B9CF6", // Accent
    glowColor: "rgba(139, 156, 246, 0.5)",
    description: "Calculates completeness score, aggregates limitations and provenance graph, and publishes audit report.",
    targetTab: "report",
  },
];

interface Props {
  stages: StageInfo[];
  running: boolean;
  ready: boolean;
  events?: PipelineEvent[];
  onSelectStage: (s: StageInfo) => void;
  onSelectTab: (tab: string) => void;
}

export function CinematicAgentPipeline({
  stages,
  running,
  ready,
  events = [],
  onSelectStage,
  onSelectTab,
}: Props) {
  const [activeAgentId, setActiveAgentId] = useState<string>("claim_extraction");
  const [replayWave, setReplayWave] = useState(0);

  // Auto-track the running agent
  useEffect(() => {
    const runningStage = stages.find((s) => s.status === "running");
    if (runningStage) {
      setActiveAgentId(runningStage.stage);
    } else if (ready && !stages.some((s) => s.status === "running")) {
      const lastCompleted = [...stages].reverse().find((s) => s.status === "completed");
      if (lastCompleted) setActiveAgentId(lastCompleted.stage);
    }
  }, [stages, ready]);

  const activeAgent = AGENTS.find((a) => a.id === activeAgentId) || AGENTS[4];
  const activeStageInfo = stages.find((s) => s.stage === activeAgent.id);
  const currentRunningIdx = stages.findIndex((s) => s.status === "running");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-[#080B10] p-6 shadow-2xl">
      {/* Background Cybernetic Grid & Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(139,156,246,0.15),rgba(255,255,255,0))]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage: `linear-gradient(#242B35 1px, transparent 1px), linear-gradient(90deg, #242B35 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* Cinematic HUD Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-line/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-accent shadow-lg shadow-accent/20">
            <Zap className="h-5 w-5" />
            {running && (
              <span className="absolute -inset-1 rounded-xl border border-accent animate-ping opacity-60" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink tracking-tight flex items-center gap-2">
                Autonomous Neural Agent Mesh
              </h2>
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-accent uppercase">
                11 Cooperative Agents
              </span>
            </div>
            <p className="text-xs text-mute mt-0.5">
              Live LangGraph evidence pipeline: streaming factual claims, temporal anchors, and gap intelligence.
            </p>
          </div>
        </div>

        {/* Live Status Indicators & Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-line/80 bg-surface/90 px-3 py-1.5 font-mono text-xs shadow-inner">
            <span className={cn(
              "h-2 w-2 rounded-full",
              running ? "bg-accent animate-ping" : ready ? "bg-ok" : "bg-mute"
            )} />
            <span className="text-mute font-medium">State:</span>
            <span className={cn(
              "font-bold uppercase",
              running ? "text-accent" : ready ? "text-ok" : "text-mute"
            )}>
              {running ? "Streaming Dataflow" : ready ? "Mesh Synchronized" : "Standby"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setReplayWave((v) => v + 1)}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-elevated/80 px-3 py-1.5 text-xs font-semibold text-mute hover:border-accent/40 hover:text-ink transition-colors shadow-sm"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Pulse Wave
          </button>
        </div>
      </div>

      {/* Cinematic Agent Conduit Pipeline Canvas */}
      <div className="relative z-10 py-6">
        {/* Animated Laser Conduit Beam Lines Behind Cards */}
        <div className="relative mx-auto max-w-5xl">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {AGENTS.map((agent, index) => {
              const stageInfo = stages.find((s) => s.stage === agent.id);
              const status: StageStatus = stageInfo?.status ?? "pending";
              const isRunning = status === "running";
              const isCompleted = status === "completed";
              const isFailed = status === "failed";
              const isSelected = activeAgentId === agent.id;
              const IconComp = agent.icon;

              return (
                <motion.div
                  key={agent.id}
                  layout
                  onClick={() => {
                    setActiveAgentId(agent.id);
                    if (stageInfo) onSelectStage(stageInfo);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "group relative cursor-pointer rounded-xl border p-3.5 text-left transition-all backdrop-blur-md",
                    isSelected
                      ? "ring-2 ring-accent border-accent/80 bg-surface shadow-xl"
                      : "border-line/80 bg-surface/60 hover:border-line hover:bg-surface",
                    isRunning
                      ? "ring-2 ring-accent border-accent bg-accent/10 shadow-[0_0_20px_rgba(139,156,246,0.35)]"
                      : isCompleted
                      ? "border-ok/30 hover:border-ok/60"
                      : ""
                  )}
                  style={{
                    boxShadow: isRunning ? `0 0 25px ${agent.glowColor}` : undefined,
                  }}
                >
                  {/* Glowing Top Pill / Agent Code */}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded border"
                      style={{
                        borderColor: `${agent.color}40`,
                        backgroundColor: `${agent.color}15`,
                        color: agent.color,
                      }}
                    >
                      {agent.codename}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {stageInfo?.duration_ms != null && (
                        <span className="text-[10px] font-mono text-mute">{fmtMs(stageInfo.duration_ms)}</span>
                      )}
                      {isRunning ? (
                        <span className="flex h-3.5 w-3.5 items-center justify-center">
                          <span className="h-2 w-2 rounded-full animate-ping" style={{ backgroundColor: agent.color }} />
                        </span>
                      ) : isCompleted ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                      ) : isFailed ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-bad" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-mute/40" />
                      )}
                    </div>
                  </div>

                  {/* Agent Identity */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-105"
                      style={{
                        borderColor: `${agent.color}50`,
                        backgroundColor: `${agent.color}20`,
                        color: agent.color,
                      }}
                    >
                      <IconComp className="h-4 w-4" />
                      {isRunning && (
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                          className="absolute -inset-1 rounded-lg border border-dashed"
                          style={{ borderColor: agent.color }}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ink truncate leading-tight">
                        {agent.role}
                      </div>
                      <div className="text-[11px] text-mute truncate capitalize">
                        {agent.division} Division
                      </div>
                    </div>
                  </div>

                  {/* Live Telemetry Bar */}
                  <div className="mt-3 pt-2 border-t border-line/40">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={cn(
                        "font-mono font-medium",
                        isRunning ? "text-accent animate-pulse font-bold" : isCompleted ? "text-ok" : "text-mute"
                      )}>
                        {isRunning ? "PROCESSING..." : isCompleted ? "COMPLETED" : "WAITING"}
                      </span>
                      <span className="text-[10px] text-mute group-hover:text-accent transition-colors flex items-center gap-0.5">
                        Inspect <ArrowRight className="h-2.5 w-2.5" />
                      </span>
                    </div>

                    {/* Progress Wave Indicator on the active card */}
                    {isRunning && (
                      <div className="mt-1.5 h-1 w-full rounded-full bg-elevated overflow-hidden">
                        <motion.div
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                          className="h-full w-1/2 rounded-full"
                          style={{ backgroundColor: agent.color }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Connected Data Stream Bead when complete */}
                  {isCompleted && (
                    <motion.div
                      key={`pulse-${replayWave}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: [0.8, 1.05, 1], opacity: 1 }}
                      transition={{ duration: 0.4 }}
                      className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ok text-bg text-[9px] font-bold shadow"
                    >
                      ✓
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Holographic Agent Inspector Panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeAgent.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 mt-4 rounded-xl border border-line bg-surface/90 p-5 backdrop-blur-md shadow-xl"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line/50 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl border shadow"
                style={{
                  borderColor: `${activeAgent.color}60`,
                  backgroundColor: `${activeAgent.color}25`,
                  color: activeAgent.color,
                }}
              >
                {React.createElement(activeAgent.icon, { className: "h-5 w-5" })}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-ink">{activeAgent.role}</h3>
                  <span
                    className="font-mono text-xs font-bold px-2 py-0.5 rounded border"
                    style={{
                      borderColor: `${activeAgent.color}50`,
                      backgroundColor: `${activeAgent.color}15`,
                      color: activeAgent.color,
                    }}
                  >
                    {activeAgent.codename}
                  </span>
                </div>
                <p className="text-xs text-mute mt-0.5">{activeAgent.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeAgent.targetTab && (
                <button
                  type="button"
                  onClick={() => onSelectTab(activeAgent.targetTab!)}
                  className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Agent Findings ({activeAgent.targetTab})
                </button>
              )}
            </div>
          </div>

          {/* Agent Mission Readout / Stats Grid */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-lg border border-line bg-elevated/70 p-3">
              <span className="text-[11px] font-mono text-mute block uppercase">Execution State</span>
              <span className="mt-1 text-sm font-bold text-ink flex items-center gap-1.5">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  activeStageInfo?.status === "completed" ? "bg-ok" : activeStageInfo?.status === "running" ? "bg-accent animate-ping" : "bg-mute"
                )} />
                {activeStageInfo?.status ? activeStageInfo.status.toUpperCase() : "PENDING"}
              </span>
            </div>

            <div className="rounded-lg border border-line bg-elevated/70 p-3">
              <span className="text-[11px] font-mono text-mute block uppercase">Execution Latency</span>
              <span className="mt-1 text-sm font-mono font-bold text-ink">
                {activeStageInfo?.duration_ms != null ? fmtMs(activeStageInfo.duration_ms) : "—"}
              </span>
            </div>

            <div className="rounded-lg border border-line bg-elevated/70 p-3 sm:col-span-2">
              <span className="text-[11px] font-mono text-mute block uppercase">Agent Telemetry & Output</span>
              <span className="mt-1 text-xs text-mute font-mono block truncate">
                {activeStageInfo?.detail || "Evidence payload processed cleanly according to contract."}
              </span>
            </div>
          </div>

          {/* Detailed Discovered Attributes */}
          {activeStageInfo?.stats && Object.keys(activeStageInfo.stats).length > 0 && (
            <div className="mt-3.5 rounded-lg border border-line/60 bg-bg/80 p-3">
              <span className="text-[11px] font-mono text-mute block uppercase mb-1.5 font-bold">
                Internal Discovered Signatures:
              </span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(activeStageInfo.stats).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded bg-elevated px-2 py-1 font-mono text-xs text-ink border border-line"
                  >
                    <span className="text-mute">{k}:</span>
                    <strong className="text-accent">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
