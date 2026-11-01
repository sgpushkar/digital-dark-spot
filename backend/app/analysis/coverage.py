"""Evidence coverage matrix + gap findings + transparent priority scoring."""
from __future__ import annotations

from app.retrieval.hybrid import IndexedChunk, hybrid_search
from app.schemas.domain import (
    CategorySpec, Claim, Conflict, CoverageItem, FindingDraft, FreshnessAssessment, SourceDoc,
)

OFFICIAL_TYPES = {"official_source", "official", "government", "institution"}
STALE = {"POTENTIALLY_OUTDATED", "EXPIRED"}


def compute_coverage(
    categories: list[CategorySpec],
    claims: list[Claim],
    sources: dict[str, SourceDoc],
    freshness: dict[str, FreshnessAssessment],
    conflicts: list[Conflict],
    chunks: list[IndexedChunk],
) -> list[CoverageItem]:
    in_conflict = {cr.claim_ref for c in conflicts for cr in c.claims}
    items: list[CoverageItem] = []
    for cat in categories:
        cat_claims = [c for c in claims if c.category == cat.name and c.quote_verified]
        src_refs = sorted({c.source_ref for c in cat_claims})
        current = [c for c in cat_claims if not (freshness.get(c.source_ref) and freshness[c.source_ref].label in STALE)]
        cur_srcs = sorted({c.source_ref for c in current})
        official = [s for s in cur_srcs if sources[s].source_type in OFFICIAL_TYPES]
        mention_refs: list[str] = []
        reasoning = {"claims_found": len(cat_claims), "sources_with_claims": len(src_refs),
                     "claims_from_current_sources": len(current), "official_source_present": bool(official)}

        if not cat_claims:
            hits = hybrid_search(" ".join(cat.keywords + [cat.label]), None, chunks, top_k=3)
            mention_refs = [h.chunk.ref for h in hits if len(h.matched_terms) >= 2]
            if mention_refs:
                status, why = "UNCERTAIN", (
                    f"Passages may touch on {cat.label.lower()} (keyword overlap) but no verifiable claim could be "
                    "extracted. Review the passages manually.")
            else:
                status, why = "NOT_FOUND", f"No relevant information about {cat.label.lower()} was identified in the sources reviewed."
            reasoning["keyword_mentions"] = len(mention_refs)
        elif any(c.ref in in_conflict for c in cat_claims):
            status, why = "NEEDS_VERIFICATION", f"Sources disagree about {cat.label.lower()}; the value cannot be established without verification."
        elif not current:
            status, why = "NEEDS_VERIFICATION", f"{cat.label} was found only in potentially outdated sources."
        elif len(cur_srcs) >= 2 or official:
            status = "COVERED"
            why = (f"Found in {len(cur_srcs)} current source(s)" + (", including an official source." if official else "; independent sources are in agreement or non-conflicting."))
        else:
            status, why = "PARTIALLY_COVERED", f"Found in a single non-official source ({cur_srcs[0]}); corroboration is lacking."
        items.append(CoverageItem(
            category=cat.name, label=cat.label, status=status, explanation=why,  # type: ignore[arg-type]
            claim_refs=[c.ref for c in cat_claims], source_refs=src_refs, mention_chunk_refs=mention_refs,
            suggested_question=cat.suggested_question, importance=cat.importance, reasoning=reasoning,
        ))
    return items


STATUS_CREDIT = {"COVERED": 1.0, "PARTIALLY_COVERED": 0.6, "NEEDS_VERIFICATION": 0.4, "UNCERTAIN": 0.2, "NOT_FOUND": 0.0}


def priority_for_gap(importance: int, consequence: int, status: str) -> tuple[float, str, dict]:
    """Transparent weighted formula. Shown to the user; not claimed to be objectively correct."""
    availability_gap = {"NOT_FOUND": 1.0, "UNCERTAIN": 0.75, "PARTIALLY_COVERED": 0.5, "NEEDS_VERIFICATION": 0.6}.get(status, 0.0)
    uncertainty = {"NOT_FOUND": 0.7, "UNCERTAIN": 1.0, "PARTIALLY_COVERED": 0.6, "NEEDS_VERIFICATION": 0.8}.get(status, 0.0)
    parts = {
        "importance_to_objective": round(0.40 * importance / 5, 3),
        "consequence_of_missing_it": round(0.30 * consequence / 5, 3),
        "evidence_unavailability": round(0.20 * availability_gap, 3),
        "uncertainty": round(0.10 * uncertainty, 3),
    }
    score = round(sum(parts.values()), 3)
    level = "HIGH" if score >= 0.70 else "MEDIUM" if score >= 0.45 else "LOW"
    return score, level, {
        "formula": "0.40*importance/5 + 0.30*consequence/5 + 0.20*evidence_unavailability + 0.10*uncertainty",
        "inputs": {"importance": importance, "consequence": consequence, "status": status},
        "components": parts, "score": score, "note": "Heuristic ranking aid, not an objective measure.",
    }


def build_gap_findings(items: list[CoverageItem], cats: dict[str, CategorySpec]) -> list[FindingDraft]:
    out: list[FindingDraft] = []
    for it in items:
        if it.status not in ("NOT_FOUND", "UNCERTAIN", "PARTIALLY_COVERED"):
            continue
        cat = cats[it.category]
        score, level, why = priority_for_gap(cat.importance, cat.consequence, it.status)
        lead = {"NOT_FOUND": "was not found in the sources reviewed",
                "UNCERTAIN": "could not be pinned down from the sources reviewed",
                "PARTIALLY_COVERED": "rests on a single non-official source"}[it.status]
        out.append(FindingDraft(
            finding_type="gap", title=f"Potential information gap: {it.label} {lead}",
            description=(it.explanation + " This is a gap in the reviewed sources, not proof that the information does not exist."),
            severity={"HIGH": "high", "MEDIUM": "medium", "LOW": "low"}[level],  # type: ignore[arg-type]
            confidence=0.8 if it.status == "NOT_FOUND" else 0.6, claim_refs=it.claim_refs, source_refs=it.source_refs,
            chunk_refs=it.mention_chunk_refs, related_key=it.category,
            reasoning={"priority": why, "coverage_status": it.status, "suggested_question": it.suggested_question},
            absence_finding=it.status == "NOT_FOUND",
        ))
    return out
