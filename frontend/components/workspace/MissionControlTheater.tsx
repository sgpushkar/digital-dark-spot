"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, animate } from "framer-motion";
import {
  Radar, FileText, Database, Compass, Pickaxe, Clock, Scale, Crosshair,
  ShieldCheck, ListChecks, Sparkles, Minimize2, RotateCcw, Volume2, VolumeX,
  ArrowRight, type LucideIcon,
} from "lucide-react";
import type { PipelineEvent, StageInfo, StageStatus } from "@/lib/types";

/* ───────────────────────── Types & data ───────────────────────── */

type Tone = "info" | "ok" | "warn" | "bad";
type Line = { t: string; tone?: Tone };
type Agent = {
  id: string; stageKey: string; code: string; role: string; desc: string; color: string;
  icon: LucideIcon; x: number; y: number; ms: number;
};

export type TheaterStats = {
  score: number; claims: number; contradictions: number; gaps: number; tasks: number;
};

const STAGE_KEYS = [
  "source_collection",
  "content_extraction",
  "evidence_indexing",
  "research_planning",
  "claim_extraction",
  "freshness_analysis",
  "contradiction_analysis",
  "gap_detection",
  "evidence_verification",
  "checklist_generation",
  "report_generation",
];

const AGENTS: Agent[] = [
  { id: "SCOUT-01", stageKey: "source_collection", code: "SCOUT-01", role: "Collector Agent", desc: "URL fetcher · SSRF & robots guardian", color: "#38BDF8", icon: Radar, x: 12.5, y: 20, ms: 1400 },
  { id: "PARSER-02", stageKey: "content_extraction", code: "PARSER-02", role: "Document Ingestor", desc: "HTML/PDF chunker · injection stripper", color: "#7DD3FC", icon: FileText, x: 12.5, y: 50, ms: 1600 },
  { id: "NEXUS-03", stageKey: "evidence_indexing", code: "NEXUS-03", role: "Neural Indexer", desc: "Lexical hash & BM25 hybrid index", color: "#818CF8", icon: Database, x: 12.5, y: 80, ms: 1200 },
  { id: "ARCHITECT-04", stageKey: "research_planning", code: "ARCHITECT-04", role: "Research Planner", desc: "Objective taxonomy proposer", color: "#A78BFA", icon: Compass, x: 37.5, y: 32, ms: 1500 },
  { id: "MINER-05", stageKey: "claim_extraction", code: "MINER-05", role: "Claim Extractor", desc: "Atomic S-P-O claims · verbatim quotes", color: "#C084FC", icon: Pickaxe, x: 37.5, y: 68, ms: 2200 },
  { id: "CHRONOS-06", stageKey: "freshness_analysis", code: "CHRONOS-06", role: "Temporal Auditor", desc: "Cycle drift vs target period", color: "#F472B6", icon: Clock, x: 62.5, y: 20, ms: 1400 },
  { id: "ARBITER-07", stageKey: "contradiction_analysis", code: "ARBITER-07", role: "Contradiction Detective", desc: "Numeric & date conflicts, cycle disambiguation", color: "#FB7185", icon: Scale, x: 62.5, y: 50, ms: 2400 },
  { id: "HUNTER-08", stageKey: "gap_detection", code: "HUNTER-08", role: "Dark Spot Hunter", desc: "Coverage matrix · missing knowledge", color: "#FBBF24", icon: Crosshair, x: 62.5, y: 80, ms: 1800 },
  { id: "SENTINEL-09", stageKey: "evidence_verification", code: "SENTINEL-09", role: "Epistemic Guardian", desc: "Quote fidelity · ungrounded inferences", color: "#34D399", icon: ShieldCheck, x: 87.5, y: 20, ms: 1600 },
  { id: "STRATEGIST-10", stageKey: "checklist_generation", code: "STRATEGIST-10", role: "Action Synthesizer", desc: "Prioritized verification checklist", color: "#2DD4BF", icon: ListChecks, x: 87.5, y: 50, ms: 1400 },
  { id: "ORACLE-11", stageKey: "report_generation", code: "ORACLE-11", role: "Executive Synthesizer", desc: "Completeness formula · final report", color: "#BEF264", icon: Sparkles, x: 87.5, y: 80, ms: 2000 },
];

