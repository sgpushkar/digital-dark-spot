"""Evidence verification: checks that every finding's references exist and that quotes really support it.
Findings that fail are downgraded to 'uncertain' with explicit issues. It reduces unsupported claims;
it does not claim to eliminate hallucination."""
from __future__ import annotations

from app.analysis.claims import _norm_ws
from app.schemas.domain import Claim, FindingDraft, SourceDoc, VerifiedFinding


def verify_findings(
    drafts: list[FindingDraft], claims: dict[str, Claim], sources: dict[str, SourceDoc], reviewed_sources: int,
) -> list[VerifiedFinding]:
    out: list[VerifiedFinding] = []
    for i, d in enumerate(drafts, start=1):
        issues: list[str] = []
        for sref in d.source_refs:
            if sref not in sources:
                issues.append(f"Referenced source {sref} does not exist.")
        for cref in d.claim_refs:
            c = claims.get(cref)
            if c is None:
                issues.append(f"Referenced claim {cref} does not exist.")
                continue
            src = sources.get(c.source_ref)
            if src is None:
                issues.append(f"Claim {cref} points at missing source {c.source_ref}.")
                continue
            if not c.evidence_quote or _norm_ws(c.evidence_quote) not in _norm_ws(src.text):
                issues.append(f"Evidence passage for {cref} was not found verbatim in {c.source_ref}.")
                continue
            disp = (c.qualifiers.get("normalized") or {}).get("display")
            if d.finding_type in ("contradiction", "freshness") and disp and disp.lower() not in c.evidence_quote.lower():
                issues.append(f"Passage for {cref} does not contain the cited value '{disp}'.")
        status = "supported"
        if d.absence_finding:
            status = "inference"
            if reviewed_sources == 0:
                issues.append("No usable sources were reviewed, so absence cannot be reported.")
        elif d.finding_type == "freshness":
            status = "supported" if d.source_refs and not issues else "uncertain"
            if not d.source_refs:
                issues.append("Freshness finding has no source reference.")
        elif not d.claim_refs and not d.source_refs:
            status = "uncertain"
            issues.append("No citation: finding has no claim or source reference and is treated as an inference.")
        elif d.finding_type == "gap":
            status = "inference"  # partial/uncertain coverage is derived from evidence, not directly stated
        if issues:
            status = "uncertain"
        conf = d.confidence * (0.5 if issues else 1.0)
        out.append(VerifiedFinding(**d.model_dump(exclude={"confidence"}), confidence=round(conf, 2),
                                   ref=f"finding_{i:03d}", epistemic_status=status, verification_issues=issues))  # type: ignore[arg-type]
    return out
