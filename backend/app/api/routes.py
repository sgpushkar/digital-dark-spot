from __future__ import annotations

import asyncio
import json
import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import FindingPatch, ResearchCreate, SourcesAdd, TaskPatch
from app.db import models as M
from app.db.base import utcnow
from app.db.session import get_db
from app.demo.fixtures import DEMO_LABEL, DEMO_SOURCES
from app.ingestion.types import ExtractionError
from app.retrieval.hybrid import IndexedChunk, hybrid_search
from app.services.demo import create_demo_session
from app.services.ingest import UploadError, add_upload, add_url_sources
from app.services.pipeline import STAGES, run_analysis

router = APIRouter(prefix="/api")
_tasks: set[asyncio.Task] = set()


def ctx_of(request_or_ws):
    return request_or_ws.app.state.ctx


def valid_id(value: str, what: str = "Resource") -> str:
    """Malformed ids are a 404, not a database error (PostgreSQL rejects non-UUID input outright)."""
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(404, f"{what} not found") from None


async def get_session_or_404(db: AsyncSession, sid: str) -> M.ResearchSession:
    s = await db.get(M.ResearchSession, valid_id(sid, "Research session"))
    if s is None:
        raise HTTPException(404, "Research session not found")
    return s


def page(items: list, total: int, limit: int, offset: int) -> dict:
    return {"items": items, "total": total, "limit": limit, "offset": offset}


# ---- serializers ---------------------------------------------------------------------------
def ser_session(s: M.ResearchSession) -> dict:
    return {"id": s.id, "title": s.title, "research_question": s.research_question, "research_objective": s.research_objective,
            "topic": s.topic, "status": s.status, "is_demo": s.is_demo, "as_of_date": s.as_of_date.isoformat() if s.as_of_date else None,
            "created_at": s.created_at.isoformat(), "updated_at": s.updated_at.isoformat()}


def ser_source(s: M.Source) -> dict:
    scheme = urlparse(s.url).scheme
    link = s.url if scheme in ("http", "https") else (f"/api/demo/fixtures/{s.url.rsplit('/', 1)[-1]}" if scheme == "demo" else None)
    extra = s.extra or {}
    return {"id": s.id, "ref": s.ref, "url": s.url, "link": link, "domain": s.domain, "title": s.title, "source_type": s.source_type,
            "publication_date": s.publication_date.isoformat() if s.publication_date else None,
            "modified_date": s.modified_date.isoformat() if s.modified_date else None,
            "retrieved_at": s.retrieved_at.isoformat() if s.retrieved_at else None, "content_hash": s.content_hash,
            "extraction_status": s.extraction_status, "error_message": s.error_message, "date_origins": extra.get("date_origins", {}),
            "extractor": extra.get("extractor"), "warnings": extra.get("warnings", []), "freshness": extra.get("freshness"),
            "injection_markers": extra.get("injection_markers", []), "is_demo": bool(extra.get("demo"))}


def ser_claim(c: M.Claim, source_ref: str | None = None) -> dict:
    return {"id": c.id, "ref": c.ref, "source_ref": source_ref, "subject": c.subject, "predicate": c.predicate, "object": c.object_value,
            "category": c.category, "original_text": c.original_text, "evidence_quote": c.evidence_quote,
            "evidence_location": c.evidence_location, "confidence": c.confidence, "method": c.method,
            "quote_verified": c.quote_verified, "qualifiers": c.qualifiers}


def ser_finding(f: M.Finding) -> dict:
    return {"id": f.id, "ref": f.ref, "finding_type": f.finding_type, "title": f.title, "description": f.description, "severity": f.severity,
            "confidence": f.confidence, "evidence_references": f.evidence_references, "epistemic_status": f.epistemic_status,
            "verification_status": f.verification_status, "verification_issues": f.verification_issues, "reasoning": f.reasoning,
            "user_note": f.user_note}


