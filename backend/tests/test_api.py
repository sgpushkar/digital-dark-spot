import asyncio

import httpx
import pytest

from app.config import Settings
from app.main import create_app


@pytest.fixture
async def client(ctx_factory):
    ctx = ctx_factory()
    app = create_app(Settings(rate_limit_per_minute=0), ctx=ctx)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            yield c


async def wait_done(c, sid, timeout=20):
    for _ in range(timeout * 10):
        s = (await c.get(f"/api/research/{sid}/status")).json()
        if s["status"] != "running":
            return s
        await asyncio.sleep(0.1)
    raise AssertionError("analysis did not finish")


async def demo_run(c):
    sid = (await c.post("/api/demo")).json()["id"]
    assert (await c.post(f"/api/research/{sid}/analyze")).status_code == 202
    return sid, await wait_done(c, sid)


async def test_validation_and_errors(client):
    r = await client.post("/api/research", json={"research_question": "x"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert (await client.get("/api/research/nope")).status_code == 404
    sid = (await client.post("/api/research", json={"research_question": "What should I check before buying a laptop?"})).json()["id"]
    r = await client.post(f"/api/research/{sid}/analyze")
    assert r.status_code == 422 and "source" in r.json()["error"]["message"]


async def test_ssrf_urls_rejected_at_submission(client):
    sid = (await client.post("/api/research", json={"research_question": "What should I check before buying a laptop?"})).json()["id"]
    r = await client.post(f"/api/research/{sid}/sources", json={"sources": [{"url": "http://127.0.0.1/x"}, {"url": "http://169.254.169.254/"}, {"url": "ftp://a.com/x"}]})
    assert r.status_code == 201 and r.json()["added"] == 0
    assert {x["status"] for x in r.json()["results"]} == {"rejected"}


async def test_upload_validation_and_dedupe(client):
    sid = (await client.post("/api/research", json={"research_question": "What are the renewal terms of this award?"})).json()["id"]
    bad = await client.post(f"/api/research/{sid}/documents", files={"file": ("x.exe", b"MZ....", "application/octet-stream")})
    assert bad.status_code == 422
    fake_pdf = await client.post(f"/api/research/{sid}/documents", files={"file": ("x.pdf", b"hello", "application/pdf")})
    assert fake_pdf.status_code == 422
    ok = await client.post(f"/api/research/{sid}/documents", files={"file": ("notes.txt", b"Applications close on 3 March 2027. The award is $5,000 per year.", "text/plain")})
    assert ok.status_code == 201 and ok.json()["extraction_status"] == "done" and ok.json()["publication_date"] is None
    dup = await client.post(f"/api/research/{sid}/documents", files={"file": ("again.txt", b"Applications close on 3 March 2027. The award is $5,000 per year.", "text/plain")})
    assert dup.status_code == 422 and "Duplicate" in dup.json()["error"]["message"]


async def test_full_demo_workflow_over_http(client):
    sid, status = await demo_run(client)
    assert status["status"] == "completed" and all(s["status"] == "completed" for s in status["stages"])
    sources = (await client.get(f"/api/research/{sid}/sources")).json()
    assert sources["total"] == 4 and all(s["link"] and s["is_demo"] for s in sources["items"])
    cov = (await client.get(f"/api/research/{sid}/coverage")).json()["items"]
    assert {c["category"]: c["status"] for c in cov}["renewal_conditions"] == "NOT_FOUND"

    cons = (await client.get(f"/api/research/{sid}/contradictions")).json()
    assert cons["total"] == 1
    item = cons["items"][0]
    assert len(item["claims"]) == 2 and all(c["evidence_quote"] and c["source"]["link"] for c in item["claims"])
    assert any(n["kind"] == "scope_difference" for n in cons["examined_but_not_conflicts"])

    # evidence trail: click a conflicting claim -> source, passage, related claim, finding, task
    ref = item["claims"][0]["ref"]
    ev = (await client.get(f"/api/research/{sid}/evidence/{ref}")).json()
    assert ev["passage"]["text"] and ev["source"]["ref"] and ev["related_claims"][0]["relationship"] == "CLAIM_CONTRADICTS_CLAIM"
    assert ev["findings"][0]["finding_type"] == "contradiction" and ev["tasks"]

    # user marks conflict reviewed WITHOUT rewriting source claims
    f = (await client.patch(f"/api/findings/{item['id']}", json={"verification_status": "reviewed", "user_note": "Emailed the office"})).json()
    assert f["verification_status"] == "reviewed"
    again = (await client.get(f"/api/research/{sid}/evidence/{ref}")).json()
    assert again["claim"]["object"] == ev["claim"]["object"]

    # checklist: complete, annotate, reopen
    tasks = (await client.get(f"/api/research/{sid}/checklist")).json()["items"]
    t = tasks[0]
    done = (await client.patch(f"/api/checklist/{t['id']}", json={"status": "COMPLETED", "notes": "confirmed by phone"})).json()
    assert done["status"] == "COMPLETED" and done["completed_at"] and done["notes"] == "confirmed by phone"
    assert (await client.patch(f"/api/checklist/{t['id']}", json={"status": "PENDING"})).json()["completed_at"] is None
    assert (await client.patch(f"/api/checklist/{t['id']}", json={"status": "bogus"})).status_code == 422

    rep = (await client.get(f"/api/research/{sid}/report")).json()
    for key in ["research_objective", "sources_reviewed", "executive_summary", "key_extracted_information", "information_coverage",
                "potential_information_gaps", "possible_contradictions", "potentially_outdated_information", "unanswered_questions",
                "verification_checklist", "limitations_and_uncertainty"]:
        assert key in rep
    assert rep["is_demo"] and rep["completeness"]["score"] > 0

    g = (await client.get(f"/api/research/{sid}/graph")).json()
    kinds = {e["type"] for e in g["edges"]}
    assert {"SOURCE_SUPPORTS_CLAIM", "FINDING_REFERENCES_CLAIM", "TASK_RESOLVES_FINDING", "CLAIM_CONTRADICTS_CLAIM"} <= kinds

    hits = (await client.get(f"/api/research/{sid}/search", params={"q": "application deadline november"})).json()
    assert hits["semantic_embeddings"] is False and hits["items"][0]["scores"]["bm25"] > 0

    page = (await client.get(f"/api/research/{sid}/claims", params={"category": "application_deadline", "limit": 1})).json()
    assert page["total"] == 3 and len(page["items"]) == 1


async def test_concurrent_analyze_rejected_and_demo_fixture_link(client):
    sid = (await client.post("/api/demo")).json()["id"]
    await client.post(f"/api/research/{sid}/analyze")
    assert (await client.post(f"/api/research/{sid}/analyze")).status_code == 409
    await wait_done(client, sid)
    html = await client.get("/api/demo/fixtures/official-guidelines")
    assert html.status_code == 200 and "DEMONSTRATION DATA" in html.text


async def test_unfetchable_sources_fail_transparently(client, maker):
    sid = (await client.post("/api/research", json={"research_question": "What are the terms of the Orion Grant?"})).json()["id"]
    from app.db import models as M
    async with maker() as db:
        db.add(M.Source(research_session_id=sid, ref="source_001", url="https://nonexistent.invalid/x", domain="nonexistent.invalid", extraction_status="pending"))
        await db.commit()
    await client.post(f"/api/research/{sid}/analyze")
    st = await wait_done(client, sid)
    assert st["status"] == "completed_with_errors"
    by = {s["stage"]: s for s in st["stages"]}
    assert by["content_extraction"]["status"] == "completed" and by["claim_extraction"]["status"] == "skipped"
    assert by["report_generation"]["status"] == "completed"
    assert any(e["stage"] == "source_collection" for e in st["errors"])
    src = (await client.get(f"/api/research/{sid}/sources")).json()["items"][0]
    assert src["extraction_status"] == "failed" and src["error_message"]
