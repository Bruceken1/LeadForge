"""
LeadForge Agent API — FastAPI + Server-Sent Events
"""
import asyncio, json, os, re, uuid
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

import asyncpg, uvicorn
from fastapi import FastAPI, HTTPException, Request
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

# Additional tables needed for the Autonomous SDR dashboard
AUTONOMOUS_SCHEMA = """
CREATE TABLE IF NOT EXISTS icp_configs (
    id              SERIAL PRIMARY KEY,
    org_id          TEXT NOT NULL,
    org_name        TEXT,
    industry        TEXT NOT NULL,
    location        TEXT NOT NULL,
    min_rating      FLOAT DEFAULT 3.5,
    min_reviews     INT DEFAULT 5,
    campaign_goal   TEXT,
    max_leads       INT DEFAULT 20,
    active          BOOLEAN DEFAULT true,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buy_signals (
    id              SERIAL PRIMARY KEY,
    source          TEXT,
    signal_type     TEXT,
    data            JSONB,
    priority_boost  INT DEFAULT 0,
    processed       BOOLEAN DEFAULT false,
    processed_at    TIMESTAMPTZ,
    detected_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_queue (
    id              SERIAL PRIMARY KEY,
    type            TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          TEXT DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    org_id          TEXT,
    lead_id         TEXT,
    type            TEXT,
    message         TEXT,
    read            BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetings (
    id              SERIAL PRIMARY KEY,
    org_id          TEXT,
    lead_id         TEXT,
    lead_name       TEXT,
    lead_email      TEXT,
    booking_id      TEXT UNIQUE,
    meeting_datetime TEXT,
    duration_minutes INT DEFAULT 30,
    status          TEXT DEFAULT 'scheduled',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icp_org ON icp_configs(org_id, active);
CREATE INDEX IF NOT EXISTS idx_buy_signals_unprocessed ON buy_signals(processed, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(org_id, read, created_at DESC);
"""


_db_pool: Optional[asyncpg.Pool] = None
_agent_graph = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_pool, _agent_graph

    startup_errors: list[str] = []

    # ── Database ──────────────────────────────────────────────────────────────
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        startup_errors.append("DATABASE_URL not set — database features disabled")
        print("⚠️  DATABASE_URL not set")
    else:
        try:
            _db_pool = await asyncpg.create_pool(db_url, min_size=2, max_size=10,
                                                  timeout=10, command_timeout=30)
            async with _db_pool.acquire() as conn:
                await conn.execute(SCHEMA_SQL)
                await conn.execute(AUTONOMOUS_SCHEMA)
            print("✅ Database connected")
        except Exception as e:
            startup_errors.append(f"Database connection failed: {e}")
            print(f"⚠️  Database error (non-fatal): {e}")
            _db_pool = None

    # ── Agent graph ────────────────────────────────────────────────────────────
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        startup_errors.append("GROQ_API_KEY not set — agent runs disabled")
        print("⚠️  GROQ_API_KEY not set — /api/agent/run will return 503")
    else:
        try:
            _agent_graph = build_supervisor_graph()
            print("✅ Agent graph compiled")
        except Exception as e:
            startup_errors.append(f"Agent graph failed to build: {e}")
            print(f"⚠️  Agent graph error (non-fatal): {e}")

    if startup_errors:
        print("⚠️  Started with degraded functionality:")
        for err in startup_errors:
            print(f"   • {err}")
    else:
        print("✅ LeadForge Agent API ready")

    print(f"   fast model  : {os.environ.get('GROQ_FAST_MODEL',  'llama-3.1-8b-instant')}")
    print(f"   smart model : {os.environ.get('GROQ_SMART_MODEL', 'llama-3.3-70b-versatile')}")
    app.state.startup_errors = startup_errors

    yield

    if _db_pool:
        await _db_pool.close()


app = FastAPI(title="LeadForge Agent API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def require_db():
    """Raise 503 if database is not connected."""
    if not _db_pool:
        raise HTTPException(
            status_code=503,
            detail="Database not connected. Set DATABASE_URL in environment variables.",
        )

def require_graph():
    """Raise 503 if agent graph is not loaded."""
    if not _agent_graph:
        raise HTTPException(
            status_code=503,
            detail="Agent graph not loaded. Set GROQ_API_KEY in environment variables.",
        )


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
    if not _db_pool:
        print(f"[{run_id}][{agent}] {event_type}: {str(data)[:120]}")
        return
    try:
        async with _db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO agent_events (run_id, agent, event_type, data) VALUES ($1,$2,$3,$4)",
                run_id, agent, event_type, json.dumps(data, default=str),
            )
    except Exception as e:
        print(f"[{run_id}] _log error: {e}")