def ser_task(t: M.VerificationTask, finding_ref: str | None) -> dict:
    return {"id": t.id, "title": t.title, "reason": t.reason, "priority": t.priority, "priority_reasoning": t.priority_reasoning,
            "recommended_source_type": t.recommended_source_type, "suggested_question": t.suggested_question, "status": t.status,
            "notes": t.notes, "finding_ref": finding_ref, "completed_at": t.completed_at.isoformat() if t.completed_at else None}


async def source_ref_map(db: AsyncSession, sid: str) -> dict[str, M.Source]:
    return {s.id: s for s in (await db.execute(select(M.Source).where(M.Source.research_session_id == sid))).scalars()}


# ---- health / config -----------------------------------------------------------------------
@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/config")
async def public_config(request: Request):
    c = ctx_of(request)
    return {"llm_configured": c.llm is not None, "llm_provider": c.llm.provider if c.llm else None,
            "embedder": c.embedder.name, "semantic_embeddings": c.embedder.semantic,
            "extraction_mode": "llm" if c.llm else "rule_based",
            "upload_max_bytes": c.settings.upload_max_bytes, "demo_label": DEMO_LABEL}


# ---- sessions ------------------------------------------------------------------------------
@router.post("/research", status_code=201)
async def create_research(body: ResearchCreate, db: AsyncSession = Depends(get_db)):
    s = M.ResearchSession(title=(body.title or body.research_question)[:300], research_question=body.research_question.strip(),
                          research_objective=body.research_objective, topic=body.topic, as_of_date=body.as_of_date, status="draft")
    db.add(s)
    await db.commit()
    return ser_session(s)


