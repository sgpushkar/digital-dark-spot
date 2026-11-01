"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { Badge, Button, EmptyState, ErrorState, Panel, Spinner } from "@/components/ui/primitives";
import { ResearchForm } from "@/components/ResearchForm";
import { fmtDate } from "@/lib/utils";

export default function ResearchHome() {
  const router = useRouter();
  const list = useLoad(() => api.listResearch(), []);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState<string | null>(null);
  const openDemo = async () => {
    setDemoBusy(true); setDemoErr(null);
    try { const s = await api.createDemo(); router.push(`/research/${s.id}`); } catch (e) { setDemoErr((e as Error).message); } finally { setDemoBusy(false); }
  };
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1.2fr_1fr]">
      <section>
        <h1 className="text-3xl">Start a research workspace</h1>
        <p className="prose-line mt-2 text-mute">Add the question, the pages and documents you have, and the analysis will show what they establish, what they leave out, and what to check next.</p>
        <div className="mt-6"><ResearchForm onCreated={(id, notes) => router.push(`/research/${id}${notes.length ? `?notes=${encodeURIComponent(notes.join("|"))}` : ""}`)} /></div>
      </section>
      <aside className="space-y-8">
        <Panel className="p-5">
          <h2 className="text-xl">Try the demonstration</h2>
          <p className="mt-2 text-sm text-mute">A fictional scholarship with four sample sources: a conflicting deadline, a previous-year page, and a missing renewal policy. It runs through the same engine as real research and is labelled as demonstration data throughout.</p>
          <Button className="mt-4" variant="secondary" loading={demoBusy} onClick={openDemo}>Open the demo workspace</Button>
          {demoErr && <div className="mt-3"><ErrorState message={demoErr} /></div>}
        </Panel>
        <section>
          <h2 className="text-xl">Your workspaces</h2>
          {list.loading ? <Spinner /> : list.error ? <div className="mt-3"><ErrorState message={list.error} onRetry={list.reload} /></div> :
            !list.data || list.data.items.length === 0 ? <div className="mt-3"><EmptyState title="No research yet">Create one with the form, or open the demonstration.</EmptyState></div> : (
              <ul className="mt-3 space-y-2">{list.data.items.map((s) => (
                <li key={s.id}><Link href={`/research/${s.id}`} className="block rounded-lg border border-line bg-surface p-3 hover:border-accent/60">
                  <span className="block">{s.title}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-mute">{fmtDate(s.created_at.slice(0, 10))} · {s.status.replace(/_/g, " ")}{s.is_demo && <Badge className="border-warn/40 bg-warn/10 text-warn">Demo data</Badge>}</span></Link></li>))}</ul>)}
        </section>
      </aside>
    </div>
  );
}
