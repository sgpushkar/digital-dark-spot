import type { Metadata } from "next";
import Link from "next/link";
import { Manrope, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Digital Dark Spot: find what the information doesn't tell you",
  description: "Evidence-first research: missing information, conflicting claims, outdated sources, and what to verify next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen bg-bg text-ink font-sans antialiased selection:bg-accent/40 selection:text-primary">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-accent font-mono text-xs">Skip to content</a>
        <header className="border-b border-line bg-surface/80 backdrop-blur-md sticky top-0 z-40 print:hidden">
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Primary">
            <Link href="/" className="group flex items-center gap-2.5 font-heading font-extrabold tracking-tight text-lg text-heading">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-accent text-xs font-mono font-bold shadow-sm transition-transform group-hover:scale-105">
                •
              </span>
              <span>Digital Dark Spot</span>
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/research" className="text-mute transition-colors hover:text-heading">Workspaces</Link>
              <Link href="/research" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-accent shadow-sm transition-all hover:brightness-110 active:translate-y-px">
                New Research
              </Link>
            </div>
          </nav>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
