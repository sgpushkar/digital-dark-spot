export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type CoverageStatus = "COVERED" | "PARTIALLY_COVERED" | "NOT_FOUND" | "UNCERTAIN" | "NEEDS_VERIFICATION";
export type FreshnessLabel = "CURRENT" | "POTENTIALLY_OUTDATED" | "UNDATED" | "EXPIRED" | "DATE_UNAVAILABLE";

export interface Session {
  id: string; title: string; research_question: string; research_objective: string | null; topic: string | null;
  status: string; is_demo: boolean; as_of_date: string | null; created_at: string; updated_at: string;
  counts?: { sources: number; claims: number; findings: number; tasks: number };
}
export interface Freshness {
  source_ref: string; label: FreshnessLabel; reasons: string[]; periods_found: string[]; deadline_dates: string[];
  metadata_date_used: string | null; target_period: string | null; target_period_origin: string | null; evidence_quote: string | null;
}
export interface Source {
  id: string; ref: string; url: string; link: string | null; domain: string | null; title: string | null; source_type: string;
  publication_date: string | null; modified_date: string | null; retrieved_at: string | null; content_hash: string | null;
  extraction_status: string; error_message: string | null; date_origins: Record<string, string>; extractor: string | null;
  warnings: string[]; freshness: Freshness | null; injection_markers: string[]; is_demo: boolean;
}
export interface EvidenceLocation { page_number: number | null; section: string | null; chunk_id: string | null }
export interface Claim {
  id: string; ref: string; source_ref: string | null; subject: string; predicate: string; object: string; category: string;
  original_text: string; evidence_quote: string; evidence_location: EvidenceLocation; confidence: number; method: string;
  quote_verified: boolean; qualifiers: Record<string, unknown>;
}
export interface CoverageItem {
  category: string; label: string; description: string; importance: number; consequence: number; expected_information: string;
  generation_method: string; status: CoverageStatus; explanation: string; suggested_question: string; source_refs: string[];
  claim_refs: string[]; mention_chunk_refs: string[]; reasoning: Record<string, unknown>; claims: Claim[];
}
export interface Finding {
  id: string; ref: string; finding_type: string; title: string; description: string; severity: "low" | "medium" | "high";
  confidence: number; evidence_references: { claim_refs?: string[]; source_refs?: string[]; chunk_refs?: string[] };
  epistemic_status: "supported" | "inference" | "uncertain"; verification_status: string; verification_issues: string[];
  reasoning: Record<string, any>; user_note: string | null;
}
export interface ConflictItem extends Finding {
  conflict: { conflict_id: string; predicate: string; subject: string; explanation: string; recommended_verification: string;
    method: string; relevant_dates: Record<string, { publication_date: string | null; modified_date: string | null }> };
  claims: (Claim & { source: Source })[];
}
export interface NonConflict { subject: string; predicate: string; claim_refs: string[]; kind: string; explanation: string }
export interface Task {
  id: string; title: string; reason: string; priority: "HIGH" | "MEDIUM" | "LOW"; priority_reasoning: Record<string, any>;
  recommended_source_type: string; suggested_question: string | null; status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  notes: string | null; finding_ref: string | null; completed_at: string | null;
}
export interface StageInfo { stage: string; label: string; status: StageStatus; detail: string | null; duration_ms: number | null; stats: Record<string, any> }
export interface StatusResp { session_id: string; status: string; stages: StageInfo[]; errors: { stage: string; source?: string; error: string }[] }
export interface ScoreComponent { score: number; weight: number; contribution: number; method: string; inputs: Record<string, unknown>; unknown_date_sources?: string[] }
export interface Score { score: number; scale: string; components: Record<"coverage" | "evidence" | "reliability" | "freshness", ScoreComponent>; disclaimer: string }
export interface Report {
  is_demo: boolean; session: Session; completeness: Score; errors: unknown[];
  research_objective: { question: string; objective: string | null; subject: string; category_method: string };
  sources_reviewed: { ref: string; title: string | null; url: string; type: string; publication_date: string | null; modified_date: string | null; freshness: string | null }[];
  executive_summary: { sources_analyzed: number; claims_extracted: number; coverage_by_status: Record<string, number>; possible_contradictions: number; potentially_outdated_sources: number; completeness_score: number | null; text: string };
  key_extracted_information: { category: string; claim_ref: string; value: string; source_ref: string; evidence_quote: string; confidence: number; method: string }[];
  information_coverage: unknown[]; potential_information_gaps: Finding[]; possible_contradictions: unknown[];
  potentially_outdated_information: Freshness[]; unanswered_questions: { category: string; question: string; status: string }[];
  verification_checklist: Task[]; limitations_and_uncertainty: string[];
}
export interface Evidence {
  claim: Claim; source: Source; passage: { chunk_ref: string | null; text: string | null; page_number: number | null; section_heading: string | null };
  related_claims: { relationship: string; explanation: string | null; claim: Claim }[]; findings: Finding[]; tasks: Task[];
}
export interface GraphData { nodes: { id: string; type: string; label: string; severity?: string; priority?: string }[]; edges: { source: string; target: string; type: string }[] }
export interface PublicConfig { llm_configured: boolean; llm_provider: string | null; embedder: string; semantic_embeddings: boolean; extraction_mode: string; upload_max_bytes: number; demo_label: string }
export interface SearchHit { chunk_ref: string; source_ref: string; url: string; page_number: number | null; section_heading: string | null; text: string; scores: { bm25: number; vector: number | null; rrf: number }; ranks: { bm25: number | null; vector: number | null }; matched_terms: string[] }
export interface PipelineEvent { type: "stage" | "run"; stage?: string; label?: string; status: string; detail?: string | null; stats?: Record<string, unknown>; duration_ms?: number | null; error?: string; ts?: string; session_id?: string }
