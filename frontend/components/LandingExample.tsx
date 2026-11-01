"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Static illustration of the kinds of output the engine produces. Clearly labelled; the live product never uses this data. */
const VIEWS = {
  established: {
    title: "What the sources establish",
    items: [
      { k: "Award", v: "₹1,50,000 per academic year (domestic)", q: "The award is ₹1,50,000 per academic year for domestic students, paid in two instalments.", s: "Official guidelines 2026-27" },
      { k: "Documents", v: "Transcript, statement of purpose, two recommendation letters", q: "Applicants must upload their latest transcript, a statement of purpose and two recommendation letters.", s: "Official guidelines 2026-27" },
    ],
  },
  conflicts: {
    title: "What conflicts",
    items: [
      { k: "Application deadline", v: "10 November 2026", q: "Applications close on 10 November 2026.", s: "Official guidelines 2026-27" },
      { k: "Application deadline", v: "20 November 2026", q: "Applications for the 2026-27 cycle must be submitted by 20 November 2026.", s: "Partner university FAQ" },
    ],
  },
  missing: {
    title: "What is missing",
    items: [{ k: "Renewal conditions", v: "Not found in the sources reviewed", q: "Potential information gap: this does not prove the policy is absent. It means none of the four sources mentions it.", s: "No source" }],
  },
} as const;

export function LandingExample() {
  const [view, setView] = useState<keyof typeof VIEWS>("conflicts");
  const [open, setOpen] = useState<number | null>(0);
  const v = VIEWS[view];
  return (
    <div className="rounded-lg border border-line bg-surface" aria-label="Example output">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div role="tablist" aria-label="Example views" className="flex gap-1">
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setOpen(0); }}
              className={cn("rounded px-3 py-1.5 text-sm", view === k ? "bg-elevated text-ink" : "text-mute hover:text-ink")}>{VIEWS[k].title}</button>))}
        </div>
        <span className="text-xs text-warn">Illustration from the fictional demo scholarship</span>
      </div>
      <ul className="divide-y divide-line">
        {v.items.map((it, i) => (
          <li key={i}>
            <button className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left hover:bg-elevated" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span className="text-sm text-mute">{it.k}</span><span className="font-serif text-lg">{it.v}</span>
            </button>
            {open === i && <div className="space-y-1 bg-bg px-4 py-3 text-sm"><p className="prose-line text-mute">“{it.q}”</p><p className="text-xs text-mute">Source: {it.s}</p></div>}
          </li>))}
      </ul>
    </div>
  );
}