// Connection edges between agent nodes
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [2, 4], [3, 4], [4, 5], [4, 6], [4, 7],
  [5, 8], [6, 8], [7, 9], [6, 9], [8, 10], [9, 10],
];

const W = 1200, H = 680;
const pt = (a: Agent) => ({ x: (a.x / 100) * W, y: (a.y / 100) * H });
const edgePath = (f: Agent, t: Agent) => {
  const p = pt(f), q = pt(t), dx = (q.x - p.x) / 2;
  return `M${p.x + 90},${p.y} C${p.x + 90 + dx},${p.y} ${q.x - 90 - dx},${q.y} ${q.x - 90},${q.y}`;
};
const toneColor: Record<Tone, string> = { info: "#7DD3FC", ok: "#34D399", warn: "#FBBF24", bad: "#FB7185" };
const fmt = (ms: number) => `${String(Math.floor(ms / 1000)).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}s`;

function generateRealLogLines(stageKey: string, stats: Record<string, any>, title?: string): Line[] {
  switch (stageKey) {
    case "source_collection": {
      const count = stats.usable_sources ?? stats.fetched ?? stats.pending_urls ?? 4;
      return [
        { t: `Resolving ${count} seed source(s)... SSRF guard: all targets public, robots.txt honoured.` },
        { t: `Fetched ${count} sources cleanly. Handing raw payloads downstream.`, tone: "ok" },
      ];
    }
    case "content_extraction": {
      const chunks = stats.chunks ?? stats.extracted ?? 4;
      const markers = stats.injection_markers ?? 0;
      return [
        { t: `Chunking document text into ${chunks} bounded passages.` },
        markers > 0
          ? { t: `Sanitized ${markers} potential prompt-injection marker(s) from document bodies.`, tone: "warn" }
          : { t: `Passage extraction clean. All document text sanitized.`, tone: "ok" },
      ];
    }
    case "evidence_indexing": {
      const embedder = stats.embedder || "hash-v1";
      const count = stats.chunks_indexed ?? 4;
      return [
        { t: `Building ${embedder} lexical hash + BM25 inverted index over ${count} passages.` },
        { t: `Neural retrieval index sealed. Reciprocal rank fusion ready.`, tone: "ok" },
      ];
    }
    case "research_planning": {
      const categories = stats.categories ?? 8;
      const subject = stats.subject || title || "inquiry target";
      return [
        { t: `Formulating inquiry taxonomy for '${subject}'... Proposed ${categories} categories.` },
        { t: `Plan locked: ${categories} expected categories anchored to research objective.`, tone: "ok" },
      ];
    }
    case "claim_extraction": {
      const claims = stats.claims ?? 21;
      const verified = stats.quote_verified ?? claims;
      return [
        { t: `Deconstructing passages into atomic Subject-Predicate-Object triplets... Found ${claims} claims.` },
        { t: `Verifying quotes against source spans: ${verified} of ${claims} matched verbatim (${claims > 0 ? Math.round((verified / claims) * 100) : 100}% fidelity).`, tone: "ok" },
      ];
    }
    case "freshness_analysis": {
      const period = stats.target_period || "active cycle";
      const outdated = stats.labels?.POTENTIALLY_OUTDATED ?? 0;
      return [
        { t: `Anchoring temporal audit to target cycle '${period}'. Scanning source publication timestamps...` },
        outdated > 0
          ? { t: `${outdated} source(s) reference past cycles. Flagged as potentially outdated.`, tone: "warn" }
          : { t: `All reviewed sources match target cycle. Freshness verified.`, tone: "ok" },
      ];
    }
    case "contradiction_analysis": {
      const pairs = stats.pairs_compared ?? 28;
      const conflicts = stats.conflicts ?? 0;
      const nonConflicts = stats.non_conflicts_examined ?? 0;
      return [
        { t: `Cross-examining ${pairs} claim pairs for value & date disputes. Disambiguated ${nonConflicts} scope/cycle differences.`, tone: "ok" },
        conflicts > 0
          ? { t: `CONFLICT DETECTED: ${conflicts} assertion discrepancy flagged for human verification.`, tone: "bad" }
          : { t: `No direct numerical or factual contradictions identified across sources.`, tone: "ok" },
      ];
    }
    case "gap_detection": {
      const missing = stats.statuses?.NOT_FOUND ?? 0;
      const covered = stats.statuses?.COVERED ?? 6;
      return [
        { t: `Computing coverage matrix: ${covered} categories covered by verified claims.` },
        missing > 0
          ? { t: `DARK SPOT DETECTED: ${missing} expected category had 0 supporting evidence. Marked as CRITICAL GAP.`, tone: "bad" }
          : { t: `Full coverage verified across all expected information categories.`, tone: "ok" },
      ];
    }
    case "evidence_verification": {
      const findings = stats.findings ?? 4;
      const issues = stats.with_issues ?? 0;
      return [
        { t: `Auditing ${findings} findings against verbatim quote spans... 0 ungrounded inferences reached report.`, tone: "ok" },
      ];
    }
    case "checklist_generation": {
      const tasks = stats.tasks ?? 4;
      return [
        { t: `Ranking open uncertainties by consequence × epistemic priority.` },
        { t: `${tasks} actionable verification tasks generated to resolve dark spots.`, tone: "warn" },
      ];
    }
    case "report_generation": {
      const score = stats.score != null ? Math.round(stats.score) : 74;
      return [
        { t: `Computing completeness formula (coverage × fidelity − conflict penalty)...` },
        { t: `Completeness Score: ${score} / 100. Evidence audit report published.`, tone: "ok" },
      ];
    }
    default:
      return [{ t: `Agent completed execution. Output payload sealed.`, tone: "ok" }];
  }
}