@router.get("/research")
async def list_research(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count()).select_from(M.ResearchSession))).scalar_one()
    rows = (await db.execute(select(M.ResearchSession).order_by(M.ResearchSession.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return page([ser_session(r) for r in rows], total, limit, offset)


@router.get("/research/{sid}")
async def get_research(sid: str, db: AsyncSession = Depends(get_db)):
    s = await get_session_or_404(db, sid)
    counts = {}
    for name, model in (("sources", M.Source), ("claims", M.Claim), ("findings", M.Finding), ("tasks", M.VerificationTask)):
        counts[name] = (await db.execute(select(func.count()).select_from(model).where(model.research_session_id == sid))).scalar_one()
    return {**ser_session(s), "counts": counts}


@router.delete("/research/{sid}", status_code=204)
async def delete_research(sid: str, db: AsyncSession = Depends(get_db)):
    s = await get_session_or_404(db, sid)
    await db.delete(s)
    await db.commit()


# ---- sources -------------------------------------------------------------------------------
@router.post("/research/{sid}/sources", status_code=201)
async def add_sources(sid: str, body: SourcesAdd, request: Request, db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    c = ctx_of(request)
    results = await add_url_sources(db, sid, [i.model_dump() for i in body.sources], c.settings, resolver=c.resolver)
    return {"results": results, "added": sum(r["status"] == "added" for r in results)}


@router.post("/research/{sid}/documents", status_code=201)
async def upload_document(sid: str, request: Request, file: UploadFile = File(...), source_type: str | None = Form(None), db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    c = ctx_of(request)
    data = await file.read(c.settings.upload_max_bytes + 1)
    try:
        src = await add_upload(db, sid, file.filename or "upload", data, c.settings, source_type)
    except UploadError as exc:
        status = 413 if "exceeds" in str(exc) else 422
        raise HTTPException(status, str(exc)) from exc
    except ExtractionError as exc:
        raise HTTPException(422, f"Could not extract text: {exc}") from exc
    return ser_source(src)


@router.get("/research/{sid}/sources")
async def list_sources(sid: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    q = select(M.Source).where(M.Source.research_session_id == sid)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(M.Source.ref).limit(limit).offset(offset))).scalars().all()
    return page([ser_source(r) for r in rows], total, limit, offset)


# ---- analysis ------------------------------------------------------------------------------
@router.post("/research/{sid}/analyze", status_code=202)
async def analyze(sid: str, request: Request, db: AsyncSession = Depends(get_db)):
    s = await get_session_or_404(db, sid)
    if s.status == "running":
        raise HTTPException(409, "Analysis is already running for this session")
    n = (await db.execute(select(func.count()).select_from(M.Source).where(M.Source.research_session_id == sid))).scalar_one()
    if n == 0:
        raise HTTPException(422, "Add at least one source (URL or document) before analysing")
    s.status = "running"
    await db.commit()
    task = asyncio.create_task(run_analysis(ctx_of(request), sid))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"status": "running", "session_id": sid, "events": f"/api/research/{sid}/events"}


@router.get("/research/{sid}/status")
async def status(sid: str, db: AsyncSession = Depends(get_db)):
    s = await get_session_or_404(db, sid)
    rows = {r.stage: r for r in (await db.execute(select(M.PipelineStage).where(M.PipelineStage.research_session_id == sid))).scalars()}
    stages = [{"stage": n, "label": label, "status": rows[n].status if n in rows else "pending", "detail": rows[n].detail if n in rows else None,
               "duration_ms": rows[n].duration_ms if n in rows else None, "stats": rows[n].stats if n in rows else {}} for n, label in STAGES]
    rep = (await db.execute(select(M.AnalysisReport).where(M.AnalysisReport.research_session_id == sid))).scalars().first()
    return {"session_id": sid, "status": s.status, "stages": stages, "errors": rep.errors if rep else []}


@router.websocket("/research/{sid}/events")
async def events(ws: WebSocket, sid: str):
    await ws.accept()
    bus = ws.app.state.ctx.bus
    q = bus.subscribe(sid)
    try:
        for ev in bus.replay(sid):
            await ws.send_text(json.dumps(ev))
        while True:
            ev = await q.get()
            await ws.send_text(json.dumps(ev))
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        bus.unsubscribe(sid, q)


# ---- analysis outputs ----------------------------------------------------------------------
@router.get("/research/{sid}/claims")
async def list_claims(sid: str, category: str | None = None, source_ref: str | None = None, limit: int = Query(100, ge=1, le=500),
                      offset: int = Query(0, ge=0), db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    srcs = await source_ref_map(db, sid)
    q = select(M.Claim).where(M.Claim.research_session_id == sid)
    if category:
        q = q.where(M.Claim.category == category)
    if source_ref:
        ids = [i for i, s in srcs.items() if s.ref == source_ref]
        q = q.where(M.Claim.source_id.in_(ids))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(M.Claim.ref).limit(limit).offset(offset))).scalars().all()
    return page([ser_claim(c, srcs[c.source_id].ref) for c in rows], total, limit, offset)


@router.get("/research/{sid}/coverage")
async def coverage(sid: str, db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    cats = {c.id: c for c in (await db.execute(select(M.InformationCategory).where(M.InformationCategory.research_session_id == sid))).scalars()}
    res = (await db.execute(select(M.CoverageResult).where(M.CoverageResult.research_session_id == sid))).scalars().all()
    claims = {c.ref: c for c in (await db.execute(select(M.Claim).where(M.Claim.research_session_id == sid))).scalars()}
    srcs = await source_ref_map(db, sid)
    items = []
    for r in res:
        c = cats[r.category_id]
        items.append({"category": c.name, "label": c.label, "description": c.description, "importance": c.importance, "consequence": c.consequence,
                      "expected_information": c.expected_information, "generation_method": c.generation_method, "status": r.status,
                      "explanation": r.explanation, "suggested_question": c.suggested_question, "source_refs": r.source_refs,
                      "claim_refs": r.evidence_claim_ids, "mention_chunk_refs": r.mention_chunk_refs, "reasoning": r.reasoning,
                      "claims": [ser_claim(claims[x], srcs[claims[x].source_id].ref) for x in r.evidence_claim_ids if x in claims]})
    items.sort(key=lambda i: -i["importance"])
    return {"items": items, "total": len(items)}


@router.get("/research/{sid}/findings")
async def list_findings(sid: str, finding_type: str | None = None, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                        db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    q = select(M.Finding).where(M.Finding.research_session_id == sid)
    if finding_type:
        q = q.where(M.Finding.finding_type == finding_type)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(M.Finding.ref).limit(limit).offset(offset))).scalars().all()
    return page([ser_finding(f) for f in rows], total, limit, offset)


@router.get("/research/{sid}/contradictions")
async def contradictions(sid: str, db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    fs = (await db.execute(select(M.Finding).where(M.Finding.research_session_id == sid, M.Finding.finding_type == "contradiction").order_by(M.Finding.ref))).scalars().all()
    claims = {c.ref: c for c in (await db.execute(select(M.Claim).where(M.Claim.research_session_id == sid))).scalars()}
    srcs = await source_ref_map(db, sid)
    by_ref = {s.ref: s for s in srcs.values()}
    out = []
    for f in fs:
        conflict = f.reasoning.get("conflict", {})
        detailed = []
        for ref in f.evidence_references.get("claim_refs", []):
            c = claims.get(ref)
            if c:
                detailed.append({**ser_claim(c, srcs[c.source_id].ref), "source": ser_source(srcs[c.source_id])})
        out.append({**ser_finding(f), "conflict": conflict, "claims": detailed})
    rep = (await db.execute(select(M.AnalysisReport).where(M.AnalysisReport.research_session_id == sid))).scalars().first()
    return {"items": out, "total": len(out), "examined_but_not_conflicts": (rep.report.get("examined_but_not_conflicts", []) if rep else [])}


@router.patch("/findings/{finding_id}")
async def patch_finding(finding_id: str, body: FindingPatch, db: AsyncSession = Depends(get_db)):
    f = await db.get(M.Finding, valid_id(finding_id, "Finding"))
    if f is None:
        raise HTTPException(404, "Finding not found")
    if body.verification_status is not None:
        f.verification_status = body.verification_status  # only the review state changes; source claims are never rewritten
    if body.user_note is not None:
        f.user_note = body.user_note
    await db.commit()
    return ser_finding(f)


@router.get("/research/{sid}/checklist")
async def checklist(sid: str, db: AsyncSession = Depends(get_db)):
    await get_session_or_404(db, sid)
    fref = {f.id: f.ref for f in (await db.execute(select(M.Finding).where(M.Finding.research_session_id == sid))).scalars()}
    rows = (await db.execute(select(M.VerificationTask).where(M.VerificationTask.research_session_id == sid))).scalars().all()
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    rows.sort(key=lambda t: (t.status == "COMPLETED", order[t.priority], t.created_at))
    return {"items": [ser_task(t, fref.get(t.finding_id or "")) for t in rows], "total": len(rows)}


@router.patch("/checklist/{task_id}")
async def patch_task(task_id: str, body: TaskPatch, db: AsyncSession = Depends(get_db)):
    t = await db.get(M.VerificationTask, valid_id(task_id, "Task"))
    if t is None:
        raise HTTPException(404, "Task not found")
    if body.status is not None:
        t.status = body.status
        t.completed_at = utcnow() if body.status == "COMPLETED" else None
    if body.notes is not None:
        t.notes = body.notes
    await db.commit()
    f = await db.get(M.Finding, t.finding_id) if t.finding_id else None
    return ser_task(t, f.ref if f else None)


@router.get("/research/{sid}/report")
async def report(sid: str, db: AsyncSession = Depends(get_db)):
    s = await get_session_or_404(db, sid)
    rep = (await db.execute(select(M.AnalysisReport).where(M.AnalysisReport.research_session_id == sid))).scalars().first()
    if rep is None:
        raise HTTPException(404, "No report yet; run the analysis first")
    live_tasks = await checklist(sid, db)  # checklist state is live, not frozen at report time
    return {**rep.report, "session": ser_session(s), "completeness": rep.score, "verification_checklist": live_tasks["items"], "errors": rep.errors}


@router.get("/research/{sid}/evidence/{claim_ref}")
async def evidence(sid: str, claim_ref: str, db: AsyncSession = Depends(get_db)):
    """Full provenance trail for one claim: source -> passage -> claim -> related claims -> findings -> tasks."""
    await get_session_or_404(db, sid)
    c = (await db.execute(select(M.Claim).where(M.Claim.research_session_id == sid, M.Claim.ref == claim_ref))).scalars().first()
    if c is None:
        raise HTTPException(404, "Claim not found")
    src = await db.get(M.Source, c.source_id)
    chunk = None
    cid = (c.evidence_location or {}).get("chunk_id")
    if cid:
        chunk = (await db.execute(select(M.SourceChunk).where(M.SourceChunk.research_session_id == sid, M.SourceChunk.ref == cid))).scalars().first()
    rels = (await db.execute(select(M.ClaimRelationship).where(M.ClaimRelationship.research_session_id == sid,
            (M.ClaimRelationship.source_claim_id == c.id) | (M.ClaimRelationship.target_claim_id == c.id)))).scalars().all()
    other_ids = {r.target_claim_id if r.source_claim_id == c.id else r.source_claim_id for r in rels}
    others = {o.id: o for o in (await db.execute(select(M.Claim).where(M.Claim.id.in_(other_ids)))).scalars()} if other_ids else {}
    srcs = await source_ref_map(db, sid)
    related = [{"relationship": r.relationship_type, "explanation": r.explanation,
                "claim": ser_claim(others[o], srcs[others[o].source_id].ref)} for r in rels for o in [r.target_claim_id if r.source_claim_id == c.id else r.source_claim_id] if o in others]
    findings = [f for f in (await db.execute(select(M.Finding).where(M.Finding.research_session_id == sid))).scalars() if claim_ref in f.evidence_references.get("claim_refs", [])]
    ftasks = (await db.execute(select(M.VerificationTask).where(M.VerificationTask.finding_id.in_([f.id for f in findings])))).scalars().all() if findings else []
    fref = {f.id: f.ref for f in findings}
    return {"claim": ser_claim(c, src.ref), "source": ser_source(src),
            "passage": {"chunk_ref": cid, "text": chunk.content if chunk else None, "page_number": chunk.page_number if chunk else None,
                        "section_heading": chunk.section_heading if chunk else None},
            "related_claims": related, "findings": [ser_finding(f) for f in findings], "tasks": [ser_task(t, fref.get(t.finding_id or "")) for t in ftasks]}


@router.get("/research/{sid}/graph")
async def graph(sid: str, db: AsyncSession = Depends(get_db)):
    """Evidence graph (nodes+edges) assembled from relational provenance; rendered with React Flow."""
    await get_session_or_404(db, sid)
    srcs = await source_ref_map(db, sid)
    claims = (await db.execute(select(M.Claim).where(M.Claim.research_session_id == sid))).scalars().all()
    findings = (await db.execute(select(M.Finding).where(M.Finding.research_session_id == sid))).scalars().all()
    tasks = (await db.execute(select(M.VerificationTask).where(M.VerificationTask.research_session_id == sid))).scalars().all()
    nodes, edges = [], []
    for s in srcs.values():
        nodes.append({"id": s.ref, "type": "source", "label": s.title or s.ref})
    involved: set[str] = set()
    for f in findings:
        if f.finding_type in ("contradiction", "freshness") or f.evidence_references.get("claim_refs"):
            involved.update(f.evidence_references.get("claim_refs", []))
    for c in claims:
        if c.ref in involved:
            nodes.append({"id": c.ref, "type": "claim", "label": f"{c.category}: {c.object_value}"[:80]})
            edges.append({"source": srcs[c.source_id].ref, "target": c.ref, "type": "SOURCE_SUPPORTS_CLAIM"})
    for f in findings:
        if f.finding_type == "contradiction" or f.evidence_references.get("claim_refs") or f.finding_type == "freshness":
            nodes.append({"id": f.ref, "type": "finding", "label": f.title[:80], "severity": f.severity})
            for cr in f.evidence_references.get("claim_refs", []):
                edges.append({"source": cr, "target": f.ref, "type": "FINDING_REFERENCES_CLAIM"})
            if not f.evidence_references.get("claim_refs"):
                for sr in f.evidence_references.get("source_refs", []):
                    edges.append({"source": sr, "target": f.ref, "type": "FINDING_REFERENCES_SOURCE"})
    fid = {f.id: f.ref for f in findings}
    for i, t in enumerate(tasks):
        if t.finding_id in fid and any(n["id"] == fid[t.finding_id] for n in nodes):
            nodes.append({"id": f"task_{i + 1:03d}", "type": "task", "label": t.title[:80], "priority": t.priority})
            edges.append({"source": fid[t.finding_id], "target": f"task_{i + 1:03d}", "type": "TASK_RESOLVES_FINDING"})
    rels = (await db.execute(select(M.ClaimRelationship).where(M.ClaimRelationship.research_session_id == sid, M.ClaimRelationship.relationship_type == "CLAIM_CONTRADICTS_CLAIM"))).scalars().all()
    by_id = {c.id: c.ref for c in claims}
    for r in rels:
        edges.append({"source": by_id[r.source_claim_id], "target": by_id[r.target_claim_id], "type": "CLAIM_CONTRADICTS_CLAIM"})
    return {"nodes": nodes, "edges": edges}


@router.get("/research/{sid}/search")
async def search(sid: str, request: Request, q: str = Query(min_length=2, max_length=300), top_k: int = Query(8, ge=1, le=30),
                 db: AsyncSession = Depends(get_db)):
    """Hybrid retrieval (BM25 + vector, fused with RRF). Every score returned is a real computed value."""
    await get_session_or_404(db, sid)
    c = ctx_of(request)
    rows = (await db.execute(select(M.SourceChunk, M.Source).join(M.Source, M.Source.id == M.SourceChunk.source_id).where(M.SourceChunk.research_session_id == sid))).all()
    chunks = [IndexedChunk(ch.ref, so.ref, so.url, ch.content, ch.embedding, ch.page_number, ch.section_heading) for ch, so in rows]
    qv = (await c.embedder.embed([q]))[0]
    res = hybrid_search(q, qv, chunks, top_k=top_k, rrf_k=c.settings.rrf_k, max_context_chars=c.settings.max_context_chars)
    return {"query": q, "embedder": c.embedder.name, "semantic_embeddings": c.embedder.semantic, "items": [
        {"chunk_ref": r.chunk.ref, "source_ref": r.chunk.source_ref, "url": r.chunk.url, "page_number": r.chunk.page_number,
         "section_heading": r.chunk.section_heading, "text": r.chunk.content,
         "scores": {"bm25": r.bm25, "vector": r.vector, "rrf": r.rrf}, "ranks": {"bm25": r.bm25_rank, "vector": r.vector_rank},
         "matched_terms": r.matched_terms} for r in res]}


# ---- demo ----------------------------------------------------------------------------------
@router.post("/demo", status_code=201)
async def create_demo(db: AsyncSession = Depends(get_db)):
    s = await create_demo_session(db)
    return {**ser_session(s), "demo_label": DEMO_LABEL}


@router.get("/demo/fixtures/{slug}", response_class=HTMLResponse)
async def fixture(slug: str):
    for f in DEMO_SOURCES:
        if f["slug"] == slug:
            banner = f'<div style="background:#E7AD52;color:#000;padding:8px 12px;font:14px sans-serif">{DEMO_LABEL}</div>'
            return HTMLResponse(banner + f["html"])
    raise HTTPException(404, "Fixture not found")
