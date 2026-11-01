"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/primitives";

export function StartDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button size="lg" variant="secondary" loading={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { const s = await api.createDemo(); router.push(`/research/${s.id}`); } catch (e) { setErr((e as Error).message); setBusy(false); }
      }}>Open the demo workspace</Button>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
    </>
  );
}
