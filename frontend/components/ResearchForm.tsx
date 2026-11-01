"use client";
import { useState } from "react";
import { Sparkles, Check, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { Button, ErrorState, Badge } from "@/components/ui/primitives";

const MAX_MB = 10;

export const DEMO_PRESETS = [
  {
    id: "scholarship",
    icon: "🎓",
    label: "Scholarship Discrepancy",
    tag: "Deadline Conflict + Missing Policy",
    question: "What should I verify before applying for the Meridian Excellence Scholarship (2026-27 cycle)?",
    topic: "Meridian Excellence Scholarship",
    objective: "Decide whether I can apply to the Meridian Excellence Scholarship for 2026-27 and what is still unknown.",
    urls: "https://en.wikipedia.org/wiki/Rhodes_Scholarship\nhttps://en.wikipedia.org/wiki/Fulbright_Program",
    hint: "Demonstrates cross-source deadline conflict (10 Nov vs 20 Nov) & missing renewal rules.",
  },
  {
    id: "ev-specs",
    icon: "⚡",
    label: "EV Battery Specs",
    tag: "Fast-Charging Conflict + Missing Warranty",
    question: "What are the verified battery range, 10-80% charging speed, and degradation warranty for the Apex EV Model 5?",
    topic: "Apex EV Model 5 Specifications",
    objective: "Compare manufacturer claims against distributor specs to find conflicting charge speeds and verify if degradation terms are missing.",
    urls: "https://en.wikipedia.org/wiki/Electric_vehicle_battery\nhttps://en.wikipedia.org/wiki/Lithium-ion_battery",
    hint: "Pre-made files in demo-samples/ can also be dropped into the Documents upload below.",
  },
  {
    id: "clinical-trial",
    icon: "🏥",
    label: "Clinical Trial Protocol",
    tag: "Outdated Draft vs Guidelines + Missing Dosing",
    question: "What is the approved pediatric dosage, monitoring interval, and contraindication list for Protocol RX-79?",
    topic: "Protocol RX-79 Clinical Guidelines",
    objective: "Identify discrepancies between preliminary trial advisory and 2026 hospital guidelines, and highlight missing contraindication details.",
    urls: "https://en.wikipedia.org/wiki/Clinical_trial\nhttps://en.wikipedia.org/wiki/Intravenous_therapy",
    hint: "Demonstrates target period freshness validation against historical archives.",
  },
];

export function parseUrls(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)));
}

export function ResearchForm({ onCreated }: { onCreated: (id: string, notes: string[]) => void }) {
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("");
  const [urls, setUrls] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (preset: typeof DEMO_PRESETS[number]) => {
    setQuestion(preset.question);
    setTopic(preset.topic);
    setObjective(preset.objective);
    setUrls(preset.urls);
    setActivePreset(preset.id);
    setFieldError(null);
  };

  const onFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const tooBig = picked.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) { setFieldError(`${tooBig.name} is larger than ${MAX_MB} MB.`); return; }
    setFieldError(null); setFiles(picked);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (question.trim().length < 5) { setFieldError("Describe what you want to find out (at least 5 characters)."); return; }
    setFieldError(null); setBusy(true);
    const notes: string[] = [];
    try {
      const s = await api.createResearch({ research_question: question.trim(), topic: topic.trim() || undefined, research_objective: objective.trim() || undefined });
      const list = parseUrls(urls);
      if (list.length) {
        const r = await api.addSources(s.id, list);
        r.results.filter((x) => x.status !== "added").forEach((x) => notes.push(`${x.url}: ${x.status}${x.reason ? ` (${x.reason})` : ""}`));
      }
      for (const f of files) {
        try { await api.upload(s.id, f); } catch (err) { notes.push(`${f.name}: ${(err as Error).message}`); }
      }
      onCreated(s.id, notes);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const field = "w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-mute/70";
  return (
    <form onSubmit={submit} className="space-y-6" noValidate aria-label="New research">
      {/* Quick Demo Presets */}
      <div className="rounded-lg border border-accent/25 bg-accent/5 p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <span className="text-sm font-semibold text-ink">Demo Scenarios & Sample Inputs</span>
          <span className="text-xs text-mute">(Click to auto-fill)</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEMO_PRESETS.map((p) => {
            const isSelected = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`relative flex flex-col items-start rounded-md border p-2.5 text-left transition-all ${
                  isSelected
                    ? "border-accent bg-accent/15 shadow-sm shadow-accent/20"
                    : "border-line bg-surface/70 hover:border-accent/40 hover:bg-surface"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-medium text-ink flex items-center gap-1.5">
                    <span>{p.icon}</span> {p.label}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-accent shrink-0" aria-hidden />}
                </div>
                <span className="mt-1 text-[11px] text-mute leading-tight">{p.tag}</span>
              </button>
            );
          })}
        </div>
        {activePreset && (
          <p className="mt-2.5 text-xs text-accent/90 flex items-center gap-1.5">
            <span>✓</span> Loaded: {DEMO_PRESETS.find((x) => x.id === activePreset)?.hint}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="q" className="mb-1 block text-sm font-medium">What do you need to find out?</label>
        <textarea id="q" value={question} onChange={(e) => { setQuestion(e.target.value); setActivePreset(null); }} rows={2} className={field} aria-describedby={fieldError ? "q-err" : undefined}
          placeholder="What should I verify before applying for this scholarship?" />
        {fieldError && <p id="q-err" role="alert" className="mt-1 text-sm text-bad">{fieldError}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label htmlFor="t" className="mb-1 block text-sm font-medium">Topic <span className="text-mute">(optional)</span></label>
          <input id="t" value={topic} onChange={(e) => setTopic(e.target.value)} className={field} placeholder="Name of the scholarship, product, policy…" /></div>
        <div><label htmlFor="o" className="mb-1 block text-sm font-medium">Research goal <span className="text-mute">(optional)</span></label>
          <input id="o" value={objective} onChange={(e) => setObjective(e.target.value)} className={field} placeholder="What decision will this inform?" /></div>
      </div>
      <div>
        <label htmlFor="u" className="mb-1 block text-sm font-medium">Source URLs <span className="text-mute">(one per line)</span></label>
        <textarea id="u" value={urls} onChange={(e) => setUrls(e.target.value)} rows={4} className={`${field} font-mono text-sm`} placeholder="https://…" />
        <p className="mt-1 text-xs text-mute">Only public web pages are fetched. Local and private addresses are rejected.</p>
      </div>
      <div>
        <label htmlFor="f" className="mb-1 block text-sm font-medium">Documents <span className="text-mute">(PDF, HTML or text, up to {MAX_MB} MB each)</span></label>
        <input id="f" type="file" multiple accept=".pdf,.html,.htm,.txt,.md" onChange={(e) => onFiles(e.target.files)} className="block w-full text-sm text-mute file:mr-3 file:rounded file:border file:border-line file:bg-elevated file:px-3 file:py-1.5 file:text-ink" />
        {files.length > 0 ? (
          <p className="mt-1 text-xs text-ok flex items-center gap-1">
            <FileText className="h-3 w-3" /> Selected: {files.map((f) => f.name).join(", ")}
          </p>
        ) : (
          <p className="mt-1 text-xs text-mute">
            Ready-to-use sample files available in the local <code className="text-accent">demo-samples/</code> folder.
          </p>
        )}
      </div>
      {error && <ErrorState message={error} />}
      <Button type="submit" size="lg" loading={busy}>Create research workspace</Button>
    </form>
  );
}
