from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models as M
from app.demo.fixtures import DEMO_AS_OF, DEMO_OBJECTIVE, DEMO_QUESTION, DEMO_SOURCES


def demo_url(slug: str) -> str:
    return f"demo://fixtures/{slug}"


def demo_html_map() -> dict[str, str]:
    return {demo_url(s["slug"]): s["html"] for s in DEMO_SOURCES}


async def create_demo_session(db: AsyncSession) -> M.ResearchSession:
    sess = M.ResearchSession(
        title="[DEMO] Meridian Excellence Scholarship — what to verify", research_question=DEMO_QUESTION,
        research_objective=DEMO_OBJECTIVE, topic="Meridian Excellence Scholarship", status="ready", is_demo=True, as_of_date=DEMO_AS_OF)
    db.add(sess)
    await db.flush()
    for i, s in enumerate(DEMO_SOURCES, start=1):
        db.add(M.Source(research_session_id=sess.id, ref=f"source_{i:03d}", url=demo_url(s["slug"]), domain="demo.fixture",
                        source_type=s["source_type"], extraction_status="pending", extra={"demo": True}))
    await db.commit()
    return sess
