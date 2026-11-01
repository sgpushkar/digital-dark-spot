"""End-to-end engine test on the demonstration workspace: real extraction, claims, conflicts, freshness,
coverage, verification and checklist code. Nothing is mocked except the network (demo fixtures are local)."""
import pytest
from sqlalchemy import select

from app.db import models as M
from app.services.demo import create_demo_session
from app.services.pipeline import STAGES, run_analysis


@pytest.fixture
async def analysed(maker, ctx_factory):
    async with maker() as db:
        sess = await create_demo_session(db)
    ctx = ctx_factory()
    await run_analysis(ctx, sess.id)
    return sess.id, ctx


async def _all(maker, model, sid):
    async with maker() as db:
        return (await db.execute(select(model).where(model.research_session_id == sid))).scalars().all()


async def test_all_stages_complete(analysed, maker):
    sid, _ = analysed
    stages = {s.stage: s for s in await _all(maker, M.PipelineStage, sid)}
    assert set(stages) == {n for n, _ in STAGES}
    assert {s.status for s in stages.values()} == {"completed"}, {k: (v.status, v.detail) for k, v in stages.items()}
    async with maker() as db:
        assert (await db.get(M.ResearchSession, sid)).status == "completed"


async def test_claims_have_verified_evidence_and_provenance(analysed, maker):
    sid, _ = analysed
    claims = await _all(maker, M.Claim, sid)
    assert len(claims) >= 10
    assert all(c.quote_verified and c.evidence_quote and c.evidence_location.get("chunk_id") for c in claims)
    deadlines = {c.object_value for c in claims if c.category == "application_deadline"}
    assert {"10 November 2026", "20 November 2026", "15 November 2024"} <= deadlines


async def test_deadline_conflict_detected_with_both_passages(analysed, maker):
    sid, _ = analysed
    findings = [f for f in await _all(maker, M.Finding, sid) if f.finding_type == "contradiction"]
    assert len(findings) == 1  # only the deadline: amounts are explained by scope/period, eligibility % by period
    f = findings[0]
    conflict = f.reasoning["conflict"]
    assert conflict["predicate"] == "application_deadline" and conflict["severity"] == "high"
    assert {c["value"] for c in conflict["claims"]} == {"10 November 2026", "20 November 2026"}
    assert f.epistemic_status == "supported" and not f.verification_issues
    assert not any("2024" in c["value"] for c in conflict["claims"])  # stale cycle is NOT a contradiction


async def test_not_every_difference_is_a_contradiction(analysed):
    _, ctx = analysed
    # re-run the comparison step directly to inspect examined non-conflicts
    from app.analysis.contradictions import detect_contradictions  # noqa: F401
    report = await _report(ctx, analysed[0])
    kinds = {(n["predicate"], n["kind"]) for n in report["examined_but_not_conflicts"]}
    assert ("scholarship_amount", "scope_difference") in kinds  # international vs domestic
    assert any(k == "period_difference" for _, k in kinds)  # 2024-25 vs 2026-27


async def _report(ctx, sid):
    async with ctx.maker() as db:
        row = (await db.execute(select(M.AnalysisReport).where(M.AnalysisReport.research_session_id == sid))).scalars().one()
        return row.report


async def test_renewal_gap_surfaces_and_is_worded_as_potential(analysed, maker):
    sid, _ = analysed
    cov = {c.name: c for c in await _all(maker, M.InformationCategory, sid)}
    results = {cov_id: r for r in await _all(maker, M.CoverageResult, sid) for cov_id in [r.category_id]}
    by_name = {cov[k].name: results[cov[k].id] for k in cov}
    assert by_name["renewal_conditions"].status == "NOT_FOUND"
    assert by_name["application_deadline"].status == "NEEDS_VERIFICATION"
    assert by_name["required_documents"].status == "COVERED"
    gap = [f for f in await _all(maker, M.Finding, sid) if f.finding_type == "gap" and "Renewal" in f.title][0]
    assert gap.title.startswith("Potential information gap") and gap.epistemic_status == "inference"
    assert "not proof" in gap.description


async def test_stale_source_flagged_never_from_retrieval_time(analysed, maker):
    sid, _ = analysed
    srcs = {s.ref: s for s in await _all(maker, M.Source, sid)}
    fresh = {r: s.extra["freshness"] for r, s in srcs.items()}
    assert fresh["source_003"]["label"] == "POTENTIALLY_OUTDATED" and "2024-25" in fresh["source_003"]["reasons"][0]
    assert fresh["source_001"]["label"] == "CURRENT"
    assert fresh["source_002"]["label"] == "CURRENT" and srcs["source_002"].publication_date is None  # no date invented
    assert srcs["source_004"].publication_date is None


async def test_checklist_prioritised_pending_and_explained(analysed, maker):
    sid, _ = analysed
    tasks = await _all(maker, M.VerificationTask, sid)
    assert tasks and all(t.status == "PENDING" and t.reason and t.priority_reasoning for t in tasks)
    top = sorted(tasks, key=lambda t: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}[t.priority])[0]
    assert top.priority == "HIGH"
    assert any("deadline" in t.title.lower() for t in tasks if t.priority == "HIGH")


async def test_score_is_transparent_and_not_full(analysed):
    sid, ctx = analysed
    rep = await _report(ctx, sid)
    sc = rep["completeness"]
    assert 0 < sc["score"] < 100
    assert set(sc["components"]) == {"coverage", "evidence", "reliability", "freshness"}
    assert abs(sum(c["contribution"] for c in sc["components"].values()) * 100 - sc["score"]) < 0.2
    assert sc["components"]["freshness"]["inputs"]["source_003"] == "POTENTIALLY_OUTDATED"
    assert any("DEMONSTRATION" in l for l in rep["limitations_and_uncertainty"])


async def test_progress_events_are_real(analysed):
    sid, ctx = analysed
    events = [e for e in ctx.bus.replay(sid) if e["type"] == "stage"]
    seq = [(e["stage"], e["status"]) for e in events if e["status"] in ("running", "completed")]
    assert seq.index(("source_collection", "running")) < seq.index(("source_collection", "completed")) < seq.index(("claim_extraction", "running"))
    assert all(e["duration_ms"] is not None for e in events if e["status"] == "completed")
