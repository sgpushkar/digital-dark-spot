import type * as T from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

async function req<R>(path: string, init?: RequestInit): Promise<R> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init?.headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "Cannot reach the Digital Dark Spot API. Check that the backend is running.");
  }
  if (res.status === 204) return undefined as R;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.message ?? `Request failed (${res.status})`, body?.error?.details);
  return body as R;
}
const j = (b: unknown): RequestInit => ({ body: JSON.stringify(b) });

export const api = {
  config: () => req<T.PublicConfig>("/api/config"),
  listResearch: () => req<T.Page<T.Session>>("/api/research?limit=50"),
  createResearch: (b: { research_question: string; research_objective?: string; topic?: string }) => req<T.Session>("/api/research", { method: "POST", ...j(b) }),
  createDemo: () => req<T.Session>("/api/demo", { method: "POST" }),
  getResearch: (id: string) => req<T.Session>(`/api/research/${id}`),
  addSources: (id: string, urls: string[]) => req<{ results: { url: string; status: string; reason?: string }[]; added: number }>(`/api/research/${id}/sources`, { method: "POST", ...j({ sources: urls.map((url) => ({ url })) }) }),
  upload: (id: string, file: File) => { const f = new FormData(); f.append("file", file); return req<T.Source>(`/api/research/${id}/documents`, { method: "POST", body: f }); },
  analyze: (id: string) => req<{ status: string }>(`/api/research/${id}/analyze`, { method: "POST" }),
  status: (id: string) => req<T.StatusResp>(`/api/research/${id}/status`),
  sources: (id: string) => req<T.Page<T.Source>>(`/api/research/${id}/sources`),
  claims: (id: string) => req<T.Page<T.Claim>>(`/api/research/${id}/claims?limit=500`),
  coverage: (id: string) => req<{ items: T.CoverageItem[] }>(`/api/research/${id}/coverage`),
  findings: (id: string) => req<T.Page<T.Finding>>(`/api/research/${id}/findings?limit=500`),
  contradictions: (id: string) => req<{ items: T.ConflictItem[]; examined_but_not_conflicts: T.NonConflict[] }>(`/api/research/${id}/contradictions`),
  patchFinding: (fid: string, b: { verification_status?: string; user_note?: string }) => req<T.Finding>(`/api/findings/${fid}`, { method: "PATCH", ...j(b) }),
  checklist: (id: string) => req<{ items: T.Task[] }>(`/api/research/${id}/checklist`),
  patchTask: (tid: string, b: { status?: string; notes?: string }) => req<T.Task>(`/api/checklist/${tid}`, { method: "PATCH", ...j(b) }),
  report: (id: string) => req<T.Report>(`/api/research/${id}/report`),
  evidence: (id: string, ref: string) => req<T.Evidence>(`/api/research/${id}/evidence/${ref}`),
  graph: (id: string) => req<T.GraphData>(`/api/research/${id}/graph`),
  search: (id: string, q: string) => req<{ items: T.SearchHit[]; embedder: string; semantic_embeddings: boolean }>(`/api/research/${id}/search?q=${encodeURIComponent(q)}`),
};

export const wsUrl = (id: string) => API_URL.replace(/^http/, "ws") + `/api/research/${id}/events`;
