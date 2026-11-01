"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-bg hover:bg-accent/90",
        secondary: "bg-elevated text-ink border border-line hover:border-mute/60",
        ghost: "text-mute hover:text-ink hover:bg-elevated",
        danger: "bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { loading?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = "Button";

export function Badge({ className, children, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium", className)} {...p}>{children}</span>;
}

export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...p} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2 py-6 text-mute"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-bad/40 bg-bad/10 p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
      <div className="flex-1"><p className="text-sm text-ink">{message}</p>
        {onRetry && <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-8 text-center"><p className="font-serif text-lg">{title}</p>{children && <div className="mx-auto mt-2 max-w-md text-sm text-mute">{children}</div>}</div>;
}

export function DemoBanner({ label }: { label?: string }) {
  return (
    <div role="note" className="border-b border-warn/40 bg-warn/15 px-4 py-2 text-sm text-warn">
      <strong className="font-semibold">Demonstration data.</strong> {label ?? "Every source here is fictional; nothing below describes a real scholarship."}
    </div>
  );
}
