"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { ConflictItem, NonConflict } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { Button, EmptyState, Panel } from "@/components/ui/primitives";
import { FreshnessBadge, EpistemicBadge, SeverityBadge } from "./badges";
import { Passage } from "./EvidenceDrawer";

function Reviewer({ item, onChanged }: { item: ConflictItem; onChanged: () => void }) {
  const [note, setNote] = useState(item.user_note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = async (status: string) => {
    setBusy(true); setErr(null);
    try { await api.patchFinding(item.id, { verification_status: status, user_note: note }); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-sm">Your review: <strong>{item.verification_status}</strong>. <span className="text-mute">Marking this does not change what the sources say.</span></p>
      <label className="block text-sm text-mute" htmlFor={`note-${item.ref}`}>Note (optional)</label>
      <textarea id={`note-${item.ref}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded border border-line bg-bg p-2 text-sm" />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" loading={busy} onClick={() => set("reviewed")}>Mark as reviewed</Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => set("resolved")}>Mark as resolved</Button>
        {item.verification_status !== "unresolved" && <Button size="sm" variant="ghost" loading={busy} onClick={() => set("unresolved")}>Reopen</Button>}
      </div>
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
    </div>
  );
}

export function ContradictionExplorer({ items, notConflicts, onOpenClaim, onChanged }: { items: ConflictItem[]; notConflicts: NonConflict[]; onOpenClaim: (ref: string) => void; onChanged: () => void }) {
  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <EmptyState title="No contradictions detected">The sources reviewed do not make incompatible claims about the same property. That does not mean they are correct.</EmptyState>
      ) : items.map((it) => (
        <Panel key={it.ref} className="space-y-4 p-4" aria-label={it.title}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-lg">{it.title}</h3>
            <div className="flex gap-2"><SeverityBadge severity={it.severity} /><EpistemicBadge status={it.epistemic_status} /></div>
          </div>
          <p className="prose-line text-sm">{it.conflict?.explanation ?? it.description}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {it.claims.map((c, i) => (
              <div key={c.ref} className="space-y-2 rounded border border-line p-3">
                <p className="text-sm text-mute">Claim {String.fromCharCode(65 + i)} · {c.source_ref}</p>
                <p className="font-serif text-xl">{c.object}</p>
                <Passage text={c.original_text} quote={c.evidence_quote} />
                <p className="text-sm">{c.source.title ?? c.source.url}</p>
                <p className="text-xs text-mute">Published {fmtDate(c.source.publication_date)} · modified {fmtDate(c.source.modified_date)}</p>
                <div className="flex flex-wrap items-center gap-2"><FreshnessBadge label={c.source.freshness?.label} />
                  {c.source.link && <a className="text-sm text-accent underline" href={c.source.link} target="_blank" rel="noopener noreferrer">Open source</a>}
                  <button className="text-sm text-accent underline" onClick={() => onOpenClaim(c.ref)}>Full evidence trail</button></div>
              </div>
            ))}
          </div>
          <p className="text-sm"><span className="text-mute">Recommended: </span>{it.conflict?.recommended_verification}</p>
          <Reviewer item={it} onChanged={onChanged} />
        </Panel>
      ))}
      {notConflicts.length > 0 && (
        <section>
          <h3 className="text-lg">Differences examined and not treated as contradictions</h3>
          <ul className="mt-2 space-y-2">
            {notConflicts.map((n, i) => <li key={i} className="rounded border border-line p-3 text-sm"><span className="text-mute">{n.kind.replace(/_/g, " ")} · {n.claim_refs.join(" vs ")}:</span> {n.explanation}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