async def _set_status(run_id: str, status: str, extra: dict = {}):
    if not _db_pool:
        print(f"[{run_id}] status → {status}")
        return
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
    Parse outreach packages from the personalization agent messages.
    Handles both:
      - '=== OUTREACH PACKAGE ===' (prompt format)
      - '=== OUTREACH: <n> ===' (what the LLM actually writes)
    Field names accept both underscore and space variants (EMAIL_SUBJECT / EMAIL SUBJECT).
    All regexes are newline-independent — LLMs often put everything on one line.
    """
    packages = []
    full_text = ""

    for msg in messages:
        name = getattr(msg, "name", "") or ""
        if "personalization" in name or "personalizer" in name:
            full_text += _extract_content(msg) + "\n"

    if not full_text:
        for msg in messages:
            content = _extract_content(msg)
            if any(k in content for k in ("EMAIL_SUBJECT", "EMAIL SUBJECT", "OUTREACH PACKAGE", "OUTREACH:")):
                full_text += content + "\n"

    if not full_text:
        print("[parser] No personalization content found in messages")
        return []

    print(f"[parser] Parsing {len(full_text)} chars. Preview: {repr(full_text[:200])}")

    blocks = re.split(r"===\s*OUTREACH(?:\s*PACKAGE|\s*:[^=]+)?\s*===", full_text)
    print(f"[parser] {len(blocks)} blocks (expecting >1)")

    # Lookahead: stop capture at any known next field keyword, or end of text
    # Accepts both underscore and space variants (EMAIL_SUBJECT / EMAIL SUBJECT)
    NEXT = r"(?=\s*(?:lead_id|\bname\b|email:|phone:|EMAIL[_ ]SUBJECT|EMAIL[_ ]BODY|WHATSAPP|FOLLOW[_ ]UP|===|$))"

    for i, block in enumerate(blocks[1:], 1):
        if not block.strip():
            continue

        pkg = {}

        def _field(pattern, text, default=""):
            m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            return m.group(1).strip() if m else default

        pkg["lead_id"]  = _field(r"lead_id[:\s]+(\S+)", block)
        pkg["name"]     = _field(r"\bname[:\s]+([^\n|]{1,80})" + NEXT, block)
        pkg["email"]    = _field(r"email[:\s]+([\w.+-]+@[\w.-]+\.\w+)", block)
        pkg["phone"]    = _field(r"phone[:\s]+([+\d][\d\s\-()+]{5,20})" + NEXT, block)
        pkg["subject"]  = _field(r"EMAIL[_ ]SUBJECT[:\s]+(.+?)" + NEXT, block)
        pkg["body"]     = _field(r"EMAIL[_ ]BODY[:\s]+(.+?)" + NEXT, block)
        pkg["whatsapp"] = _field(r"WHATSAPP[:\s]+(.+?)" + NEXT, block)

        print(f"[parser] Block {i}: subject={repr(pkg['subject'][:50] if pkg['subject'] else None)} "
              f"email={repr(pkg['email'])} phone={repr(pkg['phone'])}")

        if pkg.get("subject") or pkg.get("body") or pkg.get("whatsapp"):
            packages.append(pkg)
        else:
            print(f"[parser] Block {i} skipped — no subject, body, or whatsapp extracted")

    print(f"[parser] Returning {len(packages)} packages")
    return packages


@app.get("/health")
async def health(request: Request):
    startup_errors = getattr(request.app.state, "startup_errors", [])
    return {
        "status":       "degraded" if startup_errors else "healthy",
        "version":      "1.0.0",
        "database":     "connected" if _db_pool else "disconnected",
        "agent_graph":  "loaded"    if _agent_graph else "unavailable",
        "fast_model":   os.environ.get("GROQ_FAST_MODEL",  "llama-3.1-8b-instant"),
        "smart_model":  os.environ.get("GROQ_SMART_MODEL", "llama-3.3-70b-versatile"),
        "startup_errors": startup_errors,
        "env_check": {
            "DATABASE_URL":      bool(os.environ.get("DATABASE_URL")),
            "GROQ_API_KEY":      bool(os.environ.get("GROQ_API_KEY")),
            "RESEND_API_KEY":    bool(os.environ.get("RESEND_API_KEY")),
            "LEADENGINE_API_URL": bool(os.environ.get("LEADENGINE_API_URL")),
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/agent/run")
async def start_run(body: RunRequest):
    require_db(); require_graph()
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
            if "ID:" in result or "sent" in result.lower():
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

        sender_email  = os.environ.get("SENDER_EMAIL", "outreach@dime-solutions.co.ke")
        sender_name   = os.environ.get("SENDER_NAME",  "Dimes Solutions")
        loop_interval = max(60, getattr(body, "loop_interval", 60))

        agents = _agent_graph  # dict: {"research", "qualifier", "personalizer"}

        brief = (
            f"Campaign: {body.campaign_goal}\n"
            f"Industry: {body.icp.industry} | Location: {body.icp.location} | "
            f"Max leads: {body.max_leads} | Min rating: {body.icp.min_rating}\n"
            f"Org: {body.org_name}"
        )

        await _log(run_id, "supervisor", "started", {
            "goal": body.campaign_goal, "icp": body.icp.dict(),
        })
        print(f"[{run_id}] Starting continuous pipeline loop (interval: {loop_interval}s)")

        total_loops  = 0
        total_emails = 0
        total_wa     = 0

        while True:
            # Check for cancellation before each loop
            if _db_pool:
                async with _db_pool.acquire() as conn:
                    row = await conn.fetchrow(
                        "SELECT status FROM agent_runs WHERE id=$1", run_id
                    )
                if row and row["status"] in ("cancelled", "failed"):
                    await _log(run_id, "supervisor", "message",
                               {"content": f"Session stopped. Loops: {total_loops}, emails: {total_emails}"})
                    return

            total_loops += 1
            all_messages = []

            await _log(run_id, "supervisor", "message", {
                "content": f"Loop {total_loops} starting..."
            })
            print(f"[{run_id}] Loop {total_loops} starting")

            async def _run_agent(agent_key: str, agent_name: str, prompt: str) -> str:
                agent = agents[agent_key]
                config = {
                    "configurable": {"thread_id": f"{run_id}-{agent_key}-loop{total_loops}"},
                    "recursion_limit": 25,
                }
                await _log(run_id, agent_name, "started", {"prompt_preview": prompt[:200]})
                output_text = ""
                async for chunk in agent.astream(
                    {"messages": [{"role": "user", "content": prompt}]},
                    config=config,
                    stream_mode="updates",
                ):
                    for node_name, node_output in chunk.items():
                        if not isinstance(node_output, dict):
                            continue
                        msgs = node_output.get("messages", [])
                        all_messages.extend(msgs)
                        for msg in msgs:
                            msg_type    = type(msg).__name__
                            agent_label = (getattr(msg, "name", None) or node_name or agent_name).strip()
                            content     = _extract_content(msg)
                            if content:
                                print(f"[{run_id}]  {agent_label}: {content[:150]!r}")
                            if not content or msg_type == "HumanMessage":
                                continue
                            event_type = (
                                "tool_result" if msg_type == "ToolMessage"
                                else "tool_call" if getattr(msg, "tool_calls", None)
                                else "message"
                            )
                            await _log(run_id, agent_label, event_type, {"content": content[:2000]})
                            if msg_type == "AIMessage" and not getattr(msg, "tool_calls", None):
                                output_text = content
                return output_text

            # Step 1: Research
            research_prompt = (
                f"{brief}\n\n"
                f"Scrape Google Maps for '{body.icp.industry}' in '{body.icp.location}'. "
                f"Find up to {body.max_leads} businesses. Enrich emails where possible. "
                f"Return the RESEARCH REPORT. "
                f"IMPORTANT: Do NOT call filter_leads_by_icp — scrape results are already ICP-matched."
            )
            research_report = await _run_agent("research", "research_agent", research_prompt)
            print(f"[{run_id}] Loop {total_loops} research done — {len(research_report)} chars")

            # Step 2: Qualify
            qualify_prompt = (
                f"{brief}\n\n"
                f"Here is the RESEARCH REPORT:\n\n{research_report}\n\n"
                f"Score every lead using score_lead(). Return the QUALIFICATION SUMMARY."
            )
            qualification_report = await _run_agent("qualifier", "qualifier_agent", qualify_prompt)
            print(f"[{run_id}] Loop {total_loops} qualification done — {len(qualification_report)} chars")

            # Step 3: Personalize
            personalize_prompt = (
                f"{brief}\n\n"
                f"Here are the QUALIFIED LEADS:\n\n{qualification_report}\n\n"
                f"Write personalized outreach for every QUALIFIED lead and return all OUTREACH PACKAGES."
            )
            personalization_report = await _run_agent("personalizer", "personalization_agent", personalize_prompt)
            print(f"[{run_id}] Loop {total_loops} personalization done — {len(personalization_report)} chars")

            # Execute outreach
            packages = _parse_outreach_packages(all_messages)
            print(f"[{run_id}] Loop {total_loops}: {len(packages)} packages")

            if packages:
                emails_sent, wa_sent = await _execute_outreach(
                    run_id, packages, sender_email, sender_name
                )
                total_emails += emails_sent
                total_wa     += wa_sent
            else:
                emails_sent, wa_sent = 0, 0
                await _log(run_id, "executor_agent", "message",
                           {"content": f"Loop {total_loops}: no outreach packages found."})

            # Persist running totals
            if _db_pool:
                async with _db_pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE agent_runs SET sent=$1, updated_at=NOW() WHERE id=$2",
                        total_emails, run_id,
                    )

            await _log(run_id, "supervisor", "message", {
                "content": (
                    f"Loop {total_loops} complete. "
                    f"Emails this loop: {emails_sent}. "
                    f"Total emails sent: {total_emails}. "
                    f"Next loop in {loop_interval}s..."
                )
            })
            print(f"[{run_id}] Loop {total_loops} done. Sleeping {loop_interval}s...")
            await asyncio.sleep(loop_interval)

    except asyncio.CancelledError:
        await _set_status(run_id, "cancelled")
        await _log(run_id, "supervisor", "message",
                   {"content": f"Campaign cancelled after {total_loops} loops, {total_emails} emails sent."})

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[{run_id}] EXCEPTION: {e}\n{tb}")
        await _set_status(run_id, "failed")
        await _log(run_id, "supervisor", "error", {
            "message": str(e)[:500], "traceback": tb[:1500],
        })




class ICPConfigRequest(BaseModel):
    org_id:         str
    org_name:       str = ""
    industry:       str
    location:       str
    min_rating:     float = 3.5
    min_reviews:    int   = 5
    campaign_goal:  str   = ""
    max_leads:      int   = 20

class ApprovalActionRequest(BaseModel):
    approval_id: int
    action:      str
    notes:       str = ""
    resolved_by: str = "human"

class OptOutRequest(BaseModel):
    email:  str
    reason: str = "manual_request"
    source: str = "dashboard"


@app.post("/api/icp")
async def create_icp(body: ICPConfigRequest):
    async with _db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO icp_configs
               (org_id, org_name, industry, location, min_rating, min_reviews, campaign_goal, max_leads)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id""",
            body.org_id, body.org_name, body.industry, body.location,
            body.min_rating, body.min_reviews, body.campaign_goal, body.max_leads,
        )
    return {"icp_id": row["id"], "message": "ICP saved. AI will auto-run every 30 minutes."}


