"use client";
import { ExternalLink } from "lucide-react";
import type { Source } from "@/lib/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { FreshnessBadge } from "./badges";

export function SourcesPanel({ sources }: { sources: Source[] }) {
  return (
    <Panel className="divide-y divide-line" aria-label="Sources">
      {sources.map((s) => (
        <div key={s.id} className="space-y-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-mute">{s.ref}</span><span>{s.title ?? s.url}</span>
            <Badge className={s.extraction_status === "done" ? "border-ok/40 bg-ok/10 text-ok" : s.extraction_status === "failed" ? "border-bad/40 bg-bad/10 text-bad" : "border-line bg-elevated text-mute"}>{s.extraction_status}</Badge>
            <FreshnessBadge label={s.freshness?.label} />
          </div>
          <p className="text-sm text-mute">{s.source_type.replace(/_/g, " ")} · {s.domain} · published {fmtDate(s.publication_date)}{s.date_origins.publication_date ? ` (${s.date_origins.publication_date})` : ""} · modified {fmtDate(s.modified_date)} · retrieved {fmtDate(s.retrieved_at)}</p>
          {s.error_message && <p role="alert" className="text-sm text-bad">{s.error_message}</p>}
          {s.injection_markers.length > 0 && <p className="text-sm text-warn">Contains instruction-like text ({s.injection_markers.join(", ")}). It was treated as data and not followed.</p>}
          {s.freshness && s.freshness.label !== "CURRENT" && <p className="text-sm text-mute">{s.freshness.reasons.join(" ")}</p>}
          {s.link && <a className="inline-flex items-center gap-1 text-sm text-accent underline" href={s.link} target="_blank" rel="noopener noreferrer">Open source <ExternalLink className="h-3 w-3" aria-hidden /></a>}
        </div>
      ))}
    </Panel>
  );
}
