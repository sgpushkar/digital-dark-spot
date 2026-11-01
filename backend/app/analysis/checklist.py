"""Turn verified findings into an ordered, explained verification checklist. Tasks start PENDING and are only
ever completed by a human."""
from __future__ import annotations

from app.analysis.coverage import priority_for_gap
from app.schemas.domain import CategorySpec, TaskDraft, VerifiedFinding

_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
_SEV_SCORE = {"high": 0.85, "medium": 0.55, "low": 0.3}


def build_checklist(findings: list[VerifiedFinding], cats: dict[str, CategorySpec]) -> list[TaskDraft]:
    tasks: list[tuple[float, TaskDraft]] = []
    for f in findings:
        if f.finding_type == "contradiction":
            lvl = "HIGH" if f.severity == "high" else "MEDIUM"
            t = TaskDraft(
                title=f"Resolve conflict: {f.reasoning.get('label', f.title)}",
                reason=f.description, priority=lvl, finding_ref=f.ref, recommended_source_type="official_source",
                suggested_question=f.reasoning.get("suggested_question"),
                priority_reasoning={"basis": "contradictions between sources are ranked by category importance and consequence", "severity": f.severity})
            tasks.append((1.0 if lvl == "HIGH" else 0.6, t))
        elif f.finding_type == "freshness":
            t = TaskDraft(
                title=f"Check whether {f.source_refs[0] if f.source_refs else 'this source'} still applies",
                reason=f.description, priority="MEDIUM" if f.severity != "low" else "LOW", finding_ref=f.ref,
                recommended_source_type="official_source",
                suggested_question="Is the information in this source valid for the current cycle?",
                priority_reasoning={"basis": "potentially outdated or expired sources", "severity": f.severity})
            tasks.append((0.5, t))
        elif f.finding_type == "gap":
            cat = cats.get(f.related_key or "")
            imp, cons = (cat.importance, cat.consequence) if cat else (3, 3)
            status = f.reasoning.get("coverage_status", "NOT_FOUND")
            score, lvl, why = priority_for_gap(imp, cons, status)
            t = TaskDraft(
                title=f"Find out: {cat.label if cat else f.title}", reason=f.description, priority=lvl, finding_ref=f.ref,  # type: ignore[arg-type]
                recommended_source_type="official_source", suggested_question=f.reasoning.get("suggested_question"),
                priority_reasoning=why)
            tasks.append((score, t))
        elif f.finding_type == "weak_evidence":
            t = TaskDraft(title=f"Strengthen evidence: {f.title}", reason=f.description, priority="LOW", finding_ref=f.ref,
                          recommended_source_type="independent_source", priority_reasoning={"basis": "evidence quality"})
            tasks.append((0.3, t))
        if f.epistemic_status == "uncertain" and f.verification_issues:
            tasks[-1][1].reason += " Verification issues: " + " ".join(f.verification_issues)
    tasks.sort(key=lambda p: (_ORDER[p[1].priority], -p[0]))
    return [t for _, t in tasks]
