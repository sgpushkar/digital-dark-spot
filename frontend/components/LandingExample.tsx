"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, FileText, Sparkles, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";

/** Static illustration of the kinds of output the engine produces. Clearly labelled; the live product never uses this data. */
const VIEWS = {
  conflicts: {
    id: "conflicts",
    title: "Conflicting claims",
    badge: "2 discrepancies",
    icon: AlertCircle,
    items: [
      {
        k: "Application deadline",
        v: "10 November 2026",
        q: "Applications close on 10 November 2026 at 23:59 IST.",
        s: "Official guidelines 2026-27 (Section 4.1)",
        tag: "Source A",
      },
      {
        k: "Application deadline",
        v: "20 November 2026",
        q: "Applications for the 2026-27 cycle must be submitted by 20 November 2026.",
        s: "Partner university FAQ (Updated Oct 2026)",
        tag: "Source B",
      },
    ],
  },
  established: {
    id: "established",
    title: "Established facts",
    badge: "Verified quotes",
    icon: CheckCircle2,
    items: [
      {
        k: "Annual award",
        v: "₹1,50,000 per academic year",
        q: "The award is ₹1,50,000 per academic year for domestic students, paid in two equal instalments.",
        s: "Official guidelines 2026-27 (Clause 2.3)",
        tag: "Verified quote",
      },
      {
        k: "Required documents",
        v: "Transcript, SOP, 2 Recommendation letters",
        q: "Applicants must upload their latest transcript, a statement of purpose and two recommendation letters.",
        s: "Official guidelines 2026-27 (Section 3)",
        tag: "Verified quote",
      },
    ],
  },
  missing: {
    id: "missing",
    title: "Information gaps",
    badge: "1 Dark Spot",
    icon: HelpCircle,
    items: [
      {
        k: "Renewal conditions",
        v: "Not found in sources reviewed",
        q: "Potential information gap: this does not prove the policy is absent. It means none of the 4 sources reviewed mentions it.",
        s: "Omitted across all 4 reference documents",
        tag: "Investigation task",
      },
    ],
  },
} as const;

export function LandingExample() {
  const [view, setView] = useState<keyof typeof VIEWS>("conflicts");
  const [open, setOpen] = useState<number | null>(0);
  const current = VIEWS[view];

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-md overflow-hidden" aria-label="Example output">
      {/* Dossier Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-elevated/40 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-accent text-xs">
            <FileText className="h-3 w-3" />
          </span>
          <span className="font-mono text-xs font-semibold tracking-wider uppercase text-heading">
            Dossier Preview
          </span>
        </div>
        <span className="rounded-full bg-warning/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-heading border border-warning/30">
          Demo Scholarship Case
        </span>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Example views" className="flex border-b border-line bg-surface px-3 pt-2 gap-1 overflow-x-auto">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => {
          const item = VIEWS[k];
          const active = view === k;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setView(k);
                setOpen(0);
              }}
              className={cn(
                "relative flex items-center gap-2 rounded-t-lg px-3.5 py-2 text-xs sm:text-sm font-medium transition-all",
                active
                  ? "bg-bg text-primary font-bold shadow-xs border-t border-x border-line -mb-px pb-2.5 z-10"
                  : "text-mute hover:text-heading hover:bg-elevated/50"
              )}
            >
              <item.icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-mute")} />
              <span>{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* Accordion / Content */}
      <ul className="divide-y divide-line/70 bg-bg/40">
        {current.items.map((it, i) => {
          const isOpen = open === i;
          return (
            <li key={i} className="transition-colors hover:bg-surface/60">
              <button
                className="flex w-full items-start justify-between gap-4 p-4 sm:px-5 text-left transition-colors"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-mute">{it.k}</span>
                    <span className={cn(
                      "rounded px-1.5 py-0.2 font-mono text-[10px] font-semibold",
                      view === "conflicts" ? "bg-bad/15 text-bad border border-bad/30" :
                      view === "missing" ? "bg-warning/20 text-warning border border-warning/30" :
                      "bg-ok/15 text-ok border border-ok/30"
                    )}>
                      {it.tag}
                    </span>
                  </div>
                  <p className="font-heading font-bold text-base sm:text-lg text-heading">{it.v}</p>
                </div>
                <ChevronRight className={cn(
                  "h-4 w-4 shrink-0 text-mute transition-transform duration-200 mt-1",
                  isOpen && "rotate-90 text-primary"
                )} />
              </button>

              {isOpen && (
                <div className="border-t border-line/60 bg-surface px-5 py-4 space-y-2">
                  <div className="rounded-lg border border-line bg-elevated/30 p-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-mute block mb-1">
                      Direct Source Passage
                    </span>
                    <blockquote className="prose-line text-sm text-heading italic leading-relaxed">
                      “{it.q}”
                    </blockquote>
                  </div>
                  <div className="flex items-center justify-between text-xs text-mute font-mono pt-1">
                    <span>Provenance: <strong className="text-heading font-medium">{it.s}</strong></span>
                    <span className="text-ok font-semibold">100% Deterministic</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Footer Meta */}
      <div className="border-t border-line bg-elevated/30 px-5 py-2.5 flex items-center justify-between text-xs text-mute font-mono">
        <span>Cycle: 2026-27</span>
        <span>Resolution engine: active</span>
      </div>
    </div>
  );
}
