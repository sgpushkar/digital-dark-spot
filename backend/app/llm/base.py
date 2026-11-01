"""LLM provider abstraction: provider adapters return raw text; StructuredLLM owns retries,
JSON extraction, Pydantic validation and bounded repair. Nothing else in the app talks to a provider."""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

log = logging.getLogger("dds.llm")
T = TypeVar("T", bound=BaseModel)


class LLMUnavailable(Exception):
    """No provider configured, or the provider is unreachable."""


class LLMOutputError(Exception):
    """Provider answered but the output could not be validated even after repair."""


@dataclass
class RawResponse:
    text: str
    tokens_in: int | None = None
    tokens_out: int | None = None


class ProviderAdapter(Protocol):
    name: str
    model: str

    async def complete(self, system: str, user: str, *, max_tokens: int, temperature: float) -> RawResponse: ...


@dataclass
class LLMUsage:
    calls: int = 0
    retries: int = 0
    repairs: int = 0
    failures: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    total_latency_ms: int = 0
    by_stage: dict[str, int] = field(default_factory=dict)

    def snapshot(self) -> dict:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.I)


def extract_json(text: str):
    """Tolerates code fences and leading/trailing prose around a single JSON value."""
    text = _FENCE.sub("", text.strip()).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        s, e = text.find(open_c), text.rfind(close_c)
        if s != -1 and e > s:
            try:
                return json.loads(text[s : e + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("no valid JSON found in model output")


class StructuredLLM:
    def __init__(self, adapter: ProviderAdapter, *, max_tokens: int, temperature: float, max_retries: int):
        self.adapter = adapter
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.max_retries = max_retries
        self.usage = LLMUsage()

    @property
    def provider(self) -> str:
        return self.adapter.name

    @property
    def model(self) -> str:
        return self.adapter.model

    async def _call(self, system: str, user: str, stage: str) -> str:
        last: Exception | None = None
        for attempt in range(self.max_retries + 1):
            t0 = time.perf_counter()
            try:
                resp = await self.adapter.complete(system, user, max_tokens=self.max_tokens, temperature=self.temperature)
            except LLMUnavailable:
                raise
            except Exception as exc:  # noqa: BLE001 - transport/provider errors are retried, bounded
                last = exc
                self.usage.retries += 1
                log.warning("llm call failed (%s) attempt %s: %s", stage, attempt + 1, type(exc).__name__)
                continue
            self.usage.calls += 1
            self.usage.by_stage[stage] = self.usage.by_stage.get(stage, 0) + 1
            self.usage.total_latency_ms += int((time.perf_counter() - t0) * 1000)
            self.usage.tokens_in += resp.tokens_in or 0
            self.usage.tokens_out += resp.tokens_out or 0
            return resp.text
        self.usage.failures += 1
        raise LLMUnavailable(f"provider call failed after {self.max_retries + 1} attempts: {type(last).__name__}")

    async def generate(self, system: str, user: str, schema: type[T], *, stage: str) -> T:
        schema_hint = json.dumps(schema.model_json_schema())
        full_system = (
            f"{system}\n\nRespond with ONE JSON value only, no prose, matching this JSON Schema:\n{schema_hint}"
        )
        raw = await self._call(full_system, user, stage)
        try:
            return schema.model_validate(extract_json(raw))
        except (ValueError, ValidationError) as first_err:
            self.usage.repairs += 1
            log.warning("llm output invalid (%s); attempting one repair", stage)
            repair_user = (
                f"{user}\n\nYour previous answer was invalid: {str(first_err)[:600]}\n"
                f"Previous answer:\n{raw[:2000]}\nReturn corrected JSON only."
            )
            raw2 = await self._call(full_system, repair_user, stage)
            try:
                return schema.model_validate(extract_json(raw2))
            except (ValueError, ValidationError) as second_err:
                self.usage.failures += 1
                raise LLMOutputError(f"{stage}: output failed validation after repair: {str(second_err)[:300]}") from second_err