@app.get("/api/icp/{org_id}")
async def get_icp_configs(org_id: str):
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM icp_configs WHERE org_id=$1 ORDER BY created_at DESC", org_id
        )
    return [dict(r) for r in rows]


@app.patch("/api/icp/{icp_id}/toggle")
async def toggle_icp(icp_id: int, active: bool):
    async with _db_pool.acquire() as conn:
        await conn.execute("UPDATE icp_configs SET active=$1 WHERE id=$2", active, icp_id)
    return {"status": "updated", "active": active}


@app.get("/api/dashboard/{org_id}")
async def get_dashboard(org_id: str):
    async with _db_pool.acquire() as conn:
        notifs = await conn.fetch(
            "SELECT * FROM notifications WHERE org_id=$1 AND read=false ORDER BY created_at DESC LIMIT 20",
            org_id,
        )
        approvals = await conn.fetch(
            "SELECT * FROM approval_queue WHERE status='pending' ORDER BY created_at DESC LIMIT 20"
        )
        meetings = await conn.fetch(
            "SELECT * FROM meetings WHERE org_id=$1 AND status='scheduled' ORDER BY created_at DESC LIMIT 10",
            org_id,
        )
    return {
        "notifications":  [dict(n) for n in notifs],
        "approval_queue": [dict(a) for a in approvals],
        "recent_meetings":[dict(m) for m in meetings],
    }


