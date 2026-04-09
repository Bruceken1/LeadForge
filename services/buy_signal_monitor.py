"""
Buy Signal Monitor — Always-On Lead Generation Engine
Continuously monitors for buying signals and surfaces fresh leads.
Runs as a background service every N minutes.
"""
import asyncio
import httpx
import json
import os
import re
from datetime import datetime, timedelta
from typing import Optional


class BuySignalMonitor:
    """
    Monitors multiple data sources for buy signals and new business registrations.
    Runs 24/7 as an async background task.
    
    BUY SIGNALS MONITORED:
    - New business registrations (Kenya Business Registration Service)
    - LinkedIn job postings (Sales, Marketing, Growth roles = buying signals)
    - Company funding announcements
    - Google Maps new business listings
    - Website launch detection (new domains in target industries)
    - Google News: target company mentions, expansions, new locations
    """

    def __init__(self, db_pool, leadengine_api_url: str, leadengine_token: str):
        self.db_pool = db_pool
        self.api_url = leadengine_api_url
        self.token = leadengine_token
        self.serpapi_key = os.environ.get("SERPAPI_KEY", "")
        self.running = False

    async def start(self):
        """Start all monitoring loops concurrently."""
        self.running = True
        print("🔍 Buy Signal Monitor started — running 24/7")
        await asyncio.gather(
            self._monitor_new_business_registrations(),
            self._monitor_buy_signal_news(),
            self._monitor_google_maps_new_listings(),
        )

    async def stop(self):
        self.running = False
        print("⏹ Buy Signal Monitor stopped")

    async def _monitor_new_business_registrations(self):
        """
        Polls for newly registered businesses matching the ICP.
        Data source: Kenya Business Registration Service API, eCitizen portal
        Frequency: Every 4 hours
        """
        while self.running:
            try:
                print(f"[{datetime.utcnow().isoformat()}] Checking new business registrations...")
                await self._check_kenya_brs()
            except Exception as e:
                print(f"[BuySignal] Registration monitor error: {e}")
            await asyncio.sleep(4 * 3600)  # every 4 hours

    async def _monitor_buy_signal_news(self):
        """
        Monitors Google News for buy signals: funding, expansions, new locations,
        leadership changes (new CEO = new priorities = selling opportunity).
        Frequency: Every 2 hours
        """
        while self.running:
            try:
                print(f"[{datetime.utcnow().isoformat()}] Scanning buy signal news...")
                await self._scan_news_signals()
            except Exception as e:
                print(f"[BuySignal] News monitor error: {e}")
            await asyncio.sleep(2 * 3600)  # every 2 hours

    async def _monitor_google_maps_new_listings(self):
        """
        Detects new business listings on Google Maps in target locations.
        New listings = new businesses = actively building = buying signal.
        Frequency: Every 6 hours
        """
        while self.running:
            try:
                print(f"[{datetime.utcnow().isoformat()}] Scanning Google Maps for new listings...")
                await self._check_new_maps_listings()
            except Exception as e:
                print(f"[BuySignal] Maps monitor error: {e}")
            await asyncio.sleep(6 * 3600)  # every 6 hours

    async def _check_kenya_brs(self):
        """
        Check Kenya Business Registration Service for new registrations.
        New company = perfect time to sell (needs everything: software, marketing, services).
        Integration: Kenya eCitizen API or web scraping ecitizen.go.ke/brs
        """
        # Production: HTTP request to ecitizen.go.ke/services/brs/new-registrations
        # or scrape the public business search portal
        target_industries = await self._get_active_icp_industries()
        for industry in target_industries:
            # Query for registrations in the last 7 days
            query = f"new {industry} business registration Kenya {datetime.utcnow().strftime('%Y')}"
            signals = await self._serpapi_search(query, num=5)
            for signal in signals:
                await self._save_buy_signal({
                    "source": "kenya_brs",
                    "signal_type": "new_registration",
                    "query": query,
                    "url": signal.get("link", ""),
                    "title": signal.get("title", ""),
                    "snippet": signal.get("snippet", ""),
                    "detected_at": datetime.utcnow().isoformat(),
                    "priority_boost": 20,  # New registration = high priority
                })

    async def _scan_news_signals(self):
        """
        Scan for buying signals in news:
        - Funding rounds → has budget
        - New location opened → expanding, needs services
        - Leadership change → new decision maker, fresh priorities
        - Award won → celebratory mood, open to investment
        """
        buy_signal_queries = [
            "Kenya startup funding 2025 million",
            "Nairobi business expansion new branch",
            "Kenya SME growth new location opened",
            "Mombasa restaurant hotel opened 2025",
            "Nairobi tech company hired marketing",
        ]
        for query in buy_signal_queries:
            signals = await self._serpapi_search(query, num=3)
            for signal in signals:
                await self._save_buy_signal({
                    "source": "news_signal",
                    "signal_type": "growth_indicator",
                    "query": query,
                    "url": signal.get("link", ""),
                    "title": signal.get("title", ""),
                    "snippet": signal.get("snippet", ""),
                    "detected_at": datetime.utcnow().isoformat(),
                    "priority_boost": 15,
                })

    async def _check_new_maps_listings(self):
        """
        Detect recently added Google Maps listings in target locations.
        New listings have fewer reviews (< 10) and recent first-review dates.
        """
        # Uses the LeadEngine scrape API with a recent-listings filter
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            target_configs = await self._get_active_icp_configs()
            async with httpx.AsyncClient(timeout=30) as client:
                for config in target_configs[:3]:  # limit to 3 configs per run
                    resp = await client.post(
                        f"{self.api_url}/api/scrape",
                        headers=headers,
                        json={
                            "keyword": config["industry"],
                            "location": config["location"],
                            "max": 10,
                            "filter": "new_listings",  # LeadEngine filter
                        }
                    )
                    if resp.is_success:
                        data = resp.json()
                        leads = data if isinstance(data, list) else data.get("leads", [])
                        for lead in leads:
                            if lead.get("review_count", 999) < 15:  # New business signal
                                await self._save_buy_signal({
                                    "source": "google_maps",
                                    "signal_type": "new_listing",
                                    "lead_data": lead,
                                    "detected_at": datetime.utcnow().isoformat(),
                                    "priority_boost": 25,
                                })
        except Exception as e:
            print(f"[BuySignal] Maps check failed: {e}")

    async def _serpapi_search(self, query: str, num: int = 5) -> list:
        """Run a SerpApi Google News search."""
        if not self.serpapi_key:
            return []
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://serpapi.com/search",
                    params={
                        "q": query,
                        "tbm": "nws",  # news
                        "num": num,
                        "api_key": self.serpapi_key,
                        "gl": "ke",  # Kenya
                        "hl": "en",
                    }
                )
                if resp.is_success:
                    data = resp.json()
                    return data.get("news_results", [])
        except Exception as e:
            print(f"[SerpApi] Error: {e}")
        return []

    async def _save_buy_signal(self, signal: dict):
        """Persist a detected buy signal to the database for agent consumption."""
        if self.db_pool:
            try:
                async with self.db_pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO buy_signals (source, signal_type, data, priority_boost, detected_at)
                        VALUES ($1, $2, $3, $4, NOW())
                        ON CONFLICT DO NOTHING
                        """,
                        signal.get("source"),
                        signal.get("signal_type"),
                        json.dumps(signal, default=str),
                        signal.get("priority_boost", 0),
                    )
            except Exception as e:
                print(f"[BuySignal] DB save error: {e}")

    async def _get_active_icp_industries(self) -> list:
        """Get list of industries from active ICP configurations."""
        if self.db_pool:
            try:
                async with self.db_pool.acquire() as conn:
                    rows = await conn.fetch(
                        "SELECT DISTINCT icp_industry FROM icp_configs WHERE active = true"
                    )
                    return [r["icp_industry"] for r in rows]
            except Exception:
                pass
        return ["restaurant", "hotel", "retail", "software", "logistics"]

    async def _get_active_icp_configs(self) -> list:
        """Get active ICP configuration objects."""
        if self.db_pool:
            try:
                async with self.db_pool.acquire() as conn:
                    rows = await conn.fetch(
                        "SELECT * FROM icp_configs WHERE active = true LIMIT 10"
                    )
                    return [dict(r) for r in rows]
            except Exception:
                pass
        return [{"industry": "restaurant", "location": "Nairobi, Kenya"}]
