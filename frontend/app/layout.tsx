import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Dark Spot: find what the information doesn't tell you",
  description: "Evidence-first research: missing information, conflicting claims, outdated sources, and what to verify next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-bg">Skip to content</a>
        <header className="border-b border-line print:hidden">
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4" aria-label="Primary">
            <Link href="/" className="font-serif text-lg">Digital Dark Spot</Link>
            <div className="flex items-center gap-5 text-sm text-mute"><Link href="/research" className="hover:text-ink">Research</Link></div>
          </nav>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
