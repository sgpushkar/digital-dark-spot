import Link from "next/link";
import { LandingExample } from "@/components/LandingExample";
import { StartDemoButton } from "@/components/StartDemoButton";

const STEPS = [
  ["Collect", "Add pages and documents, or paste URLs. Private and local addresses are refused."],
  ["Extract", "Every claim is stored with the exact passage it came from."],
  ["Compare", "Dates, amounts and numbers are compared in code. Scope and cycle are checked before anything is called a conflict."],
  ["Verify", "Findings that cannot point to evidence are labelled as inference or uncertainty, then turned into a checklist you complete."],
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid items-center gap-10 py-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h1 className="text-4xl leading-tight md:text-5xl">Find what the information doesn’t tell you.</h1>
          <p className="prose-line mt-5 text-lg text-mute">Research is more than collecting answers. Discover missing evidence, conflicting claims, outdated information, and the questions worth asking next.</p>
          <div className="mt-8 flex flex-wrap items-start gap-3">
            <Link href="/research" className="inline-flex h-12 items-center rounded-md bg-accent px-6 text-base font-medium text-bg hover:bg-accent/90">Start research</Link>
            <StartDemoButton />
          </div>
        </div>
        <LandingExample />
      </section>

      <section className="grid gap-8 border-t border-line py-14 md:grid-cols-2">
        <div>
          <h2 className="text-2xl">Evidence first</h2>
          <p className="prose-line mt-3 text-mute">Search tools tell you what exists. This one reports what the sources you gave it actually establish, what disagrees, what looks out of date, and what is not there. When something is missing, it says “not found in the sources reviewed,” never “does not exist.”</p>
        </div>
        <ul className="space-y-3 text-sm">
          {[["Verified", "Extracted claims whose quotes are checked against the source text."], ["Inferred", "Gaps and priorities derived from evidence, with the reasoning shown."], ["Uncertain", "Anything the engine could not support, kept visible instead of smoothed over."]].map(([t, d]) => (
            <li key={t} className="rounded-lg border border-line bg-surface p-4"><span className="font-medium">{t}</span><span className="text-mute"> · {d}</span></li>))}
        </ul>
      </section>

      <section className="border-t border-line py-14">
        <h2 className="text-2xl">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-lg border border-line bg-surface p-4"><p className="text-sm text-mute">Step {i + 1}</p><p className="mt-1 font-serif text-lg">{t}</p><p className="mt-2 text-sm text-mute">{d}</p></li>))}
        </ol>
      </section>

      <footer className="border-t border-line py-8 text-sm text-mute">Built for Shinchan Online Hackathon 2026. The demo workspace uses fictional sources and is labelled as demonstration data wherever it appears.</footer>
    </div>
  );
}