@app.get("/api/analytics/{org_id}")
async def get_analytics(org_id: str, days: int = 30):
    async with _db_pool.acquire() as conn:
        runs = await conn.fetch(
            "SELECT * FROM agent_runs WHERE org_id=$1 AND created_at > NOW() - INTERVAL '30 days'",
            org_id,
        )
        meetings_count = await conn.fetchval(
            "SELECT COUNT(*) FROM meetings WHERE org_id=$1 AND created_at > NOW() - INTERVAL '30 days'",
            org_id,
        ) or 0
        buy_count = await conn.fetchval(
            "SELECT COUNT(*) FROM buy_signals WHERE processed=false"
        ) or 0

    total_runs      = len(runs)
    total_sent      = sum(r["sent"]      or 0 for r in runs)
    total_qualified = sum(r["qualified"] or 0 for r in runs)
    meeting_rate    = f"{round((meetings_count / total_qualified) * 100, 1)}%" if total_qualified else "0%"

    return {
        "emails_sent":          total_sent,
        "meetings_booked":      meetings_count,
        "meeting_rate":         meeting_rate,
        "buy_signals_detected": buy_count,
        "campaigns_run":        total_runs,
        "days":                 days,
    }


@app.get("/api/buy-signals")
async def get_buy_signals_route(processed: bool = False, limit: int = 20):
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM buy_signals WHERE processed=$1 ORDER BY detected_at DESC LIMIT $2",
            processed, limit,
        )
    return [dict(r) for r in rows]


