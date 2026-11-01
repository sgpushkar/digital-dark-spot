"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, wsUrl } from "./api";
import type { PipelineEvent } from "./types";

export interface Loadable<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => { if (live) setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** Live pipeline events from the backend WebSocket. Reconnects with backoff; no fake progress is ever generated. */
export function usePipelineEvents(id: string, enabled: boolean) {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const retry = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null, timer: ReturnType<typeof setTimeout>, closed = false;
    const open = () => {
      ws = new WebSocket(wsUrl(id));
      ws.onopen = () => { setConnected(true); retry.current = 0; };
      ws.onmessage = (m) => { try { setEvents((e) => [...e, JSON.parse(m.data)]); } catch { /* ignore malformed frame */ } };
      ws.onclose = () => { setConnected(false); if (!closed) timer = setTimeout(open, Math.min(1000 * 2 ** retry.current++, 8000)); };
    };
    open();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [id, enabled]);
  return { events, connected, reset: () => setEvents([]) };
}
