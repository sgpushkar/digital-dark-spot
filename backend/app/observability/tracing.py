"""Optional observability. Never blocks startup: missing packages or credentials simply disable that backend."""
import logging

log = logging.getLogger("dds.obs")


def setup_observability(app, settings) -> dict:
    status = {"opentelemetry": False, "langfuse": False}
    if settings.otel_exporter_otlp_endpoint:
        try:
            from opentelemetry import trace
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            provider = TracerProvider()
            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)))
            trace.set_tracer_provider(provider)
            FastAPIInstrumentor.instrument_app(app)
            status["opentelemetry"] = True
        except Exception as exc:  # noqa: BLE001
            log.warning("OpenTelemetry disabled: %s", type(exc).__name__)
    if settings.langfuse_public_key and settings.langfuse_secret_key:
        try:
            import langfuse  # noqa: F401

            status["langfuse"] = True  # credentials present and SDK importable; LLM call tracing hooks use it when enabled
        except Exception as exc:  # noqa: BLE001
            log.warning("Langfuse disabled: %s", type(exc).__name__)
    log.info("observability: %s", status)
    return status
