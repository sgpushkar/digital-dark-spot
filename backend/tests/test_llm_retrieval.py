import pytest
from pydantic import BaseModel

from app.llm.base import LLMOutputError, LLMUnavailable, RawResponse, StructuredLLM, extract_json
from app.retrieval.embeddings import HashEmbedder
from app.retrieval.hybrid import IndexedChunk, hybrid_search


class Out(BaseModel):
    items: list[str]


class Fake:
    name, model = "fake", "fake-1"

    def __init__(self, replies):
        self.replies, self.calls = list(replies), 0

    async def complete(self, system, user, *, max_tokens, temperature):
        self.calls += 1
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return RawResponse(r, 10, 5)


def llm(replies, retries=1):
    return StructuredLLM(Fake(replies), max_tokens=100, temperature=0, max_retries=retries)


def test_extract_json_tolerates_fences_and_prose():
    assert extract_json('```json\n{"a":1}\n```') == {"a": 1}
    assert extract_json('Sure! {"a": [1,2]} hope that helps') == {"a": [1, 2]}
    with pytest.raises(ValueError):
        extract_json("no json")


async def test_valid_output():
    m = llm(['{"items":["a"]}'])
    assert (await m.generate("s", "u", Out, stage="t")).items == ["a"]
    assert m.usage.calls == 1 and m.usage.tokens_in == 10


async def test_malformed_then_repaired():
    m = llm(["garbage", '{"items":["ok"]}'])
    assert (await m.generate("s", "u", Out, stage="t")).items == ["ok"]
    assert m.usage.repairs == 1


async def test_malformed_twice_fails_loudly():
    m = llm(["garbage", '{"wrong": 1}'])
    with pytest.raises(LLMOutputError):
        await m.generate("s", "u", Out, stage="t")
    assert m.usage.failures == 1


async def test_transport_errors_are_bounded():
    m = llm([RuntimeError("boom"), RuntimeError("boom")], retries=1)
    with pytest.raises(LLMUnavailable):
        await m.generate("s", "u", Out, stage="t")
    assert m.adapter.calls == 2


async def test_hash_embedder_is_deterministic_and_normalized():
    e = HashEmbedder(64)
    a, b = await e.embed(["application deadline november"]), await e.embed(["application deadline november"])
    assert a == b and abs(sum(x * x for x in a[0]) - 1) < 1e-9
    assert e.semantic is False


async def _chunks():
    e = HashEmbedder(128)
    texts = {
        "chunk_001": ("source_001", "Applications close on 10 November 2026. Late applications are not accepted."),
        "chunk_002": ("source_001", "Renewal requires maintaining a 3.0 GPA across two semesters."),
        "chunk_003": ("source_002", "The campus library is open from 9am to 5pm on weekdays."),
    }
    embs = await e.embed([t for _, t in texts.values()])
    return e, [IndexedChunk(ref, s, f"https://x/{s}", t, emb) for (ref, (s, t)), emb in zip(texts.items(), embs)]


async def test_hybrid_ranks_relevant_first_and_scores_are_real():
    e, chunks = await _chunks()
    q = "when do applications close deadline"
    res = hybrid_search(q, (await e.embed([q]))[0], chunks, top_k=3)
    assert res[0].chunk.ref == "chunk_001"
    assert res[0].bm25 > 0 and res[0].rrf > 0 and "applications" in res[0].matched_terms
    assert all(r.chunk.ref != "chunk_003" for r in res)  # irrelevant chunk has no lexical or vector signal


async def test_hybrid_filters_and_limits():
    e, chunks = await _chunks()
    q = "renewal GPA applications"
    only2 = hybrid_search(q, None, chunks, source_filter={"source_002"})
    assert all(r.chunk.source_ref == "source_002" for r in only2)
    assert all(r.vector is None for r in hybrid_search(q, None, chunks))  # no embedding -> no fake vector score
    capped = hybrid_search(q, None, chunks, top_k=5, max_context_chars=10)
    assert len(capped) == 1
    assert hybrid_search("zzzz qqqq", None, chunks) == []
