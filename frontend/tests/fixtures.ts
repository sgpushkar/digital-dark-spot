import type { Claim, ConflictItem, CoverageItem, Report, Source, Task } from "@/lib/types";

export const source = (o: Partial<Source> = {}): Source => ({
  id: "s1", ref: "source_001", url: "demo://fixtures/official-guidelines", link: "/api/demo/fixtures/official-guidelines", domain: "demo.fixture",
  title: "Official Guidelines 2026-27", source_type: "official_source", publication_date: "2026-07-01", modified_date: null, retrieved_at: null,
  content_hash: "abc", extraction_status: "done", error_message: null, date_origins: { publication_date: "meta:article:published_time" }, extractor: "html:bs4",
  warnings: [], freshness: { source_ref: "source_001", label: "CURRENT", reasons: ["ok"], periods_found: ["2026-27"], deadline_dates: [], metadata_date_used: null, target_period: "2026-27", target_period_origin: "stated_in_research_goal", evidence_quote: null },
  injection_markers: [], is_demo: true, ...o,
});

export const claim = (o: Partial<Claim> = {}): Claim => ({
  id: "c1", ref: "claim_001", source_ref: "source_001", subject: "Meridian", predicate: "application_deadline", object: "10 November 2026",
  category: "application_deadline", original_text: "Applications close on 10 November 2026.", evidence_quote: "Applications close on 10 November 2026.",
  evidence_location: { page_number: null, section: "Key dates", chunk_id: "chunk_001" }, confidence: 0.92, method: "heuristic", quote_verified: true, qualifiers: {}, ...o,
});

export const cov = (o: Partial<CoverageItem> = {}): CoverageItem => ({
  category: "application_deadline", label: "Application deadline", description: "The date by which the application must be submitted.", importance: 5, consequence: 5,
  expected_information: "", generation_method: "template:scholarship", status: "NEEDS_VERIFICATION", explanation: "Sources disagree about application deadline.",
  suggested_question: "What is the current application deadline?", source_refs: ["source_001", "source_002"], claim_refs: ["claim_001"], mention_chunk_refs: [], reasoning: {}, claims: [claim()], ...o,
});

export const conflict = (): ConflictItem => ({
  id: "f1", ref: "finding_001", finding_type: "contradiction", title: "Possible conflict: application deadline differs between sources", description: "d", severity: "high", confidence: 0.9,
  evidence_references: { claim_refs: ["claim_001", "claim_007"] }, epistemic_status: "supported", verification_status: "unresolved", verification_issues: [], reasoning: {}, user_note: null,
  conflict: { conflict_id: "conflict_001", predicate: "application_deadline", subject: "Meridian", explanation: "2 claims about the application deadline disagree.", recommended_verification: "Confirm the current deadline with the official source.", method: "deterministic", relevant_dates: {} },
  claims: [
    { ...claim(), source: source() },
    { ...claim({ ref: "claim_007", source_ref: "source_002", object: "20 November 2026", original_text: "Applications for the 2026-27 cycle must be submitted by 20 November 2026.", evidence_quote: "must be submitted by 20 November 2026." }), source: source({ ref: "source_002", title: "Partner FAQ", publication_date: null }) },
  ],
});

export const task = (o: Partial<Task> = {}): Task => ({
  id: "t1", title: "Resolve conflict: application deadline", reason: "Different deadlines were found across two sources.", priority: "HIGH", priority_reasoning: { basis: "x" },
  recommended_source_type: "official_source", suggested_question: "What is the current application deadline?", status: "PENDING", notes: null, finding_ref: "finding_001", completed_at: null, ...o,
});

export const report = (): Report => ({
  is_demo: true, errors: [], session: {} as any,
  completeness: { score: 58.3, scale: "0-100", disclaimer: "A product metric.", components: {
    coverage: { score: 0.5, weight: 0.4, contribution: 0.2, method: "importance-weighted", inputs: {} }, evidence: { score: 0.8, weight: 0.25, contribution: 0.2, method: "mean", inputs: {} },
    reliability: { score: 0.7, weight: 0.2, contribution: 0.14, method: "mean", inputs: {} }, freshness: { score: 0.6, weight: 0.15, contribution: 0.09, method: "mean", inputs: {}, unknown_date_sources: ["source_004"] } } },
  research_objective: { question: "q", objective: null, subject: "Meridian", category_method: "template:scholarship" }, sources_reviewed: [],
  executive_summary: { sources_analyzed: 4, claims_extracted: 17, coverage_by_status: {}, possible_contradictions: 1, potentially_outdated_sources: 1, completeness_score: 58.3, text: "t" },
  key_extracted_information: [claim() as any].map((c) => ({ category: c.category, claim_ref: c.ref, value: c.object, source_ref: "source_001", evidence_quote: c.evidence_quote, confidence: 0.9, method: "heuristic" })),
  information_coverage: [], potential_information_gaps: [], possible_contradictions: [], potentially_outdated_information: [], unanswered_questions: [], verification_checklist: [], limitations_and_uncertainty: [],
});
