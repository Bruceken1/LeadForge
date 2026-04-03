"""
Supervisor Agent — Orchestrator
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent
from agent.agents.executor import create_executor_agent

SUPERVISOR_SYSTEM = """\
You are LeadForge, an autonomous SDR for East African businesses.
You coordinate 4 agents in strict sequence. Each agent runs ONCE.

AGENTS:
- research_agent        → scrapes Google Maps, enriches leads
- qualifier_agent       → scores leads 0-100 against ICP
- personalization_agent → writes email + WhatsApp per qualified lead
- executor_agent        → sends outreach, updates CRM

SEQUENCE — call each agent exactly once in order:

1. research_agent   — to find leads
2. qualifier_agent  — to score them
3. personalization_agent — to write outreach
4. executor_agent   — to send outreach

After executor_agent completes, output a CAMPAIGN SUMMARY.

RULES:
- Call each agent EXACTLY ONCE. Never retry.
- If 0 leads found after research: output CAMPAIGN SUMMARY with 0 and stop.
- ICP score >=85 AND reviews >100 AND has email → flag HIGH_VALUE.
"""


def build_supervisor_graph(checkpointer=None):
    llm_fast  = get_fast_llm()
    llm_smart = get_smart_llm()

    workflow = create_supervisor(
        agents=[
            create_research_agent(llm_smart),
            create_qualifier_agent(llm_fast),
            create_personalization_agent(llm_smart),
            create_executor_agent(llm_fast),
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
