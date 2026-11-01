"use client";
import { useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import type { Claim, GraphData, SearchHit, Source } from "@/lib/types";
import { Button, EmptyState, ErrorState, Panel, Spinner } from "@/components/ui/primitives";
import { cn, fmtDate } from "@/lib/utils";
import { FreshnessBadge } from "./badges";

const NODE_STYLE: Record<string, string> = { source: "#8B9CF6", claim: "#929BA8", finding: "#E7AD52", task: "#35B779" };
const EDGE_COLOR: Record<string, string> = { CLAIM_CONTRADICTS_CLAIM: "#E36C75" };

export function EvidenceGraph({ data, onOpenClaim }: { data: GraphData; onOpenClaim: (ref: string) => void }) {
  const rows: Record<string, number> = { source: 0, claim: 1, finding: 2, task: 3 };
  const counters: Record<string, number> = {};
  const nodes: Node[] = data.nodes.map((n) => {
    const col = (counters[n.type] = (counters[n.type] ?? -1) + 1);
    return { id: n.id, position: { x: col * 230, y: (rows[n.type] ?? 0) * 130 }, data: { label: `${n.id}: ${n.label}` },
      style: { background: "#12161C", color: "#F3F4F6", border: `1px solid ${NODE_STYLE[n.type] ?? "#242B35"}`, borderRadius: 6, fontSize: 12, width: 200, padding: 8 } };
  });
  const edges: Edge[] = data.edges.map((e, i) => ({ id: `${i}`, source: e.source, target: e.target, label: e.type === "CLAIM_CONTRADICTS_CLAIM" ? "contradicts" : undefined,
    style: { stroke: EDGE_COLOR[e.type] ?? "#3A4452" }, labelStyle: { fill: "#E36C75", fontSize: 11 }, markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[e.type] ?? "#3A4452" } }));
  return (
    <div className="h-[460px] rounded-lg border border-line bg-surface" role="group" aria-label="Evidence graph: sources, claims, findings and tasks">
      <ReactFlow nodes={nodes} edges={edges} fitView nodesConnectable={false} proOptions={{ hideAttribution: true }} onNodeClick={(_, n) => n.id.startsWith("claim_") && onOpenClaim(n.id)}>
        <Background color="#242B35" gap={24} /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function EvidenceExplorer({ sid, claims, sources, onOpenClaim }: { sid: string; claims: Claim[]; sources: Source[]; onOpenClaim: (ref: string) => void }) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ items: SearchHit[]; semantic: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const graph = useLoad(() => api.graph(sid), [sid]);
  const cats = Array.from(new Set(claims.map((c) => c.category)));
  const shown = claims.filter((c) => cat === "all" || c.category === cat);
  const byRef = Object.fromEntries(sources.map((s) => [s.ref, s]));

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true); setErr(null);
    try { const r = await api.search(sid, q.trim()); setHits({ items: r.items, semantic: r.semantic_embeddings }); }
    catch (x) { setErr((x as Error).message); } finally { setSearching(false); }
  };

  return (
    <div className="space-y-8">
      <section aria-label="Search the evidence">
        <h3 className="text-lg">Search the source passages</h3>
        <form onSubmit={run} className="mt-2 flex gap-2" role="search">
          <label htmlFor="evq" className="sr-only">Search query</label>
          <input id="evq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. when do applications close" className="h-10 flex-1 rounded border border-line bg-bg px-3" />
          <Button type="submit" loading={searching}>Search</Button>
        </form>
        {err && <div className="mt-2"><ErrorState message={err} /></div>}
        {hits && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-mute">Hybrid ranking: keyword (BM25) and vector similarity fused with reciprocal rank fusion. {hits.semantic ? "" : "Vectors here are lexical hashes, not semantic embeddings."}</p>
            {hits.items.length === 0 ? <p className="text-sm text-mute">No passages matched.</p> : hits.items.map((h) => (
              <Panel key={h.chunk_ref} className="p-3 text-sm">
                <p className="line-clamp-3">{h.text}</p>
                <p className="mt-2 text-xs text-mute">{h.source_ref} · {h.chunk_ref}{h.section_heading ? ` · ${h.section_heading}` : ""}{h.page_number ? ` · page ${h.page_number}` : ""} · bm25 {h.scores.bm25.toFixed(2)} · vector {h.scores.vector == null ? "n/a" : h.scores.vector.toFixed(2)} · rrf {h.scores.rrf.toFixed(4)} · matched: {h.matched_terms.join(", ") || "none"}</p>
              </Panel>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Extracted claims">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg">Extracted claims <span className="text-mute">({shown.length})</span></h3>
          <label className="flex items-center gap-2 text-sm text-mute">Category
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-8 rounded border border-line bg-bg px-2 text-ink">
              <option value="all">All</option>{cats.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select></label>
        </div>
        {shown.length === 0 ? <div className="mt-3"><EmptyState title="No claims extracted yet" /></div> : (
          <ul className="mt-3 space-y-2">
            {shown.map((c) => {
              const s = c.source_ref ? byRef[c.source_ref] : undefined;
              return (
                <li key={c.ref}>
                  <button onClick={() => onOpenClaim(c.ref)} className={cn("w-full rounded-lg border border-line bg-surface p-3 text-left hover:border-accent/60")}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-serif text-lg">{c.object.length > 90 ? c.object.slice(0, 90) + "…" : c.object}</span>
                      <span className="font-mono text-xs text-mute">{c.ref}</span></div>
                    <p className="mt-1 text-sm text-mute">“{c.evidence_quote}”</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute">{c.category.replace(/_/g, " ")} · {s?.title ?? c.source_ref} · published {fmtDate(s?.publication_date)} <FreshnessBadge label={s?.freshness?.label} /></p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Evidence graph">
        <h3 className="text-lg">Evidence graph</h3>
        <p className="mb-2 text-sm text-mute">Source → claim → finding → task. Click a claim node to open its trail.</p>
        {graph.loading ? <Spinner label="Loading graph" /> : graph.error || !graph.data ? <ErrorState message={graph.error ?? "Graph unavailable"} onRetry={graph.reload} /> :
          graph.data.nodes.length === 0 ? <EmptyState title="Nothing to draw yet" /> : <EvidenceGraph data={graph.data} onOpenClaim={onOpenClaim} />}
      </section>
    </div>
  );
}
