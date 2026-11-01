import Link from "next/link";
import { LandingExample } from "@/components/LandingExample";
import { StartDemoButton } from "@/components/StartDemoButton";
import { ArrowRight, CheckCircle2, Search, Sliders, ShieldCheck, Compass } from "lucide-react";

const STEPS = [
  {
    num: "01",
    name: "Collect",
    desc: "Ingest PDFs, web pages, and raw documents. Unreachable, private, and SSRF-prone addresses are safely filtered.",
  },
  {
    num: "02",
    name: "Extract",
    desc: "Every factual claim is isolated with exact provenance, verbatim character quotes, and temporal validity markers.",
  },
  {
    num: "03",
    name: "Compare",
    desc: "Deterministic code reconciles dates, numbers, and scope discrepancies before any issue is declared a contradiction.",
  },
  {
    num: "04",
    name: "Verify",
    desc: "Dark spots and missing parameters become actionable verification checklists, avoiding simulated speculation.",
  },
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero Section */}
      <section className="grid items-center gap-12 py-16 lg:py-24 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-mono font-medium text-heading shadow-xs">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span>Autonomous Evidence Intelligence</span>
          </div>
          
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-heading leading-[1.12]">
            Find what the information <span className="underline decoration-accent decoration-wavy decoration-2">doesn’t</span> tell you.
          </h1>
          
          <p className="prose-line text-base sm:text-lg text-mute font-body leading-relaxed">
            Standard search answers what exists. Parallax - Digital Dark Spot reveals the invisible gaps: conflicting deadlines, obsolete versions, omitted renewal terms, and what needs immediate verification.
          </p>
          
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/research"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm sm:text-base font-bold text-accent shadow-sm transition-all hover:brightness-110 active:translate-y-px"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <StartDemoButton />
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-line/80 pt-6 text-xs text-mute font-mono">
            <div>
              <span className="block font-bold text-heading text-sm">Deterministic</span>
              <span>Code-checked numbers</span>
            </div>
            <div>
              <span className="block font-bold text-heading text-sm">Verbatim</span>
              <span>Character-span quotes</span>
            </div>
            <div>
              <span className="block font-bold text-heading text-sm">Auditable</span>
              <span>No hallucinated claims</span>
            </div>
          </div>
        </div>

        <div className="w-full">
          <LandingExample />
        </div>
      </section>

      {/* Core Tenets */}
      <section className="grid gap-10 border-t border-line py-16 md:grid-cols-2">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-mute">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Rigorous Evidence Principles</span>
          </div>
          <h2 className="font-heading text-3xl font-bold tracking-tight text-heading">
            Evidence first, assumptions never.
          </h2>
          <p className="prose-line text-mute text-base leading-relaxed">
            Conventional generative tools smooth over missing data with pleasant plausible guesses. Parallax - Digital Dark Spot treats omissions as primary findings. When a clause is missing, it explicitly marks it as “not found in the sources reviewed” rather than making dangerous assumptions.
          </p>
        </div>

        <ul className="space-y-3.5">
          {[
            {
              title: "Verified",
              tag: "Empirical",
              color: "bg-ok/15 text-ok border-ok/30",
              desc: "Extracted claims whose quotes are strictly reconciled against the original source text character by character.",
            },
            {
              title: "Inferred",
              tag: "Deductive",
              color: "bg-primary/10 text-primary border-primary/20",
              desc: "Identified knowledge gaps, coverage scores, and prioritized checklists derived from facts with full reasoning shown.",
            },
            {
              title: "Uncertain",
              tag: "Auditable",
              color: "bg-warning/20 text-warning border-warning/30",
              desc: "Unresolved claims or ambiguous clauses kept deliberately visible in your workspace instead of being glossed over.",
            },
          ].map((item) => (
            <li key={item.title} className="rounded-xl border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-heading font-bold text-base text-heading">{item.title}</span>
                <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold border ${item.color}`}>
                  {item.tag}
                </span>
              </div>
              <p className="mt-2 text-sm text-mute leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 4-Step Methodology */}
      <section className="border-t border-line py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-mute">
              <Compass className="h-4 w-4 text-primary" />
              <span>Inspection Architecture</span>
            </div>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-heading mt-1">
              Deterministic 4-Step Pipeline
            </h2>
          </div>
          <p className="text-sm text-mute font-mono">
            Zero speculation · Full provenance
          </p>
        </div>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.name} className="relative rounded-xl border border-line bg-surface p-6 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-primary bg-accent px-2 py-0.5 rounded">
                  {s.num}
                </span>
                <span className="text-[11px] font-mono text-mute">Stage</span>
              </div>
              <h3 className="mt-4 font-heading text-xl font-bold text-heading">{s.name}</h3>
              <p className="mt-2 text-sm text-mute leading-relaxed">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Footer */}
      <footer className="border-t border-line py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-mute font-mono">
        <div>
          Built for Shinchan Online Hackathon 2026. Demonstration workspaces use fictional sources labelled clearly throughout.
        </div>
        <div className="flex items-center gap-4">
          <Link href="/research" className="hover:text-heading underline underline-offset-4">Workspaces</Link>
          <span>·</span>
          <span>Light Theme Editorial Edition</span>
        </div>
      </footer>
    </div>
  );
}