@app.post("/api/approvals/{approval_id}/action")
async def handle_approval(approval_id: int, body: ApprovalActionRequest):
    async with _db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE approval_queue SET status=$1, notes=$2, resolved_by=$3, resolved_at=NOW() WHERE id=$4",
            body.action, body.notes, body.resolved_by, approval_id,
        )
    return {"ok": True, "action": body.action}


@app.get("/api/notifications/{org_id}/mark-read")
async def mark_notifications_read(org_id: str):
    async with _db_pool.acquire() as conn:
        await conn.execute("UPDATE notifications SET read=true WHERE org_id=$1", org_id)
    return {"ok": True}


@app.get("/api/meetings/{org_id}")
async def get_meetings_route(org_id: str, status: str = "scheduled"):
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM meetings WHERE org_id=$1 AND status=$2 ORDER BY created_at DESC",
            org_id, status,
        )
    return [dict(r) for r in rows]


@app.post("/api/compliance/opt-out")
async def opt_out(body: OptOutRequest):
    async with _db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO notifications (org_id, type, message) VALUES ('system', 'opt_out', $1)",
            f"Opt-out: {body.email} — reason: {body.reason} — source: {body.source}",
        )
    return {"ok": True, "suppressed": body.email}


@app.post("/api/run")
async def run_alias(body: RunRequest):
    """Alias of /api/agent/run for AutonomousDashboard compatibility."""
    return await start_run(body)


@app.get("/api/runs/{run_id}/stream")
async def stream_alias(run_id: str):
    """Alias of /api/agent/stream/{run_id} for AutonomousDashboard compatibility."""
    return await stream_events(run_id)


@app.get("/api/runs/{run_id}")
async def get_run_alias(run_id: str):
    """Alias of /api/agent/run/{run_id} for AutonomousDashboard compatibility."""
    return await get_run(run_id)


# ─── Session endpoints (AutonomousDashboard v2 uses /api/session) ─────────────
# The v2 frontend calls /api/session instead of /api/run.
# These endpoints are thin wrappers around the existing run-based logic so we
# don't need to change anything else in the codebase.

class SessionRequest(BaseModel):
    """Mirrors RunRequest — accepts the extra fields the v2 frontend sends."""
    campaign_goal:      str
    icp:                ICP
    org_id:             str
    org_name:           str
    leadengine_api_url: str
    leadengine_token:   str
    max_leads:          int = 20
    loop_interval:      int = 60   # ignored for now, kept for API compatibility


