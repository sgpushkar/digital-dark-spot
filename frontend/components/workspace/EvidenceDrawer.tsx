"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate, splitAround } from "@/lib/utils";
import { ErrorState, Spinner } from "@/components/ui/primitives";
import { EpistemicBadge, FreshnessBadge, PriorityBadge, SeverityBadge } from "./badges";

export function Passage({ text, quote }: { text: string; quote: string }) {
  const parts = splitAround(text, quote);
  return (
    <p className="prose-line whitespace-pre-wrap rounded border border-line bg-bg p-3 text-sm leading-relaxed text-mute">
      {parts ? <>{parts.before}<mark className="evidence">{parts.hit}</mark>{parts.after}</> : text}
    </p>
  );
}

function Trail({ sid, claimRef, onOpen }: { sid: string; claimRef: string; onOpen: (ref: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api.evidence(sid, claimRef), [sid, claimRef]);
  if (loading) return <Spinner label="Loading evidence trail" />;
  if (error || !data) return <ErrorState message={error ?? "Evidence unavailable"} onRetry={reload} />;
  const { claim, source, passage } = data;
  return (
    <div className="space-y-5">
      <section aria-label="Extracted claim">
        <h3 className="text-base text-mute">Extracted claim <span className="font-mono text-xs">{claim.ref}</span></h3>
        <p className="mt-1 text-lg">{claim.object}</p>
        <p className="mt-1 text-sm text-mute">{claim.category.replace(/_/g, " ")} · {claim.method === "heuristic" ? "rule-based extraction" : "LLM extraction"} · confidence {claim.confidence}{claim.quote_verified ? " · quote verified in source" : " · quote NOT verified"}</p>
      </section>
      <section aria-label="Original passage">
        <h3 className="text-base text-mute">Original passage</h3>
        {passage.text ? <Passage text={passage.text} quote={claim.evidence_quote} /> : <p className="text-sm text-mute">Passage unavailable.</p>}
        <p className="mt-1 text-xs text-mute">{passage.section_heading ? `Section: ${passage.section_heading}` : "No section heading"}{passage.page_number ? ` · page ${passage.page_number}` : ""}{passage.chunk_ref ? ` · ${passage.chunk_ref}` : ""}</p>
      </section>
      <section aria-label="Source">
        <h3 className="text-base text-mute">Source <span className="font-mono text-xs">{source.ref}</span></h3>
        <p className="mt-1">{source.title ?? source.url}</p>
        <p className="text-sm text-mute">{source.domain} · {source.source_type.replace(/_/g, " ")} · published {fmtDate(source.publication_date)} · modified {fmtDate(source.modified_date)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FreshnessBadge label={source.freshness?.label} />
          {source.link ? <a className="inline-flex items-center gap-1 text-sm text-accent underline" href={source.link} target="_blank" rel="noopener noreferrer">Open source <ExternalLink className="h-3 w-3" aria-hidden /></a> : <span className="text-sm text-mute">No public link (uploaded document)</span>}
        </div>
      </section>
      {data.related_claims.length > 0 && (
        <section aria-label="Related claims">
          <h3 className="text-base text-mute">Related claims</h3>
          <ul className="mt-1 space-y-2">
            {data.related_claims.map((r) => (
              <li key={r.claim.ref} className="rounded border border-line p-3 text-sm">
                <span className="text-mute">{r.relationship === "CLAIM_CONTRADICTS_CLAIM" ? "Conflicts with" : "Corroborated by"}</span>{" "}
                <button className="text-accent underline" onClick={() => onOpen(r.claim.ref)}>{r.claim.ref} ({r.claim.source_ref}): {r.claim.object}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.findings.length > 0 && (
        <section aria-label="Related findings">
          <h3 className="text-base text-mute">Findings that cite this claim</h3>
          <ul className="mt-1 space-y-2">
            {data.findings.map((f) => (
              <li key={f.ref} className="rounded border border-line p-3 text-sm">
                <p>{f.title}</p>
                <div className="mt-2 flex flex-wrap gap-2"><SeverityBadge severity={f.severity} /><EpistemicBadge status={f.epistemic_status} /></div>
              </li>
            ))}
          </ul>
          {data.tasks.map((t) => <p key={t.id} className="mt-2 text-sm text-mute">Task: {t.title} <PriorityBadge priority={t.priority} /></p>)}
        </section>
      )}
    </div>
  );
}

export function EvidenceDrawer({ sid, claimRef, onChange }: { sid: string; claimRef: string | null; onChange: (ref: string | null) => void }) {
  return (
    <Dialog.Root open={!!claimRef} onOpenChange={(o) => !o && onChange(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-6">
          <div className="mb-4 flex items-start justify-between">
            <Dialog.Title className="font-serif text-xl">Evidence trail</Dialog.Title>
            <Dialog.Close className="rounded p-1 text-mute hover:text-ink" aria-label="Close evidence trail"><X className="h-5 w-5" /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Source, original passage, claim and related findings</Dialog.Description>
          {claimRef && <Trail sid={sid} claimRef={claimRef} onOpen={(r) => onChange(r)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
