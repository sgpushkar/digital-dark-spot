"""Gemini and OpenAI-compatible adapters over plain HTTPX (no vendor SDK lock-in).
NOTE: these are implemented against the public REST contracts but are not exercised in the offline
test-suite (no API keys in CI); tests use a fake adapter."""
import httpx

from app.config import Settings
from app.llm.base import LLMUnavailable, ProviderAdapter, RawResponse, StructuredLLM


class OpenAIAdapter:
    name = "openai"

    def __init__(self, api_key: str, model: str, base_url: str = "", timeout: float = 60.0):
        self.api_key, self.model, self.timeout = api_key, model, timeout
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    async def complete(self, system: str, user: str, *, max_tokens: int, temperature: float) -> RawResponse:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "response_format": {"type": "json_object"},
                },
            )
            r.raise_for_status()
            data = r.json()
        usage = data.get("usage", {})
        return RawResponse(data["choices"][0]["message"]["content"], usage.get("prompt_tokens"), usage.get("completion_tokens"))


class GeminiAdapter:
    name = "gemini"

    def __init__(self, api_key: str, model: str, timeout: float = 60.0):
        self.api_key, self.model, self.timeout = api_key, model, timeout

    async def complete(self, system: str, user: str, *, max_tokens: int, temperature: float) -> RawResponse:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(
                url,
                headers={"x-goog-api-key": self.api_key},
                json={
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": [{"text": user}]}],
                    "generationConfig": {
                        "temperature": temperature,
                        "maxOutputTokens": max_tokens,
                        "responseMimeType": "application/json",
                    },
                },
            )
            r.raise_for_status()
            data = r.json()
        parts = data["candidates"][0]["content"]["parts"]
        meta = data.get("usageMetadata", {})
        return RawResponse("".join(p.get("text", "") for p in parts), meta.get("promptTokenCount"), meta.get("candidatesTokenCount"))


def build_llm(settings: Settings) -> StructuredLLM | None:
    """Returns None when no provider is configured. Callers must then use their documented
    deterministic fallback and record that no LLM was used - never pretend one ran."""
    provider = settings.llm_provider.lower().strip()
    if provider in ("", "none") or not settings.llm_api_key or not settings.llm_model:
        return None
    adapter: ProviderAdapter
    if provider == "openai":
        adapter = OpenAIAdapter(settings.llm_api_key, settings.llm_model, settings.llm_base_url, settings.llm_timeout_s)
    elif provider == "gemini":
        adapter = GeminiAdapter(settings.llm_api_key, settings.llm_model, settings.llm_timeout_s)
    else:
        raise LLMUnavailable(f"Unknown LLM_PROVIDER '{settings.llm_provider}' (expected gemini, openai or none)")
    return StructuredLLM(adapter, max_tokens=settings.llm_max_tokens, temperature=settings.llm_temperature, max_retries=settings.llm_max_retries)
