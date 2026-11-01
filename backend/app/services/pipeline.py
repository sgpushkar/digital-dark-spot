"""LangGraph research orchestrator.

Typed shared state, one node per stage, conditional edges, per-stage persistence and live events.
Failure policy: a failing stage is recorded and surfaced; downstream stages that depend on it are marked
'skipped' with a reason; independent stages keep running. Nothing is ever silently replaced."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Awaitable, Callable, TypedDict

import httpx
from langgraph.graph import END, StateGraph
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.analysis.categories import propose_categories
from app.analysis.checklist import build_checklist
from app.analysis.claims import (
    dedupe_claims, extract_claims_heuristic, extract_claims_llm, infer_subject, verify_quote,
)
from app.analysis.contradictions import detect_contradictions
from app.analysis.coverage import build_gap_findings, compute_coverage
from app.analysis.freshness import assess_freshness, determine_target_period
from app.analysis.scoring import compute_score
from app.analysis.verification import verify_findings
from app.config import Settings
from app.core.security import Resolver, detect_injection_markers
from app.db import models as M
from app.ingestion.fetcher import FetchError, FetchResult, fetch_url
from app.ingestion.html import extract_html
from app.ingestion.pdf import extract_pdf
from app.ingestion.types import ExtractionError
from app.llm.base import LLMOutputError, LLMUnavailable, StructuredLLM
from app.retrieval.embeddings import Embedder
from app.retrieval.hybrid import IndexedChunk
from app.schemas.domain import (
    CategorySpec, ChunkDoc, Claim, Conflict, CoverageItem, FindingDraft, FreshnessAssessment, NonConflict,
    SourceDoc, TaskDraft, VerifiedFinding,
)
from app.services.events import EventBus
from app.services.ingest import persist_document

log = logging.getLogger("dds.pipeline")

STAGES = [
    ("source_collection", "Source collection"),
    ("content_extraction", "Content extraction"),
    ("evidence_indexing", "Evidence indexing"),
    ("research_planning", "Research planning"),
    ("claim_extraction", "Claim extraction"),
    ("freshness_analysis", "Freshness analysis"),
    ("contradiction_analysis", "Contradiction analysis"),
    ("gap_detection", "Gap detection"),
    ("evidence_verification", "Evidence verification"),
    ("checklist_generation", "Checklist generation"),
    ("report_generation", "Report generation"),
]
DEPENDS = {
    "claim_extraction": ["content_extraction"],
    "freshness_analysis": ["content_extraction"],
    "contradiction_analysis": ["claim_extraction", "freshness_analysis"],
    "gap_detection": ["research_planning", "claim_extraction"],
    "evidence_verification": ["gap_detection"],
    "checklist_generation": ["evidence_verification"],
}


@dataclass
class Ctx:
    settings: Settings
    maker: async_sessionmaker[AsyncSession]
    bus: EventBus
    embedder: Embedder
    llm: StructuredLLM | None = None
    resolver: Resolver | None = None
    http_client: httpx.AsyncClient | None = None
    demo_html: dict[str, str] = field(default_factory=dict)  # url -> html for demo fixtures


class State(TypedDict, total=False):
    session_id: str
    question: str
    objective: str | None
    topic: str | None
    as_of: date
    is_demo: bool
    sources: dict[str, SourceDoc]
    chunks: list[ChunkDoc]
    fetched: dict[str, FetchResult]
    categories: list[CategorySpec]
    category_method: str
    subject: str
    claims: list[Claim]
    freshness: dict[str, FreshnessAssessment]
    conflicts: list[Conflict]
    non_conflicts: list[NonConflict]
    coverage: list[CoverageItem]
    findings: list[VerifiedFinding]
    tasks: list[TaskDraft]
    score: dict
    errors: list[dict]
    notes: list[str]
    stage_status: dict[str, str]
    stats: dict[str, Any]
    skip_rest: bool


def _now():
    return datetime.now(timezone.utc)


async def _set_stage(ctx: Ctx, sid: str, stage: str, status: str, *, detail: str | None = None, stats: dict | None = None,
                     started: datetime | None = None, duration_ms: int | None = None) -> None:
    async with ctx.maker() as db:
        row = (await db.execute(select(M.PipelineStage).where(M.PipelineStage.research_session_id == sid, M.PipelineStage.stage == stage))).scalars().first()
        if row is None:
            row = M.PipelineStage(research_session_id=sid, stage=stage)
            db.add(row)
        row.status, row.detail = status, detail
        if started:
            row.started_at = started
        if status in ("completed", "failed", "skipped"):
            row.finished_at, row.duration_ms = _now(), duration_ms
        if stats is not None:
            row.stats = stats
        await db.commit()
    await ctx.bus.publish(sid, {"type": "stage", "stage": stage, "label": dict(STAGES)[stage], "status": status,
                                "detail": detail, "stats": stats or {}, "duration_ms": duration_ms})


def stage(ctx: Ctx, name: str, fn: Callable[[State], Awaitable[tuple[dict, dict]]]):
    """Wraps a stage function returning (state_update, stats). Handles events, timing, dependency skips and errors."""

    async def node(state: State) -> dict:
        sid = state["session_id"]
        status_map = dict(state.get("stage_status", {}))
        blockers = [d for d in DEPENDS.get(name, []) if status_map.get(d) in ("failed", "skipped")]
        if state.get("skip_rest") and name not in ("report_generation",):
            status_map[name] = "skipped"
            await _set_stage(ctx, sid, name, "skipped", detail="No usable sources were available.")
            return {"stage_status": status_map}
        if blockers:
            status_map[name] = "skipped"
            why = f"Skipped because upstream stage(s) did not complete: {', '.join(blockers)}."
            await _set_stage(ctx, sid, name, "skipped", detail=why)
            return {"stage_status": status_map, "notes": state.get("notes", []) + [f"{name}: {why}"]}
        t0, started = time.perf_counter(), _now()
        await _set_stage(ctx, sid, name, "running", started=started)
        try:
            update, stats = await fn(state)
            ms = int((time.perf_counter() - t0) * 1000)
            skipped = stats.pop("_skipped", None)
            status_map[name] = "skipped" if skipped else "completed"
            await _set_stage(ctx, sid, name, status_map[name], detail=skipped, stats=stats, duration_ms=ms)
            out = {**update, "stage_status": status_map, "stats": {**state.get("stats", {}), name: stats}}
            if skipped:
                out["notes"] = state.get("notes", []) + [f"{name}: {skipped}"]
            return out
        except Exception as exc:  # noqa: BLE001 - recorded + surfaced, never swallowed
            ms = int((time.perf_counter() - t0) * 1000)
            log.exception("stage %s failed", name)
            status_map[name] = "failed"
            msg = f"{type(exc).__name__}: {str(exc)[:300]}"
            await _set_stage(ctx, sid, name, "failed", detail=msg, duration_ms=ms)
            return {"stage_status": status_map, "errors": state.get("errors", []) + [{"stage": name, "error": msg}]}

    return node


# ---------------------------------------------------------------------------------------------
def build_graph(ctx: Ctx):
    s = ctx.settings

    async def source_collection(state: State):
        sid, errors = state["session_id"], list(state.get("errors", []))
        fetched: dict[str, FetchResult] = {}
        counts = {"pending_urls": 0, "fetched": 0, "failed": 0, "already_extracted": 0}
        async with ctx.maker() as db:
            sources = (await db.execute(select(M.Source).where(M.Source.research_session_id == sid).order_by(M.Source.ref))).scalars().all()
            for src in sources:
                if src.extraction_status == "done" and src.text:
                    counts["already_extracted"] += 1
                    continue
                counts["pending_urls"] += 1
                if src.url in ctx.demo_html:
                    continue
                try:
                    fetched[src.ref] = await fetch_url(src.url, s, client=ctx.http_client, resolver=ctx.resolver)
                    counts["fetched"] += 1
                except Exception as exc:  # noqa: BLE001
                    counts["failed"] += 1
                    src.extraction_status, src.error_message = "failed", f"{type(exc).__name__}: {str(exc)[:300]}"
                    errors.append({"stage": "source_collection", "source": src.ref, "error": src.error_message})
            await db.commit()
        return {"fetched": fetched, "errors": errors}, counts

    async def content_extraction(state: State):
        sid, errors = state["session_id"], list(state.get("errors", []))
        counts = {"extracted": 0, "failed": 0, "chunks": 0, "injection_markers": 0}
        async with ctx.maker() as db:
            sources = (await db.execute(select(M.Source).where(M.Source.research_session_id == sid).order_by(M.Source.ref))).scalars().all()
            for src in sources:
                if src.extraction_status == "failed" and src.ref not in state.get("fetched", {}):
                    counts["failed"] += 1
                    continue
                if src.extraction_status != "done" or not src.text:
                    try:
                        if src.url in ctx.demo_html:
                            doc = extract_html(ctx.demo_html[src.url])
                        else:
                            fr = state["fetched"][src.ref]
                            if fr.content_type == "application/pdf" or fr.body[:5] == b"%PDF-":
                                doc = extract_pdf(fr.body, backend=s.pdf_backend, max_pages=s.upload_max_pages)
                            elif fr.content_type == "text/plain":
                                from app.ingestion.types import ExtractedDocument
                                doc = ExtractedDocument(title=None, text=fr.body.decode("utf-8", "replace"), extractor="text")
                            else:
                                doc = extract_html(fr.body.decode("utf-8", "replace"), http_last_modified=fr.headers.get("last-modified"))
                        counts["chunks"] += await persist_document(db, src, doc, s)
                        counts["extracted"] += 1
                    except Exception as exc:  # noqa: BLE001 - recorded on the source and surfaced
                        counts["failed"] += 1
                        await db.rollback()
                        src = (await db.execute(select(M.Source).where(M.Source.id == src.id))).scalars().one()
                        src.extraction_status, src.error_message = "failed", f"{type(exc).__name__}: {str(exc)[:300]}"
                        errors.append({"stage": "content_extraction", "source": src.ref, "error": src.error_message})
                        await db.commit()
                        continue
                if detect_injection_markers(src.text or ""):
                    counts["injection_markers"] += 1
                    src.extra = {**(src.extra or {}), "injection_markers": detect_injection_markers(src.text or "")}
            await db.commit()
            ok = (await db.execute(select(M.Source).where(M.Source.research_session_id == sid, M.Source.extraction_status == "done").order_by(M.Source.ref))).scalars().all()
            chunks = (await db.execute(select(M.SourceChunk).where(M.SourceChunk.research_session_id == sid).order_by(M.SourceChunk.source_id, M.SourceChunk.chunk_index))).scalars().all()
            ref_by_id = {x.id: x.ref for x in ok}
            sources_dom = {
                x.ref: SourceDoc(ref=x.ref, url=x.url, domain=x.domain, title=x.title, source_type=x.source_type,
                                 publication_date=x.publication_date, modified_date=x.modified_date, text=x.text or "",
                                 extractor=(x.extra or {}).get("extractor"), date_origins=(x.extra or {}).get("date_origins", {}),
                                 is_demo=bool(state.get("is_demo")))
                for x in ok
            }
            chunks_dom = [ChunkDoc(ref=c.ref, source_ref=ref_by_id[c.source_id], content=c.content, start=c.char_start, end=c.char_end,
                                   page_number=c.page_number, section_heading=c.section_heading) for c in chunks if c.source_id in ref_by_id]
        counts["usable_sources"] = len(sources_dom)
        update: dict = {"sources": sources_dom, "chunks": chunks_dom, "errors": errors}
        if not sources_dom:
            update["skip_rest"] = True
            counts["_skipped"] = None
            errors.append({"stage": "content_extraction", "error": "No source could be extracted; analysis stages were skipped."})
        return update, counts

    async def evidence_indexing(state: State):
        sid = state["session_id"]
        chunks = state.get("chunks", [])
        vectors = await ctx.embedder.embed([c.content for c in chunks]) if chunks else []
        async with ctx.maker() as db:
            rows = {c.ref: c for c in (await db.execute(select(M.SourceChunk).where(M.SourceChunk.research_session_id == sid))).scalars()}
            for c, v in zip(chunks, vectors):
                rows[c.ref].embedding = v
                rows[c.ref].extra = {**(rows[c.ref].extra or {}), "embedder": ctx.embedder.name, "semantic": ctx.embedder.semantic}
            await db.commit()
        return {}, {"chunks_indexed": len(vectors), "embedder": ctx.embedder.name, "semantic_embeddings": ctx.embedder.semantic}

    async def research_planning(state: State):
        sid = state["session_id"]
        cats, method, note = await propose_categories(ctx.llm, state["question"], state.get("objective"))
        titles = " ".join(x.title or "" for x in state["sources"].values())
        subject = infer_subject(state["question"], state.get("objective"), titles, state.get("topic"))
        async with ctx.maker() as db:
            await db.execute(delete(M.InformationCategory).where(M.InformationCategory.research_session_id == sid))
            for c in cats:
                db.add(M.InformationCategory(research_session_id=sid, name=c.name, label=c.label, description=c.description,
                                             importance=c.importance, consequence=c.consequence, expected_information=c.expected_information,
                                             keywords=c.keywords, value_type=c.value_type, suggested_question=c.suggested_question,
                                             generation_method=c.generation_method))
            await db.commit()
        notes = state.get("notes", []) + ([f"research_planning: {note}"] if note else [])
        return {"categories": cats, "category_method": method, "subject": subject, "notes": notes}, {"categories": len(cats), "method": method, "subject": subject}

    async def claim_extraction(state: State):
        sid = state["session_id"]
        all_drafts, per_source, errors = [], {}, list(state.get("errors", []))
        used_llm = ctx.llm is not None
        for ref, src in state["sources"].items():
            chunks = [c for c in state["chunks"] if c.source_ref == ref]
            try:
                if used_llm:
                    drafts, st = await extract_claims_llm(ctx.llm, src, chunks, state["categories"], state["subject"])
                else:
                    drafts, st = extract_claims_heuristic(src, chunks, state["categories"], state["subject"])
            except (LLMOutputError, LLMUnavailable) as exc:
                errors.append({"stage": "claim_extraction", "source": ref, "error": f"LLM extraction failed ({type(exc).__name__}); used rule-based extractor for this source."})
                drafts, st = extract_claims_heuristic(src, chunks, state["categories"], state["subject"])
                st["fallback"] = "heuristic"
            per_source[ref] = st
            all_drafts.extend(drafts)
        all_drafts = dedupe_claims(all_drafts)
        claims: list[Claim] = []
        for i, d in enumerate(all_drafts, start=1):
            claims.append(Claim(**d.model_dump(), ref=f"claim_{i:03d}", quote_verified=verify_quote(d, state["sources"][d.source_ref].text)))
        async with ctx.maker() as db:
            await db.execute(delete(M.Claim).where(M.Claim.research_session_id == sid))
            src_ids = {x.ref: x.id for x in (await db.execute(select(M.Source).where(M.Source.research_session_id == sid))).scalars()}
            for c in claims:
                db.add(M.Claim(research_session_id=sid, source_id=src_ids[c.source_ref], ref=c.ref, subject=c.subject, predicate=c.predicate,
                               object_value=c.object, category=c.category, original_text=c.original_text, evidence_quote=c.evidence_quote,
                               evidence_location=c.evidence_location.model_dump(), confidence=c.confidence, method=c.method,
                               quote_verified=c.quote_verified, qualifiers=c.qualifiers))
            await db.commit()
        stats = {"claims": len(claims), "quote_verified": sum(c.quote_verified for c in claims), "extractor": "llm" if used_llm else "heuristic", "per_source": per_source}
        return {"claims": claims, "errors": errors}, stats

    async def freshness_analysis(state: State):
        sid = state["session_id"]
        target, origin = determine_target_period(state["question"], state.get("objective"), state["as_of"])
        res = {ref: assess_freshness(src, as_of=state["as_of"], target_period=target, target_origin=origin, max_age_days=s.freshness_max_age_days)
               for ref, src in state["sources"].items()}
        async with ctx.maker() as db:
            for row in (await db.execute(select(M.Source).where(M.Source.research_session_id == sid))).scalars():
                if row.ref in res:
                    row.extra = {**(row.extra or {}), "freshness": res[row.ref].model_dump()}
            await db.commit()
        counts: dict[str, int] = {}
        for a in res.values():
            counts[a.label] = counts.get(a.label, 0) + 1
        return {"freshness": res}, {"labels": counts, "target_period": target, "target_origin": origin}

    async def contradiction_analysis(state: State):
        sid = state["session_id"]
        if len(state["sources"]) < 2:
            return {"conflicts": [], "non_conflicts": []}, {"_skipped": "Fewer than two usable sources; cross-source comparison is not possible."}
        conflicts, non_conf, st = await detect_contradictions(state["claims"], state["categories"], state["sources"], state["freshness"], llm=ctx.llm)
        async with ctx.maker() as db:
            await db.execute(delete(M.ClaimRelationship).where(M.ClaimRelationship.research_session_id == sid))
            ids = {c.ref: c.id for c in (await db.execute(select(M.Claim).where(M.Claim.research_session_id == sid))).scalars()}
            for cf in conflicts:
                refs = [x.claim_ref for x in cf.claims]
                for i in range(len(refs)):
                    for j in range(i + 1, len(refs)):
                        db.add(M.ClaimRelationship(research_session_id=sid, source_claim_id=ids[refs[i]], target_claim_id=ids[refs[j]],
                                                   relationship_type="CLAIM_CONTRADICTS_CLAIM", explanation=cf.explanation))
            for nc in non_conf:
                if nc.kind == "corroboration":
                    db.add(M.ClaimRelationship(research_session_id=sid, source_claim_id=ids[nc.claim_refs[0]], target_claim_id=ids[nc.claim_refs[1]],
                                               relationship_type="CLAIM_CORROBORATES_CLAIM", explanation=nc.explanation))
            await db.commit()
        return {"conflicts": conflicts, "non_conflicts": non_conf}, {"conflicts": len(conflicts), "non_conflicts_examined": len(non_conf), **st}

    async def gap_detection(state: State):
        sid = state["session_id"]
        idx = []
        async with ctx.maker() as db:
            rows = (await db.execute(select(M.SourceChunk, M.Source).join(M.Source, M.Source.id == M.SourceChunk.source_id).where(M.SourceChunk.research_session_id == sid))).all()
            for ch, so in rows:
                idx.append(IndexedChunk(ch.ref, so.ref, so.url, ch.content, ch.embedding, ch.page_number, ch.section_heading))
        items = compute_coverage(state["categories"], state["claims"], state["sources"], state.get("freshness", {}), state.get("conflicts", []), idx)
        async with ctx.maker() as db:
            await db.execute(delete(M.CoverageResult).where(M.CoverageResult.research_session_id == sid))
            cat_ids = {c.name: c.id for c in (await db.execute(select(M.InformationCategory).where(M.InformationCategory.research_session_id == sid))).scalars()}
            for it in items:
                db.add(M.CoverageResult(research_session_id=sid, category_id=cat_ids[it.category], status=it.status, explanation=it.explanation,
                                        evidence_claim_ids=it.claim_refs, source_refs=it.source_refs, mention_chunk_refs=it.mention_chunk_refs, reasoning=it.reasoning))
            await db.commit()
        counts: dict[str, int] = {}
        for it in items:
            counts[it.status] = counts.get(it.status, 0) + 1
        return {"coverage": items}, {"statuses": counts}

    async def evidence_verification(state: State):
        sid = state["session_id"]
        cats = {c.name: c for c in state["categories"]}
        drafts: list[FindingDraft] = build_gap_findings(state["coverage"], cats)
        for cf in state.get("conflicts", []):
            cat = cats.get(cf.predicate)
            label = cat.label if cat else cf.predicate.replace("_", " ")
            drafts.append(FindingDraft(
                finding_type="contradiction", title=f"Possible conflict: {label.lower()} differs between sources",
                description=cf.explanation, severity=cf.severity, confidence=0.9 if cf.method == "deterministic" else 0.6,
                claim_refs=[x.claim_ref for x in cf.claims], source_refs=sorted({x.source_ref for x in cf.claims}), related_key=cf.conflict_id,
                reasoning={"conflict": cf.model_dump(), "label": label, "suggested_question": cat.suggested_question if cat else None}))
        sev = {"EXPIRED": "high", "POTENTIALLY_OUTDATED": "medium", "UNDATED": "low", "DATE_UNAVAILABLE": "low"}
        for ref, a in state.get("freshness", {}).items():
            if a.label in sev:
                title = {"EXPIRED": "Source contains only expired dates", "POTENTIALLY_OUTDATED": "Source may be outdated",
                         "UNDATED": "Source is undated", "DATE_UNAVAILABLE": "Freshness cannot be established"}[a.label]
                drafts.append(FindingDraft(finding_type="freshness", title=f"{title}: {state['sources'][ref].title or ref}", description=" ".join(a.reasons),
                                           severity=sev[a.label], confidence=0.85 if a.label in ("EXPIRED", "POTENTIALLY_OUTDATED") else 0.7,  # type: ignore[arg-type]
                                           source_refs=[ref], related_key=ref, reasoning={"freshness": a.model_dump()}))
        corroborated = {r for nc in state.get("non_conflicts", []) if nc.kind == "corroboration" for r in nc.claim_refs}
        for c in state["claims"]:
            cat = cats.get(c.category)
            if cat and cat.importance >= 4 and c.confidence < 0.6 and c.ref not in corroborated:
                drafts.append(FindingDraft(finding_type="weak_evidence", title=f"Weakly supported claim about {cat.label.lower()}",
                                           description=f"Claim {c.ref} has low extraction confidence ({c.confidence}) and no corroborating source.",
                                           severity="low", confidence=0.5, claim_refs=[c.ref], source_refs=[c.source_ref], related_key=c.ref))
        claims = {c.ref: c for c in state["claims"]}
        findings = verify_findings(drafts, claims, state["sources"], len(state["sources"]))
        async with ctx.maker() as db:
            await db.execute(delete(M.Finding).where(M.Finding.research_session_id == sid))
            for f in findings:
                db.add(M.Finding(research_session_id=sid, ref=f.ref, finding_type=f.finding_type, title=f.title, description=f.description,
                                 severity=f.severity, confidence=f.confidence,
                                 evidence_references={"claim_refs": f.claim_refs, "source_refs": f.source_refs, "chunk_refs": f.chunk_refs},
                                 epistemic_status=f.epistemic_status, reasoning={**f.reasoning, "related_key": f.related_key}, verification_issues=f.verification_issues))
            await db.commit()
        by: dict[str, int] = {}
        for f in findings:
            by[f.epistemic_status] = by.get(f.epistemic_status, 0) + 1
        return {"findings": findings}, {"findings": len(findings), "epistemic_status": by, "with_issues": sum(1 for f in findings if f.verification_issues)}

    async def checklist_generation(state: State):
        sid = state["session_id"]
        cats = {c.name: c for c in state["categories"]}
        tasks = build_checklist(state["findings"], cats)
        async with ctx.maker() as db:
            await db.execute(delete(M.VerificationTask).where(M.VerificationTask.research_session_id == sid))
            fid = {f.ref: f.id for f in (await db.execute(select(M.Finding).where(M.Finding.research_session_id == sid))).scalars()}
            for t in tasks:
                db.add(M.VerificationTask(research_session_id=sid, finding_id=fid.get(t.finding_ref or ""), title=t.title, reason=t.reason,
                                          priority=t.priority, priority_reasoning=t.priority_reasoning,
                                          recommended_source_type=t.recommended_source_type, suggested_question=t.suggested_question, status="PENDING"))
            await db.commit()
        return {"tasks": tasks}, {"tasks": len(tasks)}

    async def report_generation(state: State):
        from app.services.report import build_report

        sid = state["session_id"]
        for name, _ in STAGES:  # stages bypassed by the no-usable-sources route are reported as skipped, never left 'pending'
            if name not in state.get("stage_status", {}) and name != "report_generation":
                await _set_stage(ctx, sid, name, "skipped", detail="No usable sources were available.")
        score = {}
        if state.get("coverage") is not None and state.get("categories"):
            score = compute_score(s.score_weights, state["categories"], state.get("coverage", []), state.get("claims", []), state.get("sources", {}),
                                  state.get("freshness", {}), state.get("conflicts", []))
        report = build_report(state, score, ctx)
        async with ctx.maker() as db:
            row = (await db.execute(select(M.AnalysisReport).where(M.AnalysisReport.research_session_id == sid))).scalars().first()
            if row is None:
                row = M.AnalysisReport(research_session_id=sid)
                db.add(row)
            row.score, row.report, row.errors = score, report, state.get("errors", [])
            await db.commit()
        return {"score": score}, {"score": score.get("score")}

    g = StateGraph(State)
    fns = {
        "source_collection": source_collection, "content_extraction": content_extraction, "evidence_indexing": evidence_indexing,
        "research_planning": research_planning, "claim_extraction": claim_extraction, "freshness_analysis": freshness_analysis,
        "contradiction_analysis": contradiction_analysis, "gap_detection": gap_detection, "evidence_verification": evidence_verification,
        "checklist_generation": checklist_generation, "report_generation": report_generation,
    }
    for name, _ in STAGES:
        g.add_node(name, stage(ctx, name, fns[name]))
    g.set_entry_point("source_collection")
    order = [n for n, _ in STAGES]
    for a, b in zip(order, order[1:]):
        if a == "content_extraction":
            # conditional: no usable sources -> jump straight to the report with the errors we have
            g.add_conditional_edges(a, lambda st: "report_generation" if st.get("skip_rest") else "evidence_indexing",
                                    {"report_generation": "report_generation", "evidence_indexing": "evidence_indexing"})
        else:
            g.add_edge(a, b)
    g.add_edge("report_generation", END)
    return g.compile()


async def run_analysis(ctx: Ctx, session_id: str) -> None:
    """Entry point used by the API (as a background task) and by tests."""
    t0 = time.perf_counter()
    async with ctx.maker() as db:
        sess = (await db.execute(select(M.ResearchSession).where(M.ResearchSession.id == session_id))).scalars().one()
        sess.status = "running"
        # fresh derived data on every run; sources and their extracted text are kept
        for model in (M.Finding, M.VerificationTask, M.PipelineStage):
            await db.execute(delete(model).where(model.research_session_id == session_id))
        await db.commit()
        init: State = {
            "session_id": session_id, "question": sess.research_question, "objective": sess.research_objective, "topic": sess.topic,
            "as_of": sess.as_of_date or date.today(), "is_demo": sess.is_demo, "errors": [], "notes": [], "stage_status": {}, "stats": {},
        }
        demo_html = ctx.demo_html
    ctx.bus.clear(session_id)
    for name, label in STAGES:
        await _set_stage(ctx, session_id, name, "pending")
    await ctx.bus.publish(session_id, {"type": "run", "status": "started"})
    graph = build_graph(ctx)
    try:
        final = await graph.ainvoke(init)
        failed = [k for k, v in final.get("stage_status", {}).items() if v == "failed"]
        status = "completed_with_errors" if failed or final.get("errors") else "completed"
    except Exception as exc:  # noqa: BLE001
        log.exception("pipeline crashed")
        status = "failed"
        await ctx.bus.publish(session_id, {"type": "run", "status": "failed", "error": str(exc)[:300]})
    async with ctx.maker() as db:
        sess = (await db.execute(select(M.ResearchSession).where(M.ResearchSession.id == session_id))).scalars().one()
        sess.status = status
        await db.commit()
    await ctx.bus.publish(session_id, {"type": "run", "status": status, "duration_ms": int((time.perf_counter() - t0) * 1000)})
