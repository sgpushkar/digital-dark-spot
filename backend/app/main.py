import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import install_error_handlers
from app.api.ratelimit import RateLimitMiddleware
from app.api.routes import router
from app.config import Settings, get_settings
from app.db.session import create_all, get_maker, init_engine
from app.llm.providers import build_llm
from app.observability.tracing import setup_observability
from app.retrieval.embeddings import build_embedder
from app.services.demo import demo_html_map
from app.services.events import EventBus
from app.services.pipeline import Ctx


def create_app(settings: Settings | None = None, *, ctx: Ctx | None = None, auto_create_tables: bool = False) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if ctx is None:
            init_engine(settings.database_url)
            if auto_create_tables:
                await create_all()
            app.state.ctx = Ctx(settings=settings, maker=get_maker(), bus=EventBus(redis_url=settings.redis_url), embedder=build_embedder(settings),
                                llm=build_llm(settings), demo_html=demo_html_map())
        else:
            app.state.ctx = ctx
        setup_observability(app, settings)
        yield

    app = FastAPI(title="Digital Dark Spot API", version="1.0.0", lifespan=lifespan,
                  description="Information-gap detection: what the sources establish, what is missing, what conflicts, what to verify next.")
    app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["*"])
    install_error_handlers(app)
    app.include_router(router)
    return app


app = create_app(auto_create_tables=True)
