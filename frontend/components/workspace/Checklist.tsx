"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Task } from "@/lib/types";
import { Button, EmptyState, Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./badges";

function TaskRow({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [notes, setNotes] = useState(task.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = task.status === "COMPLETED";
  const patch = async (b: { status?: string; notes?: string }) => {
    setBusy(true); setErr(null);
    try { await api.patchTask(task.id, b); onChanged(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <li className={cn("space-y-2 p-4", done && "opacity-70")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1.5 h-4 w-4 accent-[#8B9CF6]" checked={done} disabled={busy} aria-label={`Mark complete: ${task.title}`} onChange={(e) => patch({ status: e.target.checked ? "COMPLETED" : "PENDING" })} />
        <div className="flex-1 space-y-1">
          <p className={cn("text-base", done && "line-through")}>{task.title}</p>
          <div className="flex flex-wrap items-center gap-2"><PriorityBadge priority={task.priority} />{task.finding_ref && <span className="text-xs text-mute">from {task.finding_ref}</span>}<span className="text-xs text-mute">best source: {task.recommended_source_type.replace(/_/g, " ")}</span></div>
          <p className="prose-line text-sm text-mute">{task.reason}</p>
          {task.suggested_question && <p className="text-sm"><span className="text-mute">Ask: </span>{task.suggested_question}</p>}
          <details className="text-xs text-mute"><summary className="cursor-pointer">Why this priority</summary>
            <pre className="mt-1 whitespace-pre-wrap font-mono">{JSON.stringify(task.priority_reasoning, null, 2)}</pre></details>
          <label className="sr-only" htmlFor={`n-${task.id}`}>Notes for {task.title}</label>
          <div className="flex gap-2"><input id={`n-${task.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note" className="h-8 flex-1 rounded border border-line bg-bg px-2 text-sm" />
            <Button size="sm" variant="secondary" loading={busy} onClick={() => patch({ notes })}>Save note</Button></div>
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        </div>
      </div>
    </li>
  );
}

export function Checklist({ items, onChanged }: { items: Task[]; onChanged: () => void }) {
  if (items.length === 0) return <EmptyState title="No verification tasks yet">Run the analysis to generate a prioritized checklist.</EmptyState>;
  const done = items.filter((t) => t.status === "COMPLETED").length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-mute" aria-live="polite">{done} of {items.length} tasks completed. Tasks are only completed by you, never by the analysis.</p>
      <Panel><ul className="divide-y divide-line">{items.map((t) => <TaskRow key={t.id} task={t} onChanged={onChanged} />)}</ul></Panel>
    </div>
  );
}
