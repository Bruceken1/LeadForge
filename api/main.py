"""
LeadForge Agent API — FastAPI + Server-Sent Events
"""
import asyncio, json, os, re, uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

import asyncpg, uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.agents.supervisor import build_supervisor_graph
from agent.tools.leadengine import (
    configure_tools,
    send_email_to_lead,
    send_whatsapp_to_lead,
    update_lead_status,
)
from agent.memory.vector_store import SCHEMA_SQL


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
    print("✅ LeadForge Agent API ready")
    print(f"   fast model  : {os.environ.get('GROQ_FAST_MODEL',  'llama-3.1-8b-instant')}")
    print(f"   smart model : {os.environ.get('GROQ_SMART_MODEL', 'llama-3.3-70b-versatile')}")
    yield
    await _db_pool.close()


app = FastAPI(title="LeadForge Agent API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ICP(BaseModel):
    industry:    str       = "restaurants"
    location:    str       = "Nairobi, Kenya"
    min_rating:  float     = 3.0
    keywords:    list[str] = []
    min_reviews: int       = 5

class RunRequest(BaseModel):
    campaign_goal:      str
    icp:                ICP
    org_id:             str
    org_name:           str
    leadengine_api_url: str
    leadengine_token:   str
    max_leads:          int = 20

class ApproveRequest(BaseModel):
    run_id:   str
    approved: bool
    notes:    str = ""


async def _log(run_id: str, agent: str, event_type: str, data: dict):
    try:
        async with _db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO agent_events (run_id, agent, event_type, data) VALUES ($1,$2,$3,$4)",
                run_id, agent, event_type, json.dumps(data, default=str),
            )
    except Exception as e:
        print(f"[{run_id}] _log error: {e}")


async def _set_status(run_id: str, status: str, extra: dict = {}):
    try:
        async with _db_pool.acquire() as conn:
            if extra:
                sets = ", ".join([f"{k}=${i+2}" for i, k in enumerate(extra)])
                vals = list(extra.values())
                await conn.execute(
                    f"UPDATE agent_runs SET status=$1, {sets}, updated_at=NOW() WHERE id=${len(vals)+2}",
                    status, *vals, run_id,
                )
            else:
                await conn.execute(
                    "UPDATE agent_runs SET status=$1, updated_at=NOW() WHERE id=$2",
                    status, run_id,
                )
    except Exception as e:
        print(f"[{run_id}] _set_status error: {e}")


def _extract_content(msg: Any) -> str:
    content = getattr(msg, "content", "") or ""
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    parts.append(f"[tool:{block.get('name')}]")
            else:
                parts.append(str(block))
        content = " ".join(p for p in parts if p).strip()
    if not content:
        tool_calls = getattr(msg, "tool_calls", []) or []
        if tool_calls:
            content = "Calling: " + " | ".join(
                f"{tc.get('name')}({json.dumps(tc.get('args', {}), default=str)[:60]})"
                for tc in tool_calls
            )
    return content


def _parse_outreach_packages(messages: list) -> list[dict]:
    """
    Parse outreach packages directly from the personalization agent's message text.
    Returns list of dicts with lead_id, name, email, phone, subject, body, whatsapp.
    """
    packages = []
    full_text = ""
    for msg in messages:
        name = getattr(msg, "name", "") or ""
        if "personalization" in name or "personalizer" in name:
            full_text += _extract_content(msg) + "\n"

    if not full_text:
        # Fall back to scanning all messages for outreach packages
        for msg in messages:
            content = _extract_content(msg)
            if "EMAIL_SUBJECT" in content or "OUTREACH PACKAGE" in content:
                full_text += content + "\n"

    # Split into individual packages
    blocks = re.split(r"===\s*OUTREACH PACKAGE\s*===", full_text)
    for block in blocks[1:]:  # skip text before first package
        pkg = {}

        def _field(pattern, text):
            m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            return m.group(1).strip() if m else ""

        pkg["lead_id"]  = _field(r"lead_id[:\s]+(\S+)", block)
        pkg["name"]     = _field(r"name[:\s]+(.+?)(?:\n|email)", block)
        pkg["email"]    = _field(r"email[:\s]+(\S+@\S+)", block)
        pkg["phone"]    = _field(r"phone[:\s]+(\+?\d[\d\s]+)", block)
        pkg["subject"]  = _field(r"EMAIL_SUBJECT[:\s]+(.+?)(?:\n)", block)
        pkg["body"]     = _field(r"EMAIL_BODY[:\s]+(.+?)(?:WHATSAPP|FOLLOW_UP|={3})", block)
        pkg["whatsapp"] = _field(r"WHATSAPP[:\s]+(.+?)(?:FOLLOW_UP|={3}|$)", block)

        if pkg.get("email") and "@" in pkg["email"]:
            packages.append(pkg)

    return packages


