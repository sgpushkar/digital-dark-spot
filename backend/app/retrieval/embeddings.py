"""Embedding providers. The default `hash` embedder is a deterministic feature-hashing baseline:
it captures lexical overlap (unigrams + bigrams), NOT deep semantics, and is labelled as such everywhere."""
import hashlib
import math
import re
from typing import Protocol

import httpx

from app.config import Settings

_TOKEN = re.compile(r"[a-z0-9₹$€£%]+")
STOP = {"the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "is", "are", "be", "by", "with", "at", "as", "it", "this", "that"}


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in STOP]


class Embedder(Protocol):
    name: str
    dim: int
    semantic: bool

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class HashEmbedder:
    name = "hash-v1"
    semantic = False

    def __init__(self, dim: int = 384):
        self.dim = dim

    def _vec(self, text: str) -> list[float]:
        toks = tokenize(text)
        feats = toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]
        v = [0.0] * self.dim
        for f in feats:
            h = int.from_bytes(hashlib.blake2b(f.encode(), digest_size=8).digest(), "big")
            v[h % self.dim] += 1.0 if (h >> 63) & 1 else -1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]


class OpenAIEmbedder:  # not exercised offline (needs a key)
    semantic = True

    def __init__(self, api_key: str, model: str, dim: int, base_url: str = ""):
        self.api_key, self.model, self.dim = api_key, model, dim
        self.name = f"openai:{model}"
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                f"{self.base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": texts, "dimensions": self.dim},
            )
            r.raise_for_status()
        return [d["embedding"] for d in sorted(r.json()["data"], key=lambda d: d["index"])]


class GeminiEmbedder:  # not exercised offline (needs a key)
    semantic = True

    def __init__(self, api_key: str, model: str, dim: int):
        self.api_key, self.model, self.dim = api_key, model, dim
        self.name = f"gemini:{model}"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:batchEmbedContents"
        reqs = [
            {"model": f"models/{self.model}", "content": {"parts": [{"text": t}]}, "outputDimensionality": self.dim}
            for t in texts
        ]
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(url, headers={"x-goog-api-key": self.api_key}, json={"requests": reqs})
            r.raise_for_status()
        return [e["values"] for e in r.json()["embeddings"]]


def build_embedder(settings: Settings) -> Embedder:
    p = settings.embedding_provider.lower()
    if p == "openai" and settings.llm_api_key and settings.embedding_model:
        return OpenAIEmbedder(settings.llm_api_key, settings.embedding_model, settings.embedding_dim, settings.llm_base_url)
    if p == "gemini" and settings.llm_api_key and settings.embedding_model:
        return GeminiEmbedder(settings.llm_api_key, settings.embedding_model, settings.embedding_dim)
    return HashEmbedder(settings.embedding_dim)
