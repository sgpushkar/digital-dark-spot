"""Explainable hybrid retrieval: BM25 keyword ranking + vector cosine ranking, fused with
Reciprocal Rank Fusion. Every returned score is a real computed value; none are invented."""
from __future__ import annotations

import math
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from app.retrieval.embeddings import tokenize


@dataclass
class IndexedChunk:
    ref: str
    source_ref: str
    url: str
    content: str
    embedding: list[float] | None
    page_number: int | None = None
    section_heading: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class RetrievedPassage:
    chunk: IndexedChunk
    bm25: float
    vector: float | None
    rrf: float
    bm25_rank: int | None
    vector_rank: int | None
    matched_terms: list[str]


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def bm25_scores(query_terms: list[str], docs: list[list[str]], k1: float = 1.5, b: float = 0.75) -> list[float]:
    n = len(docs)
    if n == 0:
        return []
    avgdl = sum(len(d) for d in docs) / n or 1.0
    df: Counter = Counter()
    for d in docs:
        df.update(set(d))
    scores = []
    for d in docs:
        tf = Counter(d)
        s = 0.0
        for t in set(query_terms):
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * (tf[t] * (k1 + 1)) / (tf[t] + k1 * (1 - b + b * len(d) / avgdl))
        scores.append(s)
    return scores


def hybrid_search(
    query: str,
    query_embedding: list[float] | None,
    chunks: list[IndexedChunk],
    *,
    top_k: int = 8,
    rrf_k: int = 60,
    min_vector_score: float = 0.12,
    max_context_chars: int | None = None,
    source_filter: set[str] | None = None,
    metadata_filter: Callable[[IndexedChunk], bool] | None = None,
    reranker: Callable[[str, list[RetrievedPassage]], list[RetrievedPassage]] | None = None,
) -> list[RetrievedPassage]:
    pool = [
        c for c in chunks
        if (not source_filter or c.source_ref in source_filter) and (metadata_filter is None or metadata_filter(c))
    ]
    if not pool:
        return []
    q_terms = tokenize(query)
    docs = [tokenize(c.content) for c in pool]
    bm = bm25_scores(q_terms, docs)
    vec = [cosine(query_embedding, c.embedding) if query_embedding and c.embedding else None for c in pool]

    bm_order = [i for i in sorted(range(len(pool)), key=lambda i: -bm[i]) if bm[i] > 0]
    vec_order = [i for i in sorted(range(len(pool)), key=lambda i: -(vec[i] or -1)) if vec[i] is not None and vec[i] >= min_vector_score]
    bm_rank = {i: r for r, i in enumerate(bm_order, start=1)}
    vec_rank = {i: r for r, i in enumerate(vec_order, start=1)}

    results: list[RetrievedPassage] = []
    qset = set(q_terms)
    for i, c in enumerate(pool):
        if i not in bm_rank and i not in vec_rank:
            continue
        rrf = (1 / (rrf_k + bm_rank[i]) if i in bm_rank else 0) + (1 / (rrf_k + vec_rank[i]) if i in vec_rank else 0)
        results.append(
            RetrievedPassage(c, round(bm[i], 6), None if vec[i] is None else round(vec[i], 6), round(rrf, 8),
                             bm_rank.get(i), vec_rank.get(i), sorted(qset & set(docs[i])))
        )
    results.sort(key=lambda r: -r.rrf)
    if reranker:
        results = reranker(query, results)
    results = results[:top_k]
    if max_context_chars is not None:
        kept, total = [], 0
        for r in results:
            if total + len(r.chunk.content) > max_context_chars and kept:
                break
            kept.append(r)
            total += len(r.chunk.content)
        results = kept
    return results
