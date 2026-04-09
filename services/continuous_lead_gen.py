"""
Continuous Lead Generation Service — Always-On ICP-Driven Lead Sourcing
Runs indefinitely until stopped. The ONLY things that stop the loop are:
  - self.running = False  (clean shutdown via stop())
  - Fatal OS-level errors (MemoryError, SystemExit, KeyboardInterrupt)

FIXES vs previous version:
1. _processed_locations cache REMOVED — it blocked all ICPs after the first
   cycle. The cache clear (asyncio.create_task with delay=6h) never ran after
   Railway restarts, so every ICP was permanently blacklisted. We now use
   last_run_at in the DB for deduplication (round-robin, oldest-run first).

2. last_run_at NOW UPDATED after every run — previously it was never written,
   so ORDER BY last_run_at ASC NULLS FIRST always returned the same ICP and
   skipped the rest.

3. asyncio.to_thread(graph.invoke) → await graph.ainvoke() — the compiled
   LangGraph graph is already async. Running it in a thread caused
   "no event loop in thread" errors and silently prevented SSE events from
   reaching the dashboard in real time.

4. Fresh graph per run — each auto-run now gets build_supervisor_graph() with
   its own MemorySaver. The shared graph's MemorySaver accumulated state from
   previous runs, which caused the supervisor to see old research_agent messages
   and call it a SECOND time at the start of the next cycle (the double-call
   bug visible in the dashboard logs: research_agent called twice, then
   executor outputting "No outreach packages found").

5. Non-fatal exception handling — scrape errors, 0-lead runs, Groq rate limits
   all sleep-and-continue. Fatal errors bubble up so Railway can restart.
"""
import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Optional

from agent.tools.leadengine import configure_tools
from agent.agents.supervisor import build_supervisor_graph

_FATAL = (MemoryError, KeyboardInterrupt, SystemExit)