@app.get("/health")
async def health():
    return {"status": "ok",
            "fast_model":  os.environ.get("GROQ_FAST_MODEL",  "llama-3.1-8b-instant"),
            "smart_model": os.environ.get("GROQ_SMART_MODEL", "llama-3.3-70b-versatile")}


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
    async def gen() -> AsyncGenerator[str, None]:
        last_id = 0
        while True:
            async with _db_pool.acquire() as conn:
                run = await conn.fetchrow("SELECT status FROM agent_runs WHERE id=$1", run_id)
                if not run:
                    yield f"data: {json.dumps({'type':'error','message':'run not found'})}\n\n"
                    return
                rows = await conn.fetch(
                    "SELECT id,agent,event_type,data,created_at FROM agent_events "
                    "WHERE run_id=$1 AND id>$2 ORDER BY id",
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
        if not run:
            raise HTTPException(404, "Not found")
        events = await conn.fetch(
            "SELECT agent,event_type,data,created_at FROM agent_events "
            "WHERE run_id=$1 ORDER BY id DESC LIMIT 100", run_id,
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
        await conn.execute(
            "UPDATE agent_runs SET status='running', updated_at=NOW() WHERE id=$1", body.run_id,
        )
    return {"ok": True}


@app.delete("/api/agent/run/{run_id}")
async def cancel_run(run_id: str):
    await _set_status(run_id, "cancelled")
    return {"ok": True}


async def _execute_outreach(run_id: str, packages: list[dict], sender_email: str, sender_name: str):
    """
    Send emails and WhatsApp messages directly via Python — no LLM involved.
    This guarantees real tool calls regardless of what the executor LLM would do.
    """
    emails_sent, wa_sent, bounced = 0, 0, []

    for pkg in packages:
        name    = pkg.get("name", "Lead")
        email   = pkg.get("email", "")
        phone   = pkg.get("phone", "")
        subject = pkg.get("subject", "")
        body    = pkg.get("body", "")
        wa_msg  = pkg.get("whatsapp", "")
        lead_id = pkg.get("lead_id", "")

        await _log(run_id, "executor_agent", "message",
                   {"content": f"Sending outreach to {name} ({email})"})

        # Send email
        if email and "@" in email and subject and body:
            result = send_email_to_lead.func(
                recipient_email=email,
                subject=subject,
                body=body,
                sender_email=sender_email,
                sender_name=sender_name,
            )
            await _log(run_id, "executor_agent", "tool_result",
                       {"content": f"Email to {email}: {result}"})
            if "Message ID" in result or "sent" in result.lower():
                emails_sent += 1
                if lead_id:
                    update_lead_status.func(lead_id=lead_id, status="contacted")
            elif "BOUNCE" in result.upper():
                bounced.append(name)
                if lead_id:
                    update_lead_status.func(lead_id=lead_id, status="bounced")

        # Send WhatsApp
        if phone and wa_msg:
            result = send_whatsapp_to_lead.func(phone=phone, message=wa_msg)
            await _log(run_id, "executor_agent", "tool_result",
                       {"content": f"WhatsApp to {phone}: {result}"})
            if "SID" in result or "sent" in result.lower():
                wa_sent += 1

    summary = (
        f"=== EXECUTION REPORT ===\n"
        f"Emails sent: {emails_sent}\n"
        f"WhatsApp sent: {wa_sent}\n"
        f"Bounced: {len(bounced)} ({', '.join(bounced) if bounced else 'none'})\n"
        f"========================"
    )
    await _log(run_id, "executor_agent", "message", {"content": summary})
    return emails_sent, wa_sent


async def _background_run(run_id: str, body: RunRequest):
    try:
        configure_tools(body.leadengine_api_url, body.leadengine_token, body.org_id)

        sender_email = os.environ.get("SENDER_EMAIL", "outreach@dime-solutions.co.ke")
        sender_name  = os.environ.get("SENDER_NAME",  "Dimes Solutions")

        user_message = (
            f"Campaign: {body.campaign_goal}\n"
            f"Industry: {body.icp.industry} | Location: {body.icp.location} | "
            f"Max leads: {body.max_leads} | Min rating: {body.icp.min_rating}\n"
            f"Org: {body.org_name}\n\n"
            f"Run the 3-step pipeline: research_agent → qualifier_agent → personalization_agent."
        )

        config = {"configurable": {"thread_id": run_id}, "recursion_limit": 25}

        await _log(run_id, "supervisor", "started", {
            "goal": body.campaign_goal, "icp": body.icp.dict(),
        })
        print(f"[{run_id}] Starting 3-step pipeline")

        all_messages = []
        chunk_count = 0

        async for chunk in _agent_graph.astream(
            {"messages": [{"role": "user", "content": user_message}]},
            config=config,
            stream_mode="updates",
        ):
            chunk_count += 1
            for node_name, node_output in chunk.items():
                if not isinstance(node_output, dict):
                    continue
                messages = node_output.get("messages", [])
                all_messages.extend(messages)
                for msg in messages:
                    msg_type   = type(msg).__name__
                    agent_name = (getattr(msg, "name", None) or node_name or "").strip() or node_name
                    content    = _extract_content(msg)
                    print(f"[{run_id}]  {agent_name}: {content[:150]!r}")
                    if not content or msg_type == "HumanMessage":
                        continue
                    event_type = (
                        "tool_result" if msg_type == "ToolMessage"
                        else "tool_call" if getattr(msg, "tool_calls", None)
                        else "message"
                    )
                    await _log(run_id, agent_name, event_type, {"content": content[:2000]})

        print(f"[{run_id}] Pipeline done ({chunk_count} chunks). Executing outreach directly...")

        # Parse packages and execute sends in Python — no LLM
        packages = _parse_outreach_packages(all_messages)
        print(f"[{run_id}] Found {len(packages)} outreach packages to send")

        if packages:
            emails_sent, wa_sent = await _execute_outreach(
                run_id, packages, sender_email, sender_name
            )
        else:
            emails_sent, wa_sent = 0, 0
            await _log(run_id, "executor_agent", "message",
                       {"content": "No outreach packages found to send."})

        await _set_status(run_id, "completed")
        await _log(run_id, "supervisor", "completed", {
            "message": f"Pipeline complete. Emails: {emails_sent}, WhatsApp: {wa_sent}"
        })

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[{run_id}] EXCEPTION: {e}\n{tb}")
        await _set_status(run_id, "failed")
        await _log(run_id, "supervisor", "error", {
            "message": str(e)[:500], "traceback": tb[:1500],
        })


if __name__ == "__main__":
    uvicorn.run("api.main:app", host="0.0.0.0",
                port=int(os.environ.get("PORT", 8000)), reload=False, workers=1)
