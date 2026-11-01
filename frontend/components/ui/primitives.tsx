"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-surface hover:bg-primary/90 shadow-sm border border-primary/20 active:translate-y-px",
        accent: "bg-accent text-primary font-bold hover:brightness-105 shadow-sm border border-primary/10 active:translate-y-px",
        secondary: "bg-surface text-heading border border-line hover:bg-elevated hover:border-mute/50 shadow-xs active:translate-y-px",
        ghost: "text-mute hover:text-heading hover:bg-elevated/80",
        danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20",
      },
      size: { sm: "h-8 px-3 text-xs", md: "h-10 px-4", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { loading?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin text-current" aria-hidden />}
    {children}
  </button>
));
Button.displayName = "Button";

export function Badge({ className, children, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-mono font-medium text-heading", className)} {...p}>{children}</span>;
}

export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface shadow-xs", className)} {...p} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2.5 py-6 text-mute font-mono text-sm"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> {label}…</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-bad/30 bg-bad/5 p-4 shadow-xs">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
      <div className="flex-1"><p className="text-sm font-medium text-heading">{message}</p>
        {onRetry && <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/50 p-8 text-center shadow-xs">
      <p className="font-heading font-bold text-lg text-heading">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-mute">{children}</div>}
    </div>
  );
}

export function DemoBanner({ label }: { label?: string }) {
  return (
    <div role="note" className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-xs sm:text-sm text-heading flex items-center justify-center gap-2">
      <span className="inline-flex items-center rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-heading">DEMO DATA</span>
      <span>{label ?? "Every source here is fictional; nothing below describes a real scholarship."}</span>
    </div>
  );
}
