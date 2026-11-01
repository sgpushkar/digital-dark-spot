import pytest

from app.analysis.categories import propose_categories, propose_categories_heuristic
from app.analysis.claims import (
    dedupe_claims, extract_claims_heuristic, extract_claims_llm, infer_subject, subjects_match, verify_quote,
)
from app.llm.base import RawResponse, StructuredLLM
from app.schemas.domain import ChunkDoc, SourceDoc

SRC_TEXT = (
    "Meridian Excellence Scholarship\n\n"
    "Applications close on 10 November 2026. The award is ₹1,50,000 per year for postgraduate students. "
    "Applicants must be enrolled full-time and hold at least 75% in their last degree. "
    "Applicants must upload a transcript and two recommendation letters. "
    "I think this is the best scholarship ever."
)


def mk_source(text=SRC_TEXT, ref="source_001"):
    return SourceDoc(ref=ref, url="https://x.test/a", text=text), [ChunkDoc(ref="chunk_001", source_ref=ref, content=text, start=0, end=len(text), section_heading="Overview")]


def test_categories_depend_on_objective():
    sch, m1 = propose_categories_heuristic("What should I verify before applying for the Meridian Scholarship?")
    job, m2 = propose_categories_heuristic("Is this job offer salary and notice period reasonable?")
    gen, m3 = propose_categories_heuristic("How does urban beekeeping affect pollination?")
    assert m1 == "template:scholarship" and m2 == "template:job_offer" and m3 == "template:generic"
    assert "renewal_conditions" in {c.name for c in sch}
    assert "renewal_conditions" not in {c.name for c in job} | {c.name for c in gen}


def test_infer_subject():
    assert infer_subject("What should I verify before applying for the Meridian Excellence Scholarship?", None) == "Meridian Excellence Scholarship"
    assert infer_subject("how does x work", None, topic="Beekeeping") == "Beekeeping"
    assert subjects_match("Meridian Excellence Scholarship", "the Meridian Scholarship")
    assert not subjects_match("Meridian Scholarship", "Orion Grant")


def test_heuristic_claims_structured_with_evidence():
    src, chunks = mk_source()
    cats, _ = propose_categories_heuristic("Meridian Excellence Scholarship application")
    drafts, stats = extract_claims_heuristic(src, chunks, cats, "Meridian Excellence Scholarship")
    by_cat = {d.category: d for d in drafts}
    assert by_cat["application_deadline"].object == "10 November 2026"
    assert by_cat["application_deadline"].qualifiers["normalized"]["value"] == "2026-11-10"
    assert by_cat["scholarship_amount"].qualifiers["normalized"]["value"]["currency"] == "INR"
    assert "postgraduate" in by_cat["scholarship_amount"].qualifiers["scope"]
    assert "required_documents" in by_cat and "eligibility_requirements" in by_cat
    assert stats["opinions_skipped"] == 1
    assert all(verify_quote(d, src.text) for d in drafts)
    assert all(d.evidence_location.chunk_id == "chunk_001" for d in drafts)


def test_verify_quote_rejects_fabrication():
    src, chunks = mk_source()
    cats, _ = propose_categories_heuristic("scholarship")
    d = extract_claims_heuristic(src, chunks, cats, "S")[0][0]
    assert verify_quote(d, src.text)
    assert not verify_quote(d.model_copy(update={"evidence_quote": "Applications close on 1 January 2030."}), src.text)


def test_dedupe():
    src, chunks = mk_source()
    cats, _ = propose_categories_heuristic("scholarship")
    d, _ = extract_claims_heuristic(src, chunks, cats, "S")
    assert len(dedupe_claims(d + d)) == len(d)


class FakeAdapter:
    name, model = "fake", "m"

    def __init__(self, replies):
        self.replies = list(replies)

    async def complete(self, system, user, *, max_tokens, temperature):
        assert "UNTRUSTED_SOURCE_TEXT" in user or "Research goal data" in user  # content always wrapped
        return RawResponse(self.replies.pop(0))


async def test_llm_claims_drop_fabricated_quotes():
    src, chunks = mk_source()
    cats, _ = propose_categories_heuristic("scholarship")
    llm = StructuredLLM(FakeAdapter(['{"claims":[{"subject":"Meridian Excellence Scholarship","predicate":"application_deadline","object":"10 November 2026","category":"application_deadline","evidence_quote":"Applications close on 10 November 2026.","confidence":0.9},{"subject":"Meridian Excellence Scholarship","predicate":"application_deadline","object":"1 Dec 2026","category":"application_deadline","evidence_quote":"Deadline is 1 December 2026 for everyone.","confidence":0.9}]}']), max_tokens=100, temperature=0, max_retries=0)
    drafts, stats = await extract_claims_llm(llm, src, chunks, cats, "Meridian Excellence Scholarship")
    assert len(drafts) == 1 and stats["dropped_unverifiable"] == 1
    assert drafts[0].method == "llm" and drafts[0].qualifiers["normalized"]["value"] == "2026-11-10"


async def test_llm_category_proposal_validated_and_fallback_noted():
    good = '{"categories":[{"name":"Wing Span!","label":"Wing span","importance":9,"consequence":0,"keywords":["wing"],"value_type":"weird"},{"name":"habitat","importance":4},{"name":"diet","importance":2}]}'
    llm = StructuredLLM(FakeAdapter([good]), max_tokens=100, temperature=0, max_retries=0)
    cats, method, note = await propose_categories(llm, "bird study", None)
    assert method == "llm:fake" and note is None
    assert cats[0].name == "wing_span" and cats[0].importance == 5 and cats[0].consequence == 1 and cats[0].value_type == "text"
    bad = StructuredLLM(FakeAdapter(["nope", "still nope"]), max_tokens=100, temperature=0, max_retries=0)
    cats, method, note = await propose_categories(bad, "scholarship application", None)
    assert method == "template:scholarship" and "failed" in note
    cats, method, note = await propose_categories(None, "scholarship application", None)
    assert "No LLM configured" in note