@app.post("/api/session")
async def start_session(body: SessionRequest):
    """
    V2 AutonomousDashboard launches campaigns via POST /api/session.
    Converts to a RunRequest and delegates to start_run().
    Returns session_id (same value as run_id internally).
    """
    run_req = RunRequest(
        campaign_goal      = body.campaign_goal,
        icp                = body.icp,
        org_id             = body.org_id,
        org_name           = body.org_name,
        leadengine_api_url = body.leadengine_api_url,
        leadengine_token   = body.leadengine_token,
        max_leads          = body.max_leads,
    )
    result = await start_run(run_req)
    # Frontend expects session_id, server returns run_id — map it
    return {
        "session_id": result["run_id"],
        "status":     result["status"],
        "message":    "Session started — pipeline running.",
    }


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """
    V2 frontend polls this to get session stats (total_runs, emails_sent, status).
    Maps to the agent_run row, adding session-compatible field names.
    """
    require_db()
    async with _db_pool.acquire() as conn:
        run = await conn.fetchrow("SELECT * FROM agent_runs WHERE id=$1", session_id)
        if not run:
            raise HTTPException(status_code=404, detail="Session not found")
        run_dict = dict(run)
    return {
        "session_id":   session_id,
        "status":       run_dict.get("status", "unknown"),
        "campaign_goal":run_dict.get("campaign_goal", ""),
        "total_runs":   1,                              # single-shot run = 1 loop
        "emails_sent":  run_dict.get("sent", 0) or 0,
        "whatsapp_sent":0,
        "stop_reason":  run_dict.get("error_message", ""),
        "created_at":   run_dict.get("created_at", "").isoformat() if run_dict.get("created_at") else "",
        "stopped_at":   run_dict.get("updated_at", "").isoformat() if run_dict.get("updated_at") else "",
    }


@app.delete("/api/session/{session_id}")
async def stop_session(session_id: str):
    """V2 frontend stops a session via DELETE /api/session/{id}."""
    require_db()
    await _set_status(session_id, "cancelled")
    return {"session_id": session_id, "status": "stopped"}


@app.get("/api/session/{session_id}/stream")
async def stream_session(session_id: str):
    """
    V2 frontend connects EventSource to /api/session/{id}/stream.
    Proxies to stream_events() and emits session_stopped when the run finishes
    so the frontend SSE handler closes cleanly.
    """
    require_db()

    async def gen() -> AsyncGenerator[str, None]:
        last_id = 0
        while True:
            async with _db_pool.acquire() as conn:
                run = await conn.fetchrow(
                    "SELECT status, sent FROM agent_runs WHERE id=$1", session_id
                )
                if not run:
                    yield f"data: {json.dumps({'type':'error','message':'session not found'})}\n\n"
                    return
                rows = await conn.fetch(
                    "SELECT id, agent, event_type, data, created_at "
                    "FROM agent_events WHERE run_id=$1 AND id>$2 ORDER BY id",
                    session_id, last_id,
                )
                for r in rows:
                    last_id = r["id"]
                    evt = {
                        "type":      r["event_type"],
                        "agent":     r["agent"],
                        "data":      json.loads(r["data"] or "{}"),
                        "ts":        r["created_at"].isoformat(),
                    }
                    yield f"data: {json.dumps(evt)}\n\n"
                status = run["status"]
                if status in ("completed", "failed", "cancelled"):
                    stopped_evt = {
                        "type":        "session_stopped",
                        "status":      status,
                        "total_runs":  1,
                        "emails_sent": run["sent"] or 0,
                    }
                    yield f"data: {json.dumps(stopped_evt)}\n\n"
                    return
            await asyncio.sleep(1)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/sessions/{org_id}")
async def list_sessions(org_id: str):
    """
    V2 frontend fetches active sessions to show in Overview/sidebar.
    Maps agent_runs to session-shaped objects.
    """
    require_db()
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM agent_runs WHERE org_id=$1 ORDER BY created_at DESC LIMIT 20",
            org_id,
        )
    return [
        {
            "session_id":    r["id"],
            "status":        r["status"],
            "campaign_goal": r["campaign_goal"] or "",
            "total_runs":    1,
            "emails_sent":   r["sent"] or 0,
            "whatsapp_sent": 0,
            "created_at":    r["created_at"].isoformat() if r["created_at"] else "",
        }
        for r in rows
    ]


if __name__ == "__main__":
    uvicorn.run("api.main:app", host="0.0.0.0",
                port=int(os.environ.get("PORT", 8000)), reload=False, workers=1)