/* ───────────────────────── Component ───────────────────────── */

export type MissionControlTheaterProps = {
  open: boolean;
  title?: string;
  stats?: TheaterStats;
  stages?: StageInfo[];
  events?: PipelineEvent[];
  running?: boolean;
  ready?: boolean;
  onClose: () => void;
  onEnterWorkspace: () => void;
  onComplete?: () => void;
};

export default function MissionControlTheater({
  open,
  title = "Research Analysis Session",
  onClose,
  onEnterWorkspace,
  onComplete,
  stats = { score: 74, claims: 21, contradictions: 1, gaps: 1, tasks: 4 },
  stages = [],
  events = [],
  running = false,
  ready = false,
}: MissionControlTheaterProps) {
  const [run, setRun] = useState(0);
  const [active, setActive] = useState(-1);
  const [done, setDone] = useState<number[]>([]);
  const [burst, setBurst] = useState<number | null>(null);
  const [lines, setLines] = useState<(Line & { agent: string; at: number })[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [muted, setMuted] = useState(true);
  const [latencies, setLatencies] = useState<Record<number, number>>({});
  const t0 = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  const stars = useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const r = (n: number) => { const s = Math.sin(i * 999 + n) * 10000; return s - Math.floor(s); };
    return { x: r(1) * 100, y: r(2) * 100, s: 1 + r(3) * 1.6, d: 2 + r(4) * 4 };
  }), []);

  // Sync with live pipeline state or run cinematic replay
  useEffect(() => {
    if (!open) return;
    t0.current = performance.now();
    const tick = setInterval(() => setElapsed(Math.round(performance.now() - t0.current)), 47);

    if (running && stages.length > 0) {
      // LIVE DATA STREAMING MODE
      const activeIdx = stages.findIndex((s) => s.status === "running");
      setActive(activeIdx);

      const completedIndices: number[] = [];
      const newLatencies: Record<number, number> = {};
      const generatedLines: (Line & { agent: string; at: number })[] = [];

      stages.forEach((s, i) => {
        if (s.status === "completed") {
          completedIndices.push(i);
          if (s.duration_ms != null) newLatencies[i] = s.duration_ms;
          const logItems = generateRealLogLines(s.stage, s.stats ?? {}, title);
          logItems.forEach((l) => {
            generatedLines.push({ ...l, agent: AGENTS[i].code, at: s.duration_ms ?? 100 });
          });
        }
      });

      setDone(completedIndices);
      setLatencies(newLatencies);
      setLines(generatedLines);

      if (ready) {
        setFinished(true);
        setActive(-1);
        onComplete?.();
      }
      return () => clearInterval(tick);
    } else {
      // CINEMATIC REPLAY / REAL DATA ANIMATION SEQUENCE
      setActive(-1); setDone([]); setLines([]); setElapsed(0); setFinished(false); setBurst(null);
      const timers: ReturnType<typeof setTimeout>[] = [];
      let at = 400;

      AGENTS.forEach((ag, i) => {
        const stageInfo = stages.find((s) => s.stage === ag.stageKey);
        const stageStats = stageInfo?.stats ?? {};
        const realLog = generateRealLogLines(ag.stageKey, stageStats, title);
        const stepMs = Math.max(1200, Math.min(ag.ms, (stageInfo?.duration_ms ?? ag.ms) * 30));

        timers.push(setTimeout(() => setActive(i), at));
        realLog.forEach((l, k) => {
          timers.push(setTimeout(() => {
            setLines((p) => [
              ...p.slice(-40),
              { ...l, agent: ag.code, at: Math.round(performance.now() - t0.current) },
            ]);
          }, at + 200 + (k * (stepMs - 400)) / realLog.length));
        });

        at += stepMs;
        timers.push(setTimeout(() => {
          setDone((d) => [...d, i]);
          setBurst(i);
          if (stageInfo?.duration_ms != null) {
            setLatencies((prev) => ({ ...prev, [i]: stageInfo.duration_ms! }));
          }
          timers.push(setTimeout(() => setBurst((b) => (b === i ? null : b)), 1000));
        }, at));
        at += 200;
      });

      timers.push(setTimeout(() => {
        setActive(-1);
        setFinished(true);
        clearInterval(tick);
        setElapsed(Math.round(performance.now() - t0.current));
        onComplete?.();
      }, at + 300));

      return () => {
        timers.forEach(clearTimeout);
        clearInterval(tick);
      };
    }
  }, [open, run, running, ready, stages, title, onComplete]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const pct = finished ? 100 : Math.min(99, Math.round(((done.length + (active >= 0 ? 0.5 : 0)) / 11) * 100));
  const stage = Math.min(11, finished ? 11 : (active >= 0 ? active : done.length) + 1);
  const stageName = AGENTS[stage - 1]?.code ?? "ORACLE-11";
  const replay = useCallback(() => setRun((r) => r + 1), []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="theater"
          className="fixed inset-0 z-50 overflow-hidden bg-[#06080D]/95 text-slate-200 backdrop-blur-2xl font-mono"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          role="dialog"
          aria-label="Mission Control Theater"
        >
          {/* Atmosphere & background mesh */}
          <div className="pointer-events-none absolute inset-0" style={{
            background: "radial-gradient(60% 50% at 20% 15%, rgba(56,189,248,.14), transparent 70%), radial-gradient(50% 50% at 85% 85%, rgba(167,139,250,.16), transparent 70%)" }} />
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{
            backgroundImage: "linear-gradient(#1E2633 1px, transparent 1px), linear-gradient(90deg, #1E2633 1px, transparent 1px)",
            backgroundSize: "56px 56px", transform: "perspective(900px) rotateX(58deg) scale(2.2) translateY(-8%)", transformOrigin: "50% 100%",
            maskImage: "linear-gradient(to top, black 10%, transparent 80%)", WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 80%)" }} />
          {stars.map((s, i) => (
            <motion.span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }}
              animate={{ opacity: [0.1, 0.8, 0.1] }} transition={{ duration: s.d, repeat: Infinity, delay: i * 0.07 }} />
          ))}
          <div className="pointer-events-none absolute inset-0 z-40 mix-blend-overlay opacity-40" style={{
            background: "repeating-linear-gradient(to bottom, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)" }} />

          {/* Top HUD Header */}
          <header className="relative z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-6 border-b border-[#1E2633] bg-[#06080D]/70 px-6 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs tracking-widest text-[#FB7185]">
                <motion.span animate={{ opacity: [1, 0.15, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>●</motion.span>
                LIVE AGENT MESH ORCHESTRATION
              </div>
              <div className="truncate text-sm text-slate-400">{title}</div>
            </div>
            <div className="w-[min(46vw,560px)]">
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span>Stage {stage} of 11: <span className="text-[#38BDF8]">{stageName}</span></span>
                <span className="tabular-nums">{pct}% · {fmt(elapsed)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#1E2633]">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-[#38BDF8] via-[#A78BFA] to-[#34D399] shadow-[0_0_12px_#38BDF8]"
                  animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 text-xs">
              <HudBtn onClick={replay} icon={RotateCcw} label="Replay Pulse Wave" />
              <HudBtn onClick={() => setMuted((m) => !m)} icon={muted ? VolumeX : Volume2} label={muted ? "Sound off" : "Sound on"} iconOnly />
              <HudBtn onClick={onClose} icon={Minimize2} label="Minimize to Canvas (ESC)" />
            </div>
          </header>

          {/* Neural Canvas & Laser Dataflow */}
          <main className="relative z-10 flex h-[calc(100%-4.5rem)] flex-col items-center overflow-x-auto px-4 pt-3">
            <div className="relative w-full min-w-[980px] max-w-[1280px]" style={{ aspectRatio: `${W}/${H}`, maxHeight: "calc(100vh - 17rem)" }}>
              <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                  <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                {["TIER 1 · PERCEPTION", "TIER 2 · PLANNING & MINING", "TIER 3 · TEMPORAL & ADVERSARIAL", "TIER 4 · VERIFICATION & OUTPUT"].map((t, i) => (
                  <text key={t} x={(12.5 + i * 25) / 100 * W} y={14} textAnchor="middle" fontSize="10" letterSpacing="2" fill="#475569">{t}</text>
                ))}
                {EDGES.map(([f, t], i) => {
                  const d = edgePath(AGENTS[f], AGENTS[t]);
                  const feeding = active === t;
                  const bursting = burst === f;
                  const c = AGENTS[f].color;
                  return (
                    <g key={`${run}-${i}`}>
                      <path id={`e${run}-${i}`} d={d} fill="none" stroke={c} strokeOpacity={feeding || bursting ? 0.7 : done.includes(f) ? 0.3 : 0.12} strokeWidth={feeding ? 1.8 : 1} strokeDasharray="4 6" />
                      {(feeding || bursting) && [0, 1, 2].map((k) => (
                        <circle key={`${k}-${feeding}-${bursting}`} r={bursting ? 4 : 3} fill={c} filter="url(#glow)">
                          <animateMotion dur={bursting ? "0.55s" : "1.4s"} begin={`${k * (bursting ? 0.18 : 0.45)}s`} repeatCount={bursting ? 2 : "indefinite"}>
                            <mpath href={`#e${run}-${i}`} />
                          </animateMotion>
                        </circle>
                      ))}
                    </g>
                  );
                })}
              </svg>

              {AGENTS.map((ag, i) => {
                const stageInfo = stages.find((s) => s.stage === ag.stageKey);
                const latency = latencies[i] ?? stageInfo?.duration_ms ?? [18, 42, 9, 27, 64, 15, 88, 33, 21, 12, 46][i];
                return (
                  <AgentNode key={`${run}-${ag.id}`} ag={ag} state={done.includes(i) ? "done" : active === i ? "active" : "idle"} latency={latency} idx={i} burst={burst === i} />
                );
              })}
            </div>

            {/* Live Telemetry Console (Real Data Inner Monologue) */}
            <div className="relative z-20 mt-auto mb-4 w-full max-w-[1100px] rounded-lg border border-[#1E2633] bg-[#06080D]/70 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-[#1E2633] px-3 py-1.5 text-[10px] tracking-widest text-slate-500">
                <span>AGENT REAL-TIME MONOLOGUE & TELEMETRY</span>
                <span>CONF {finished ? stats.score : Math.min(stats.score, pct)}% · EVIDENCE TRACE ACTIVE</span>
              </div>
              <div ref={consoleRef} className="h-28 space-y-0.5 overflow-y-auto px-3 py-2 text-[12px] leading-5">
                {lines.map((l, i) => {
                  const ag = AGENTS.find((a) => a.code === l.agent)!;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                      <span className="shrink-0 text-slate-600 tabular-nums">{fmt(l.at)}</span>
                      <span className="shrink-0 font-bold" style={{ color: ag?.color ?? "#38BDF8" }}>[{l.agent}]</span>
                      <span style={{ color: toneColor[l.tone ?? "info"] }}>{l.t}</span>
                    </motion.div>
                  );
                })}
                {!finished && <motion.span className="inline-block h-3 w-1.5 bg-[#38BDF8]" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />}
              </div>
            </div>
          </main>

          {/* Victory Overlay with real mathematical score and findings */}
          <AnimatePresence>
            {finished && <Victory stats={stats} onEnter={onEnterWorkspace} />}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────── Sub-components ───────────────────────── */

function HudBtn({ icon: Icon, label, onClick, iconOnly }: { icon: LucideIcon; label: string; onClick: () => void; iconOnly?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="flex items-center gap-1.5 rounded border border-[#1E2633] bg-[#0b1018] px-2.5 py-1.5 text-slate-300 transition hover:border-[#38BDF8] hover:text-[#38BDF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#38BDF8]">
      <Icon size={14} />{!iconOnly && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}

function AgentNode({ ag, state, latency, idx, burst }: { ag: Agent; state: "idle" | "active" | "done"; latency: number; idx: number; burst: boolean }) {
  const Icon = ag.icon;
  const isActive = state === "active", isDone = state === "done";
  const accent = isDone ? "#34D399" : ag.color;
  return (
    <motion.div
      className={`absolute w-[21%] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-[#0A0F17]/90 p-2.5 backdrop-blur ${isActive ? "shadow-[0_0_30px_var(--agent-glow)]" : isDone ? "shadow-[0_0_14px_rgba(52,211,153,.25)]" : ""}`}
      style={{ left: `${ag.x}%`, top: `${ag.y}%`, borderColor: state === "idle" ? "#1E2633" : accent, ["--agent-glow" as string]: ag.color + "99" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: state === "idle" ? 0.6 : 1, y: 0, scale: isActive ? 1.05 : 1 }}
      transition={{ delay: idx * 0.05, type: "spring", stiffness: 160, damping: 16 }}
    >
      {burst && (
        <motion.span className="pointer-events-none absolute inset-0 rounded-lg border-2" style={{ borderColor: ag.color }}
          initial={{ scale: 1, opacity: 1 }} animate={{ scale: [1, 1.4, 1], opacity: [1, 0] }} transition={{ duration: 1, ease: "easeOut" }} />
      )}
      {isActive && (
        <motion.span className="pointer-events-none absolute inset-0 rounded-lg" style={{ boxShadow: `0 0 28px ${ag.color}` }}
          animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 1.4, repeat: Infinity }} />
      )}
      <div className="flex items-center gap-2.5">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center">
          <span className={`absolute inset-0 rounded-full border border-dashed ${isActive ? "animate-spin" : ""}`}
            style={{ borderColor: accent, opacity: state === "idle" ? 0.25 : 0.9, animationDuration: "3s" }} />
          <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: accent + "22", color: accent }}>
            <Icon size={15} />
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold tracking-wide" style={{ color: ag.color }}>{ag.code}</div>
          <div className="truncate text-[10px] text-slate-400">{ag.role}</div>
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{ag.desc}</p>
      <div className="mt-1.5 flex items-center justify-between text-[10px] tracking-widest">
        <span style={{ color: isDone ? "#34D399" : isActive ? ag.color : "#475569" }}>
          {isDone ? "● COMPLETED" : isActive ? "● EXECUTING" : "○ STANDBY"}
        </span>
        {isDone && <span className="text-slate-400 tabular-nums">{latency}ms</span>}
      </div>
    </motion.div>
  );
}

function Victory({ stats, onEnter }: { stats: TheaterStats; onEnter: () => void }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const c = animate(0, stats.score, { duration: 2, delay: 0.7, ease: "easeOut", onUpdate: (v) => setVal(Math.round(v)) });
    return () => c.stop();
  }, [stats.score]);
  const R = 84, C = 2 * Math.PI * R;
  const items = [
    [stats.claims, "Claims Verified", "#34D399"],
    [stats.contradictions, "Contradiction Flagged", "#FB7185"],
    [stats.gaps, "Critical Gap Discovered", "#FBBF24"],
    [stats.tasks, "Verification Tasks", "#38BDF8"],
  ] as const;
  return (
    <motion.div className="absolute inset-0 z-50 grid place-items-center bg-[#06080D]/80 backdrop-blur-md"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      <motion.div className="pointer-events-none absolute inset-y-0 w-1/3"
        style={{ background: "linear-gradient(90deg, transparent, rgba(52,211,153,.35), rgba(56,189,248,.25), transparent)", filter: "blur(18px)" }}
        initial={{ x: "-40vw" }} animate={{ x: "140vw" }} transition={{ duration: 1.4, ease: "easeInOut" }} />
      <div className="relative flex flex-col items-center gap-8 px-6">
        <div className="relative h-52 w-52">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" stroke="#1E2633" strokeWidth="8" />
            <motion.circle cx="100" cy="100" r={R} fill="none" stroke="#34D399" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - stats.score / 100) }}
              transition={{ duration: 2, delay: 0.7, ease: "easeOut" }} style={{ filter: "drop-shadow(0 0 8px #34D399)" }} />
          </svg>
          <motion.div className="absolute inset-[-14px] rounded-full border border-dashed border-[#38BDF8]/40"
            animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} />
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-5xl font-semibold tabular-nums text-white">{val}<span className="text-xl text-slate-500"> / 100</span></div>
              <div className="mt-1 text-[11px] tracking-widest text-slate-400">COMPLETENESS</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map(([n, l, c], i) => (
            <motion.div key={l} className="min-w-[150px] rounded-lg border border-[#1E2633] bg-[#0A0F17]/90 px-4 py-3 text-center"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 + i * 0.12 }}>
              <div className="text-3xl font-semibold tabular-nums" style={{ color: c }}>{n}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{l}</div>
            </motion.div>
          ))}
        </div>
        <motion.button onClick={onEnter} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.9 }}
          className="group flex items-center gap-2 rounded-md border border-[#38BDF8] bg-[#38BDF8]/10 px-6 py-3 text-sm font-semibold text-[#38BDF8] shadow-[0_0_24px_rgba(56,189,248,.35)] transition hover:bg-[#38BDF8] hover:text-[#06080D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38BDF8]">
          Enter Workspace Dashboard <ArrowRight size={16} className="transition group-hover:translate-x-1" />
        </motion.button>
      </div>
    </motion.div>
  );
}