class ContinuousLeadGenService:

    def __init__(self, db_pool, agent_graph, leadengine_api_url: str, leadengine_token: str):
        self.db_pool    = db_pool
        self.agent_graph = agent_graph  # kept for reference; each run builds its own
        self.api_url    = leadengine_api_url
        self.token      = leadengine_token
        self.running    = False
        self._semaphore = asyncio.Semaphore(3)

    async def start(self):
        self.running = True
        print("🚀 Continuous Lead Gen Service started — 24/7 mode ACTIVE")
        await asyncio.gather(
            self._icp_driven_lead_loop(),
            self._buy_signal_processor(),
            self._follow_up_scheduler(),
            self._inbox_monitor_loop(),
        )

    async def stop(self):
        self.running = False
        print("⏹ Continuous Lead Gen Service stopped")

    # ── ICP loop ───────────────────────────────────────────────────────────────

    async def _icp_driven_lead_loop(self):
        while self.running:
            try:
                print(f"[{datetime.utcnow().isoformat()}] ICP lead discovery tick")
                icp_configs = await self._get_active_icp_configs()
                if not icp_configs:
                    print("[LeadGen] No active ICP configs — sleeping 30 min")
                else:
                    for icp in icp_configs:
                        if not self.running:
                            break
                        await self._run_lead_discovery_for_icp(icp)
                        await asyncio.sleep(10)
            except _FATAL:
                raise
            except Exception as e:
                print(f"[LeadGen] ICP loop error (non-fatal): {e}")
            await asyncio.sleep(30 * 60)

    async def _run_lead_discovery_for_icp(self, icp: dict):
        async with self._semaphore:
            org_id = icp.get("org_id", "")
            run_id = f"auto-{str(uuid.uuid4())[:8]}"

            print(f"[LeadGen] Starting auto-run {run_id} | "
                  f"org={org_id} | {icp['industry']} in {icp['location']}")

            if not await self._check_credits(org_id):
                print(f"[LeadGen] Org {org_id} insufficient credits — skip")
                return

            try:
                if self.db_pool:
                    async with self.db_pool.acquire() as conn:
                        await conn.execute(
                            """INSERT INTO agent_runs (id, org_id, status, icp_config, created_at)
                               VALUES ($1,$2,'running',$3,NOW())""",
                            run_id, org_id, json.dumps(icp, default=str)
                        )

                configure_tools(self.api_url, self.token, org_id)

                # ICP filter injected directly into the prompt so the researcher
                # never returns leads from a different industry.
                prompt = (
                    f"AUTO RUN {run_id}: Find and qualify leads for this ICP.\n"
                    f"Industry: {icp['industry']}\n"
                    f"Location: {icp['location']}\n"
                    f"Min Rating: {icp.get('min_rating', 3.5)}\n"
                    f"Campaign Goal: {icp.get('campaign_goal', 'Generate leads for our services')}\n"
                    f"Max Leads: {icp.get('max_leads', 20)}\n"
                    f"Org: {icp.get('org_name', 'LeadForge Client')}\n\n"
                    f"STRICT ICP FILTER: Only process leads whose industry field contains "
                    f"'{icp['industry']}'. If scrape_google_maps returns leads from other "
                    f"industries, discard them before passing to qualifier_agent.\n\n"
                    f"Run MODE A: research_agent → qualifier_agent → "
                    f"personalization_agent → executor_agent → STOP.\n"
                    f"Proceed autonomously. Do not ask for confirmation."
                )

                # FIX: fresh graph with own MemorySaver — prevents state bleed
                run_graph = build_supervisor_graph()
                config = {
                    "configurable": {"thread_id": run_id},
                    "recursion_limit": 100,
                }

                # FIX: ainvoke (async) instead of asyncio.to_thread(invoke)
                await run_graph.ainvoke(
                    {"messages": [{"role": "user", "content": prompt}]},
                    config=config,
                )

                if self.db_pool:
                    async with self.db_pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE agent_runs SET status='completed', updated_at=NOW() WHERE id=$1",
                            run_id
                        )
                        # FIX: update last_run_at for proper round-robin scheduling
                        await conn.execute(
                            "UPDATE icp_configs SET last_run_at=NOW() WHERE id=$1",
                            icp.get("id")
                        )
                print(f"[LeadGen] Auto-run {run_id} completed")

            except _FATAL:
                raise
            except Exception as e:
                print(f"[LeadGen] Auto-run {run_id} failed (non-fatal): {e}")
                try:
                    if self.db_pool:
                        async with self.db_pool.acquire() as conn:
                            await conn.execute(
                                "UPDATE agent_runs SET status='failed', error=$1, updated_at=NOW() WHERE id=$2",
                                str(e)[:500], run_id
                            )
                except Exception:
                    pass

    # ── Buy signal processor ────────────────────────────────────────────────────

    async def _buy_signal_processor(self):
        while self.running:
            try:
                signals = await self._get_unprocessed_buy_signals()
                for signal in signals:
                    if not self.running:
                        break
                    await self._process_buy_signal(signal)
                    await asyncio.sleep(2)
            except _FATAL:
                raise
            except Exception as e:
                print(f"[BuySignal] Processor error (non-fatal): {e}")
            await asyncio.sleep(15 * 60)

    # ── Follow-up scheduler ──────────────────────────────────────────────────────

    async def _follow_up_scheduler(self):
        while self.running:
            try:
                print(f"[{datetime.utcnow().isoformat()}] Checking due follow-ups...")
                due_leads = await self._get_due_followups()
                if due_leads:
                    print(f"[FollowUp] {len(due_leads)} follow-ups due")
                    for lead in due_leads:
                        if not self.running:
                            break
                        await self._trigger_followup(lead)
                        await asyncio.sleep(5)
            except _FATAL:
                raise
            except Exception as e:
                print(f"[FollowUp] Scheduler error (non-fatal): {e}")
            await asyncio.sleep(3600)

    # ── Inbox monitor ──────────────────────────────────────────────────────────

    async def _inbox_monitor_loop(self):
        while self.running:
            try:
                print(f"[{datetime.utcnow().isoformat()}] Checking inbox...")
                orgs = await self._get_active_orgs()
                for org in orgs:
                    if not self.running:
                        break
                    await self._trigger_reply_processing(org)
            except _FATAL:
                raise
            except Exception as e:
                print(f"[Inbox] Monitor error (non-fatal): {e}")
            await asyncio.sleep(10 * 60)

    # ── DB helpers ──────────────────────────────────────────────────────────────

    async def _check_credits(self, org_id: str) -> bool:
        if not self.db_pool or not org_id:
            return True
        try:
            async with self.db_pool.acquire() as conn:
                row = await conn.fetchrow("SELECT credits FROM orgs WHERE id=$1", org_id)
                return row and row["credits"] >= 10
        except Exception:
            return True

    async def _get_active_icp_configs(self) -> list:
        if not self.db_pool:
            return []
        try:
            async with self.db_pool.acquire() as conn:
                try:
                    rows = await conn.fetch(
                        """SELECT ic.*, o.name as org_name
                           FROM icp_configs ic
                           JOIN orgs o ON ic.org_id = o.id
                           WHERE ic.active = true
                           ORDER BY ic.last_run_at ASC NULLS FIRST
                           LIMIT 20"""
                    )
                except Exception:
                    rows = await conn.fetch(
                        """SELECT *
                           FROM icp_configs
                           WHERE active = true
                           ORDER BY last_run_at ASC NULLS FIRST
                           LIMIT 20"""
                    )
                return [dict(r) for r in rows]
        except Exception as e:
            print(f"[LeadGen] Failed to fetch ICP configs: {e}")
            return []

    async def _get_unprocessed_buy_signals(self) -> list:
        if not self.db_pool:
            return []
        try:
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT * FROM buy_signals
                       WHERE processed = false
                       ORDER BY priority_boost DESC, detected_at ASC
                       LIMIT 10"""
                )
                return [dict(r) for r in rows]
        except Exception:
            return []

    async def _get_due_followups(self) -> list:
        if not self.db_pool:
            return []
        try:
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT l.*, COALESCE(l.org_id, '') as org_id
                       FROM leads l
                       WHERE l.follow_up_at <= NOW()
                       AND l.status NOT IN ('suppressed','won','lost','unsubscribed')
                       AND l.sequence_step < 4
                       ORDER BY l.follow_up_at ASC
                       LIMIT 50"""
                )
                return [dict(r) for r in rows]
        except Exception:
            return []

    async def _get_active_orgs(self) -> list:
        if not self.db_pool:
            return []
        try:
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT id, name FROM orgs WHERE plan != 'free' OR credits > 0"
                )
                return [dict(r) for r in rows]
        except Exception:
            return []

    async def _process_buy_signal(self, signal: dict):
        print(f"[BuySignal] Processing: {signal.get('signal_type')} "
              f"from {signal.get('source')}")
        if self.db_pool:
            try:
                async with self.db_pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE buy_signals SET processed=true, processed_at=NOW() WHERE id=$1",
                        signal.get("id")
                    )
            except Exception as e:
                print(f"[BuySignal] Mark processed error: {e}")

    async def _trigger_followup(self, lead: dict):
        lead_id  = lead.get("id")
        name     = lead.get("name", "unknown")
        org_id   = lead.get("org_id", "")
        step     = lead.get("sequence_step", 2)
        print(f"[FollowUp] Lead {lead_id} ({name}) step {step}")
        configure_tools(self.api_url, self.token, org_id)
        prompt = (
            f"Follow-up run for lead {lead_id} ({name}). "
            f"Sequence step {step}. "
            f"Run MODE C: check reply status, generate next touch, send."
        )
        config = {
            "configurable": {"thread_id": f"followup-{lead_id}-step{step}"},
            "recursion_limit": 40,
        }
        try:
            run_graph = build_supervisor_graph()
            await run_graph.ainvoke(
                {"messages": [{"role": "user", "content": prompt}]},
                config=config,
            )
        except _FATAL:
            raise
        except Exception as e:
            print(f"[FollowUp] Error lead {lead_id}: {e}")

    async def _trigger_reply_processing(self, org: dict):
        org_id   = org.get("id", "")
        org_name = org.get("name", "unknown")
        configure_tools(self.api_url, self.token, org_id)
        prompt = (
            f"Reply processing for org {org_id} ({org_name}). "
            f"Run MODE B: check inbox, classify intent, route to "
            f"meeting_booker / personalizer / executor."
        )
        config = {
            "configurable": {
                "thread_id": f"inbox-{org_id}-{datetime.utcnow().strftime('%Y%m%d%H%M')}"
            },
            "recursion_limit": 60,
        }
        try:
            run_graph = build_supervisor_graph()
            await run_graph.ainvoke(
                {"messages": [{"role": "user", "content": prompt}]},
                config=config,
            )
        except _FATAL:
            raise
        except Exception as e:
            print(f"[Inbox] Error org {org_id}: {e}")
