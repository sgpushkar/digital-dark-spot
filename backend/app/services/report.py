"""Structured research report. Built only from analysis results; every list item keeps its evidence refs."""
from __future__ import annotations

from datetime import datetime, timezone


def build_report(state: dict, score: dict, ctx) -> dict:
    sources = state.get("sources", {})
    claims = state.get("claims", [])
    coverage = state.get("coverage", [])
    findings = state.get("findings", [])
    freshness = state.get("freshness", {})
    conflicts = state.get("conflicts", [])
    tasks = state.get("tasks", [])
    cats = {c.name: c for c in state.get("categories", [])}
    by_status: dict[str, int] = {}
    for it in coverage:
        by_status[it.status] = by_status.get(it.status, 0) + 1

    key_info = [
        {"category": cats[c.category].label if c.category in cats else c.category, "claim_ref": c.ref, "value": c.object,
         "source_ref": c.source_ref, "evidence_quote": c.evidence_quote, "confidence": c.confidence, "method": c.method}
        for c in claims if c.quote_verified
    ]
    uncovered = [it for it in coverage if it.status != "COVERED"]
    limitations = [
        "Findings describe what the reviewed sources do and do not establish; absence of information is not proof it does not exist.",
        "Priorities and the completeness score are transparent heuristics, not objective truth.",
    ]
    if ctx.llm is None:
        limitations.append("No LLM was configured: claims were extracted with a rule-based extractor (method='heuristic') and categories came from a template. Coverage of unusual phrasing is limited.")
    if not ctx.embedder.semantic:
        limitations.append("Evidence retrieval used lexical-hash embeddings plus BM25 (not semantic embeddings).")
    if state.get("is_demo"):
        limitations.insert(0, "DEMONSTRATION DATA: every source in this workspace is fictional.")
    limitations += [f"{n}" for n in state.get("notes", [])]
    for e in state.get("errors", []):
        limitations.append(f"Error in {e.get('stage')}{' / ' + e['source'] if e.get('source') else ''}: {e['error']}")

    findings_by = lambda t: [f for f in findings if f.finding_type == t]  # noqa: E731
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "is_demo": bool(state.get("is_demo")),
        "research_objective": {"question": state.get("question"), "objective": state.get("objective"), "subject": state.get("subject"),
                               "category_method": state.get("category_method")},
        "sources_reviewed": [{"ref": s.ref, "title": s.title, "url": s.url, "type": s.source_type, "publication_date": s.publication_date.isoformat() if s.publication_date else None,
                              "modified_date": s.modified_date.isoformat() if s.modified_date else None,
                              "freshness": freshness[s.ref].label if s.ref in freshness else None} for s in sources.values()],
        "executive_summary": {
            "sources_analyzed": len(sources), "claims_extracted": len(claims),
            "coverage_by_status": by_status, "possible_contradictions": len(conflicts),
            "potentially_outdated_sources": sum(1 for a in freshness.values() if a.label in ("POTENTIALLY_OUTDATED", "EXPIRED")),
            "completeness_score": score.get("score"),
            "text": (f"{len(sources)} source(s) were reviewed and {len(claims)} claim(s) extracted. "
                     f"{by_status.get('COVERED', 0)} of {len(coverage)} expected information categories are covered; "
                     f"{len(uncovered)} need attention. {len(conflicts)} possible contradiction(s) and "
                     f"{sum(1 for a in freshness.values() if a.label in ('POTENTIALLY_OUTDATED', 'EXPIRED'))} potentially outdated source(s) were flagged."),
        },
        "key_extracted_information": key_info,
        "information_coverage": [it.model_dump() for it in coverage],
        "potential_information_gaps": [f.model_dump() for f in findings_by("gap")],
        "possible_contradictions": [c.model_dump() for c in conflicts],
        "examined_but_not_conflicts": [n.model_dump() for n in state.get("non_conflicts", []) if n.kind != "corroboration"],
        "potentially_outdated_information": [a.model_dump() for a in freshness.values() if a.label != "CURRENT"],
        "unanswered_questions": [{"category": it.label, "question": it.suggested_question, "status": it.status} for it in uncovered if it.suggested_question],
        "verification_checklist": [t.model_dump() for t in tasks],
        "completeness": score,
        "limitations_and_uncertainty": limitations,
        "stage_stats": state.get("stats", {}),
    }
