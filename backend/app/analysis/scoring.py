"""Research completeness indicator: a transparent, configurable product metric, NOT a measure of truth.
Unknowns never earn full credit; the breakdown records the inputs behind every component."""
from __future__ import annotations

from app.analysis.coverage import STATUS_CREDIT
from app.schemas.domain import CategorySpec, Claim, Conflict, CoverageItem, FreshnessAssessment, SourceDoc

RELIABILITY = {"official_source": 1.0, "official": 1.0, "government": 1.0, "institution": 1.0, "academic": 0.85,
               "document": 0.6, "pdf": 0.6, "news": 0.55, "organization": 0.6, "blog": 0.35, "forum": 0.25,
               "demo_fixture": 0.6, "unknown": 0.4}
FRESH_CREDIT = {"CURRENT": 1.0, "UNDATED": 0.4, "DATE_UNAVAILABLE": 0.3, "POTENTIALLY_OUTDATED": 0.3, "EXPIRED": 0.0}


def compute_score(
    weights: dict[str, float], categories: list[CategorySpec], coverage: list[CoverageItem], claims: list[Claim],
    sources: dict[str, SourceDoc], freshness: dict[str, FreshnessAssessment], conflicts: list[Conflict],
) -> dict:
    total_w = sum(weights.values()) or 1.0
    w = {k: v / total_w for k, v in weights.items()}
    imp = {c.name: c.importance for c in categories}

    wsum = sum(imp[i.category] for i in coverage) or 1
    cov = sum(imp[i.category] * STATUS_CREDIT[i.status] for i in coverage) / wsum if coverage else 0.0
    coverage_c = {"score": round(cov, 3), "method": "importance-weighted mean of status credit (COVERED 1.0, PARTIALLY_COVERED 0.6, NEEDS_VERIFICATION 0.4, UNCERTAIN 0.2, NOT_FOUND 0)",
                  "inputs": {i.category: i.status for i in coverage}}

    verified = [c for c in claims if c.quote_verified]
    in_conf = {cr.claim_ref for cf in conflicts for cr in cf.claims}
    if claims:
        per = [(c.confidence if c.quote_verified else 0.0) * (0.5 if c.ref in in_conf else 1.0) for c in claims]
        ev = sum(per) / len(per)
    else:
        ev = 0.0
    evidence_c = {"score": round(ev, 3), "method": "mean over claims of confidence x quote_verified, halved when the claim is part of an unresolved conflict",
                  "inputs": {"claims": len(claims), "quote_verified": len(verified), "claims_in_conflict": len(in_conf & {c.ref for c in claims})}}

    rel_vals = [RELIABILITY.get(s.source_type, 0.4) for s in sources.values()]
    rel = sum(rel_vals) / len(rel_vals) if rel_vals else 0.0
    reliability_c = {"score": round(rel, 3), "method": "mean source-type reliability weight (unknown type = 0.4); source count does not raise the score",
                     "inputs": {s.ref: s.source_type for s in sources.values()}}

    fr_vals = [FRESH_CREDIT[freshness[s].label] if s in freshness else 0.3 for s in sources]
    fr = sum(fr_vals) / len(fr_vals) if fr_vals else 0.0
    unknown = [s for s, a in freshness.items() if a.label in ("UNDATED", "DATE_UNAVAILABLE")]
    freshness_c = {"score": round(fr, 3), "method": "mean freshness credit (CURRENT 1.0, UNDATED 0.4, DATE_UNAVAILABLE 0.3, POTENTIALLY_OUTDATED 0.3, EXPIRED 0)",
                   "inputs": {s: a.label for s, a in freshness.items()}, "unknown_date_sources": unknown}

    comps = {"coverage": coverage_c, "evidence": evidence_c, "reliability": reliability_c, "freshness": freshness_c}
    for k, c in comps.items():
        c["weight"] = round(w[k], 3)
        c["contribution"] = round(c["score"] * w[k], 4)
    total = round(sum(c["contribution"] for c in comps.values()) * 100, 1)
    return {"score": total, "scale": "0-100", "components": comps,
            "disclaimer": "A product metric describing how well the reviewed sources cover the research goal. It does not indicate that the research is complete or that any claim is true."}
