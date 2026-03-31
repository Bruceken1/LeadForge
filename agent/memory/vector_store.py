"""
Vector Memory — pgvector for RAG.
Stores enriched lead profiles and outreach outcomes.
Used by Personalization Agent to retrieve similar successful campaigns.
"""
import os, json
from typing import List, Optional
import asyncpg


DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://leadforge:leadforge@localhost:5432/leadforge")


SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS lead_memories (
    id          SERIAL PRIMARY KEY,
    org_id      TEXT NOT NULL,
    lead_name   TEXT NOT NULL,
    content     TEXT NOT NULL,
    outcome     TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, lead_name)
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id            TEXT PRIMARY KEY,
    org_id        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'running',
    campaign_goal TEXT,
    icp           JSONB,
    total_leads   INTEGER DEFAULT 0,
    qualified     INTEGER DEFAULT 0,
    sent          INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_events (
    id          SERIAL PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    agent       TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    data        JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_run ON agent_events(run_id, id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org   ON agent_runs(org_id, created_at DESC);
"""


async def store_lead_outcome(pool: asyncpg.Pool, org_id: str, lead: dict, outcome: str):
    """Store a lead's enriched profile + outcome for RAG retrieval."""
    content = (
        f"Company: {lead.get('name')} | Industry: {lead.get('industry')} | "
        f"City: {lead.get('city')} | Rating: {lead.get('rating')} | "
        f"Email subject: {lead.get('email_subject', '')} | Outcome: {outcome}"
    )
    try:
        await pool.execute(
            """
            INSERT INTO lead_memories (org_id, lead_name, content, outcome, metadata)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (org_id, lead_name) DO UPDATE
              SET content=EXCLUDED.content, outcome=EXCLUDED.outcome,
                  metadata=EXCLUDED.metadata, updated_at=NOW()
            """,
            org_id, lead.get("name", "unknown"), content, outcome, json.dumps(lead),
        )
    except Exception as e:
        print(f"Memory store error: {e}")


async def retrieve_successful_patterns(
    pool: asyncpg.Pool,
    org_id: str,
    industry: str,
    city: str,
    top_k: int = 3,
) -> List[dict]:
    """
    Retrieve past successful outreach patterns for similar leads.
    Simple text-based retrieval (no vectors needed for MVP — add pgvector later).
    """
    try:
        rows = await pool.fetch(
            """
            SELECT lead_name, content, outcome, metadata
            FROM lead_memories
            WHERE org_id = $1
              AND outcome IN ('replied', 'meeting', 'closed')
              AND (content ILIKE $2 OR content ILIKE $3)
            ORDER BY created_at DESC
            LIMIT $4
            """,
            org_id, f"%{industry}%", f"%{city}%", top_k,
        )
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"Memory retrieve error: {e}")
        return []
