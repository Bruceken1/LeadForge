"""
LeadForge Agent API — FastAPI + Server-Sent Events
Deployed on Vultr VM. Connects to LeadEngine Cloudflare Worker.
"""
import asyncio, json, os, uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import asyncpg, uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.agents.supervisor import build_supervisor_graph
from agent.tools.leadengine import configure_tools
from agent.memory.vector_store import SCHEMA_SQL


# ─── Globals ──────────────────────────────────────────────────
_db_pool: Optional[asyncpg.Pool] = None
_agent_graph = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_pool, _agent_graph
    db_url = os.environ.get("DATABASE_URL", "postgresql://leadforge:leadforge@localhost:5432/leadforge")
    _db_pool = await asyncpg.create_pool(db_url, min_size=2, max_size=10)
    async with _db_pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)
    _agent_graph = build_supervisor_graph()
    print("✅ LeadForge Agent API ready — model:", os.environ.get("GROQ_FAST_MODEL", "llama-3.1-8b-instant"))
    yield
    await _db_pool.close()


app = FastAPI(title="LeadForge Agent API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ─── Schemas ──────────────────────────────────────────────────
class ICP(BaseModel):
    industry:    str   = "restaurants"
    location:    str   = "Nairobi, Kenya"
    min_rating:  float = 3.0
    keywords:    list[str] = []
    min_reviews: int   = 5

class RunRequest(BaseModel):
    campaign_goal:      str
    icp:                ICP
    org_id:             str
    org_name:           str
    leadengine_api_url: str
    leadengine_token:   str
    max_leads:          int = 20

class ApproveRequest(BaseModel):
    run_id:    str
    approved:  bool
    notes:     str = ""


# ─── Helpers ──────────────────────────────────────────────────
async def _log(run_id: str, agent: str, event_type: str, data: dict):
    async with _db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_events (run_id, agent, event_type, data) VALUES ($1,$2,$3,$4)",
            run_id, agent, event_type, json.dumps(data, default=str),
        )

async def _set_status(run_id: str, status: str, extra: dict = {}):
    async with _db_pool.acquire() as conn:
        sets = ", ".join([f"{k}=${i+2}" for i, k in enumerate(extra)])
        vals = list(extra.values())
        if sets:
            await conn.execute(f"UPDATE agent_runs SET status=$1, {sets}, updated_at=NOW() WHERE id=${len(vals)+2}", status, *vals, run_id)
        else:
            await conn.execute("UPDATE agent_runs SET status=$1, updated_at=NOW() WHERE id=$2", status, run_id)


# ─── Endpoints ────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "model": os.environ.get("GROQ_FAST_MODEL", "llama-3.1-8b-instant")}


@app.post("/api/agent/run")
async def start_run(body: RunRequest):
    run_id = str(uuid.uuid4())
    configure_tools(body.leadengine_api_url, body.leadengine_token, body.org_id)
    async with _db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_runs (id,org_id,status,campaign_goal,icp) VALUES ($1,$2,$3,$4,$5)",
            run_id, body.org_id, "running", body.campaign_goal, json.dumps(body.icp.dict()),
        )
    asyncio.create_task(_background_run(run_id, body))
    return {"run_id": run_id, "status": "started"}


@app.get("/api/agent/stream/{run_id}")
async def stream_events(run_id: str):
    """Server-Sent Events — frontend connects here for live agent activity."""
    async def gen() -> AsyncGenerator[str, None]:
        last_id = 0
        while True:
            async with _db_pool.acquire() as conn:
                run = await conn.fetchrow("SELECT status FROM agent_runs WHERE id=$1", run_id)
                if not run:
                    yield f"data: {json.dumps({'type':'error','message':'run not found'})}\n\n"
                    return
                rows = await conn.fetch(
                    "SELECT id,agent,event_type,data,created_at FROM agent_events WHERE run_id=$1 AND id>$2 ORDER BY id",
                    run_id, last_id,
                )
                for r in rows:
                    last_id = r["id"]
                    yield f"data: {json.dumps({'type':r['event_type'],'agent':r['agent'],'data':json.loads(r['data'] or '{}'),'timestamp':r['created_at'].isoformat()})}\n\n"
                status = run["status"]
                if status in ("completed", "failed", "cancelled"):
                    yield f"data: {json.dumps({'type':'done','status':status})}\n\n"
                    return
                if status == "paused_for_review":
                    yield f"data: {json.dumps({'type':'paused','status':status})}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/agent/run/{run_id}")
