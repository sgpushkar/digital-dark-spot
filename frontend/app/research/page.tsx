"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { Badge, Button, EmptyState, ErrorState, Panel, Spinner } from "@/components/ui/primitives";
import { ResearchForm } from "@/components/ResearchForm";
import { fmtDate } from "@/lib/utils";
import { ArrowRight, BookOpen, Clock, FolderGit2 } from "lucide-react";

export default function ResearchHome() {
  const router = useRouter();
  const list = useLoad(() => api.listResearch(), []);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState<string | null>(null);

  const openDemo = async () => {
    setDemoBusy(true);
    setDemoErr(null);
    try {
      const s = await api.createDemo();
      router.push(`/research/${s.id}`);
    } catch (e) {
      setDemoErr((e as Error).message);
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 py-10 lg:grid-cols-[1.25fr_1fr]">
      <section className="space-y-6">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-mute block mb-1">
            New Investigation
          </span>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-heading">
            Start a research workspace
          </h1>
          <p className="prose-line mt-2 text-mute text-base leading-relaxed">
            Specify your research inquiry, attach documents or URLs, and allow the evidence engine to reveal corroborated claims, conflicting points, and silent omissions.
          </p>
        </div>
        <div className="pt-2">
          <ResearchForm
            onCreated={(id, notes) =>
              router.push(`/research/${id}${notes.length ? `?notes=${encodeURIComponent(notes.join("|"))}` : ""}`)
            }
          />
        </div>
      </section>

      <aside className="space-y-8">
        <Panel className="p-6 border-line bg-surface shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-mono text-xs uppercase tracking-wider text-mute">Interactive Walkthrough</span>
          </div>
          <h2 className="font-heading text-xl font-bold text-heading">Try the demonstration</h2>
          <p className="mt-2 text-sm text-mute leading-relaxed">
            A fictional scholarship with four sample sources: a conflicting deadline, a previous-year page, and a missing renewal policy. It runs through the identical engine pipeline as production investigations.
          </p>
          <Button
            className="mt-5 w-full sm:w-auto font-heading font-semibold"
            variant="secondary"
            loading={demoBusy}
            onClick={openDemo}
          >
            <span>Open Demo Workspace</span>
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
          {demoErr && <div className="mt-3"><ErrorState message={demoErr} /></div>}
        </Panel>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 text-mute" />
              <h2 className="font-heading text-lg font-bold text-heading">Your workspaces</h2>
            </div>
            {list.data?.items && (
              <span className="font-mono text-xs text-mute">{list.data.items.length} sessions</span>
            )}
          </div>

          {list.loading ? (
            <Spinner label="Loading workspaces" />
          ) : list.error ? (
            <ErrorState message={list.error} onRetry={list.reload} />
          ) : !list.data || list.data.items.length === 0 ? (
            <EmptyState title="No research yet">Create one with the form, or open the demonstration.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {list.data.items.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/research/${s.id}`}
                    className="group block rounded-xl border border-line bg-surface p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-heading font-bold text-base text-heading group-hover:text-primary transition-colors line-clamp-1">
                        {s.title}
                      </span>
                      {s.is_demo && (
                        <span className="rounded bg-warning/15 border border-warning/30 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-heading shrink-0">
                          Demo
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-mute font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDate(s.created_at.slice(0, 10))}
                      </span>
                      <span>·</span>
                      <span className="uppercase text-[11px] font-medium tracking-wider text-heading/80">
                        {s.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
