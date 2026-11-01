"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { CoverageItem } from "@/lib/types";
import { Panel } from "@/components/ui/primitives";
import { CoverageBadge } from "./badges";

export function CoverageMatrix({ items, onOpenClaim }: { items: CoverageItem[]; onOpenClaim: (ref: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel className="divide-y divide-line" role="table" aria-label="Information coverage matrix">
      <div role="row" className="hidden grid-cols-[1.4fr_1fr_1.2fr_2fr] gap-4 px-4 py-2 text-sm text-mute md:grid">
        <span role="columnheader">Information needed</span><span role="columnheader">Status</span><span role="columnheader">Sources</span><span role="columnheader">What the evidence shows</span>
      </div>
      {items.map((it) => {
        const isOpen = open === it.category;
        return (
          <div key={it.category} role="row">
            <button className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-elevated md:grid-cols-[1.4fr_1fr_1.2fr_2fr] md:gap-4" aria-expanded={isOpen}
              aria-label={`${it.label}: ${it.status}`} onClick={() => setOpen(isOpen ? null : it.category)}>
              <span role="cell" className="flex items-center gap-2">{isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}<span>{it.label}</span></span>
              <span role="cell"><CoverageBadge status={it.status} /></span>
              <span role="cell" className="text-sm text-mute">{it.source_refs.length ? it.source_refs.join(", ") : "none"}</span>
              <span role="cell" className="text-sm text-mute">{it.explanation}</span>
            </button>
            {isOpen && (
              <div className="space-y-3 bg-bg px-4 py-4 pl-10" data-testid={`evidence-${it.category}`}>
                <p className="prose-line text-sm text-mute">{it.description}</p>
                {it.claims.length === 0 ? (
                  <p className="text-sm">No supporting claims were extracted.{it.mention_chunk_refs.length > 0 && ` Possible mentions: ${it.mention_chunk_refs.join(", ")}.`}</p>
                ) : (
                  <ul className="space-y-2">
                    {it.claims.map((c) => (
                      <li key={c.ref} className="rounded border border-line p-3 text-sm">
                        <button className="text-left text-accent underline" onClick={() => onOpenClaim(c.ref)}>{c.ref} · {c.source_ref}: {c.object}</button>
                        <p className="mt-1 text-mute">“{c.evidence_quote}”</p>
                      </li>
                    ))}
                  </ul>
                )}
                {it.suggested_question && <p className="text-sm"><span className="text-mute">Question to ask: </span>{it.suggested_question}</p>}
                <p className="text-xs text-mute">Category proposed by {it.generation_method} · importance {it.importance}/5 · consequence {it.consequence}/5</p>
              </div>
            )}
          </div>
        );
      })}
    </Panel>
  );
}