async def get_run(run_id: str):
    async with _db_pool.acquire() as conn:
        run = await conn.fetchrow("SELECT * FROM agent_runs WHERE id=$1", run_id)
        if not run: raise HTTPException(404, "Not found")
        events = await conn.fetch(
            "SELECT agent,event_type,data,created_at FROM agent_events WHERE run_id=$1 ORDER BY id DESC LIMIT 100",
            run_id,
        )
    return {"run": dict(run), "events": [dict(e) for e in events]}


@app.get("/api/agent/runs")
async def list_runs(org_id: str, limit: int = 20):
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM agent_runs WHERE org_id=$1 ORDER BY created_at DESC LIMIT $2",
            org_id, limit,
        )
    return [dict(r) for r in rows]


@app.post("/api/agent/approve")
async def approve(body: ApproveRequest):
    async with _db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO agent_events (run_id,agent,event_type,data) VALUES ($1,$2,$3,$4)",
            body.run_id, "human", "human_decision",
            json.dumps({"approved": body.approved, "notes": body.notes}),
        )
        new_status = "running" if body.approved else "running"
        await conn.execute("UPDATE agent_runs SET status=$1 WHERE id=$2", new_status, body.run_id)
    return {"ok": True}


@app.delete("/api/agent/run/{run_id}")
async def cancel_run(run_id: str):
    await _set_status(run_id, "cancelled")
    return {"ok": True}


# ─── Background agent runner ──────────────────────────────────
async def _background_run(run_id: str, body: RunRequest):
    try:
        configure_tools(body.leadengine_api_url, body.leadengine_token, body.org_id)

        user_message = (
            f"Campaign: {body.campaign_goal}\n"
            f"ICP: {body.icp.industry} in {body.icp.location}, "
            f"min rating {body.icp.min_rating}, max {body.max_leads} leads.\n"
            f"Org: {body.org_name}\n\n"
            f"Begin: scrape {body.icp.industry} businesses in {body.icp.location}, "
            f"enrich emails, qualify against ICP, write personalised outreach, then send."
        )

        config = {"configurable": {"thread_id": run_id}}

        await _log(run_id, "supervisor", "started", {"goal": body.campaign_goal, "icp": body.icp.dict()})
        print(f"[{run_id}] Starting agent run...")

        chunk_count = 0
        async for chunk in _agent_graph.astream(
            {"messages": [{"role": "user", "content": user_message}]},
            config=config,
            stream_mode="updates",
        ):
            chunk_count += 1
            print(f"[{run_id}] Chunk #{chunk_count}: keys={list(chunk.keys())}")

            for node_name, node_output in chunk.items():
                print(f"[{run_id}]   Node '{node_name}': type={type(node_output).__name__}")

                if not isinstance(node_output, dict):
                    print(f"[{run_id}]   Skipping — not a dict")
                    continue

                messages = node_output.get("messages", [])
                print(f"[{run_id}]   Messages count: {len(messages)}")

                if not messages:
                    continue

                for msg in messages:
                    content = getattr(msg, "content", "") or ""
                    msg_type = type(msg).__name__
                    agent_name = getattr(msg, "name", node_name) or node_name
                    print(f"[{run_id}]   Msg type={msg_type} name={agent_name} content_len={len(content)}")

                    if content:
                        await _log(run_id, agent_name, "message", {"content": str(content)[:800]})

                        if "HIGH_VALUE" in content or "human review" in content.lower():
                            await _set_status(run_id, "paused_for_review")
                            await _log(run_id, "supervisor", "paused", {
                                "message": "High-value lead detected — awaiting human approval"
                            })

        print(f"[{run_id}] Graph completed. Total chunks: {chunk_count}")
        await _set_status(run_id, "completed")
        await _log(run_id, "supervisor", "completed", {"message": f"All leads processed ({chunk_count} graph chunks)"})

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[{run_id}] EXCEPTION: {e}\n{tb}")
        await _set_status(run_id, "failed")
        await _log(run_id, "supervisor", "error", {"message": str(e)[:500], "traceback": tb[:1000]})


if __name__ == "__main__":
    uvicorn.run("api.main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)),
                reload=False, workers=1)
