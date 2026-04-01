"""
Supervisor — explicit LangGraph StateGraph orchestrator.

Replaces langgraph-supervisor with a hand-rolled graph that guarantees
the 4 agents run in sequence: research → qualify → personalize → execute.
No tool-call handoffs needed — routing is done by Python, not the LLM.
"""
from __future__ import annotations

import json
from typing import Any, Literal

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import create_react_agent

from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent
from agent.agents.executor import create_executor_agent
from agent.state import AgentRunState


# ── Node wrappers ────────────────────────────────────────────────────────────

async def run_research(state: AgentRunState) -> dict:
    """Call the research agent and append its reply to messages."""
    agent = create_research_agent(get_smart_llm())

    icp  = state["icp"]
    goal = state["campaign_goal"]

    prompt = (
        f"Campaign goal: {goal}\n"
        f"Target: {icp.get('industry', 'businesses')} in {icp.get('location', 'Nairobi, Kenya')}, "
        f"max {state.get('max_leads', 20)} leads.\n\n"
        f"Step 1 — scrape Google Maps for '{icp.get('industry')}' in '{icp.get('location')}'. "
        f"Then call get_leads(status='new') to retrieve them. "
        f"For each lead with a website, call scrape_website and extract_contacts_from_page. "
        f"Call enrich_lead_email for leads still missing an email. "
        f"Return the full RESEARCH REPORT."
    )

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        config={"configurable": {"thread_id": state["run_id"] + "-research"}},
    )

    last = result["messages"][-1]
    content = _get_content(last)

    return {
        "messages": state["messages"] + [
            AIMessage(content=content, name="research_agent")
        ]
    }


async def run_qualify(state: AgentRunState) -> dict:
    """Call the qualifier agent with research output."""
    agent = create_qualifier_agent(get_fast_llm())

    # Pull research report from messages
    research_report = _last_named_message(state["messages"], "research_agent")
    icp = state["icp"]

    prompt = (
        f"Here is the research report from the previous step:\n\n{research_report}\n\n"
        f"ICP: industry={icp.get('industry')}, location={icp.get('location')}, "
        f"min_rating={icp.get('min_rating', 3.0)}, campaign_goal={state['campaign_goal']}\n\n"
        f"Use score_lead for EVERY lead listed above. "
        f"Then call update_lead_status for each (QUALIFIED→'new', REJECTED→'unsubscribed'). "
        f"Return the QUALIFICATION SUMMARY."
    )

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        config={"configurable": {"thread_id": state["run_id"] + "-qualify"}},
    )

    last = result["messages"][-1]
    content = _get_content(last)

    return {
        "messages": state["messages"] + [
            AIMessage(content=content, name="qualifier_agent")
        ]
    }


async def run_personalize(state: AgentRunState) -> dict:
    """Call the personalization agent with qualified leads."""
    agent = create_personalization_agent(get_smart_llm())

    research_report    = _last_named_message(state["messages"], "research_agent")
    qualification_summary = _last_named_message(state["messages"], "qualifier_agent")

    prompt = (
        f"Research data:\n{research_report}\n\n"
        f"Qualification results:\n{qualification_summary}\n\n"
        f"Write full outreach (cold email + WhatsApp + follow-up email) for every QUALIFIED lead. "
        f"Call get_local_context first for each city/industry combination. "
        f"Then call generate_email_sequence for each lead. "
        f"Use the campaign goal to shape the pitch: {state['campaign_goal']}\n"
        f"Return complete outreach packages for all qualified leads."
    )

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        config={"configurable": {"thread_id": state["run_id"] + "-personalize"}},
    )

    last = result["messages"][-1]
    content = _get_content(last)

    return {
        "messages": state["messages"] + [
            AIMessage(content=content, name="personalization_agent")
        ]
    }


async def run_execute(state: AgentRunState) -> dict:
    """Call the executor agent to send outreach."""
    agent = create_executor_agent(get_fast_llm())

    research_report    = _last_named_message(state["messages"], "research_agent")
    qualification_summary = _last_named_message(state["messages"], "qualifier_agent")
    outreach_packages  = _last_named_message(state["messages"], "personalization_agent")

    prompt = (
        f"Lead contact details (from research):\n{research_report}\n\n"
        f"Qualified leads:\n{qualification_summary}\n\n"
        f"Outreach content:\n{outreach_packages}\n\n"
        f"Send email and WhatsApp to every QUALIFIED lead using the content above. "
        f"For SMEs (restaurants, cafes, retail, hotels): send WhatsApp first. "
        f"For formal businesses (law, healthcare): send email first. "
        f"After each send, call update_lead_status with 'contacted'. "
        f"Schedule a 3-day follow-up with schedule_follow_up. "
        f"Finally call get_campaign_stats() and return the EXECUTION REPORT."
    )

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        config={"configurable": {"thread_id": state["run_id"] + "-execute"}},
    )

    last = result["messages"][-1]
    content = _get_content(last)

    return {
        "messages": state["messages"] + [
            AIMessage(content=content, name="executor_agent")
        ]
    }


def check_for_high_value(state: AgentRunState) -> Literal["execute", "pause"]:
    """
    After personalization, check if any HIGH_VALUE leads were flagged.
    HIGH_VALUE leads need human approval before we send — pause for review.
    For now we always proceed to execute; the executor itself will pause those leads.
    """
    qual = _last_named_message(state["messages"], "qualifier_agent")
    if "HIGH_VALUE" in qual:
        # Flag it — executor will handle the pause per-lead
        return "execute"
    return "execute"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_content(msg: Any) -> str:
    """Extract text from any LangChain message."""
    content = getattr(msg, "content", "") or ""
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    parts.append(f"[tool: {block.get('name')}]")
            else:
                parts.append(str(block))
        content = " ".join(p for p in parts if p).strip()
    return content or "[agent produced no text output]"


def _last_named_message(messages: list, name: str) -> str:
    """Return the content of the last message from a named agent."""
    for msg in reversed(messages):
        if getattr(msg, "name", None) == name:
            return _get_content(msg)
    return f"[no output from {name} found]"


# ── Graph assembly ────────────────────────────────────────────────────────────

def build_supervisor_graph(checkpointer=None):
    """
    Build the 4-agent sequential pipeline as a LangGraph StateGraph.
    Routing is deterministic Python — no LLM handoff tool calls required.
    """
    builder = StateGraph(AgentRunState)

    builder.add_node("research",     run_research)
    builder.add_node("qualify",      run_qualify)
    builder.add_node("personalize",  run_personalize)
    builder.add_node("execute",      run_execute)

    builder.set_entry_point("research")
    builder.add_edge("research",    "qualify")
    builder.add_edge("qualify",     "personalize")
    builder.add_conditional_edges("personalize", check_for_high_value)
    builder.add_edge("execute",     END)

    graph = builder.compile(
        checkpointer=checkpointer or MemorySaver(),
    )
    return graph
