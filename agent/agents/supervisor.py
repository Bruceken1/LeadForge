"""
Supervisor Agent — Orchestrator
Coordinates all 4 sub-agents via langgraph-supervisor.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent
from agent.agents.executor import create_executor_agent

# Concise, action-first prompt — avoids analysis paralysis on small models
SUPERVISOR_SYSTEM = """\
You are LeadForge, an autonomous SDR for East African businesses.
You have 4 agents. Always start by calling research_agent immediately.

AGENTS:
- research_agent       → scrapes Google Maps, enriches leads
- qualifier_agent      → scores leads 0-100 against the ICP
- personalization_agent → writes personalised email + WhatsApp per lead
- executor_agent       → sends outreach, updates CRM

STRICT ORDER — do not skip steps:
1. Call research_agent: "Scrape {industry} in {location}, max {max} leads. Enrich emails. Return RESEARCH REPORT."
2. Call qualifier_agent: "Score all leads against ICP: {icp}. Return QUALIFICATION SUMMARY."
3. Call personalization_agent: "Write outreach for each QUALIFIED lead. Return outreach packages."
4. Call executor_agent: "Send email and WhatsApp to all qualified leads. Return EXECUTION REPORT."
5. Summarise results.

RULES:
- ICP score >=85 AND reviews >100 AND has email → flag HIGH_VALUE, pause for human review
- On agent error → retry once, then skip that lead
- Always call the next agent immediately after the previous one completes
"""


def build_supervisor_graph(checkpointer=None):
    llm_fast  = get_fast_llm()
    llm_smart = get_smart_llm()

    research_node     = create_research_agent(llm_smart)
    qualifier_node    = create_qualifier_agent(llm_fast)
    personalizer_node = create_personalization_agent(llm_smart)
    executor_node     = create_executor_agent(llm_fast)

    workflow = create_supervisor(
        agents=[
            research_node,
            qualifier_node,
            personalizer_node,
            executor_node,
        ],
        model=llm_smart,
        prompt=SUPERVISOR_SYSTEM,
        output_mode="last_message",
        add_handoff_back_messages=True,
    )

    graph = workflow.compile(
        checkpointer=checkpointer or MemorySaver(),
    )
    return graph
