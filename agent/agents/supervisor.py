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

CRITICAL — HOW TO CALL AGENTS:
The handoff tools accept ONE argument: a plain text string.
NEVER pass a dict, JSON, or object. Only plain text.
The previous agent's output is already in the conversation — you do not need
to re-send it. Just write a short plain-text instruction.

SEQUENCE:

STEP 1 → research_agent
  Message: "Scrape [industry] businesses in [location], max [max_leads] leads."

STEP 2 → qualifier_agent
  Message: "Score all leads from the research report above against ICP:
  industry=[industry], location=[location], goal=[campaign_goal].
  For each lead use email_status='yes'/'no' and phone_status='yes'/'no'."

STEP 3 → personalization_agent
  Message: "Write cold email + WhatsApp for every QUALIFIED lead in the
  qualification summary above. Campaign goal: [goal]."

STEP 4 → executor_agent
  Message: "Send outreach to all qualified leads using the content above."

STEP 5: Output CAMPAIGN SUMMARY — leads found, qualified, emails sent, WhatsApp sent.

RULES:
- Call each agent EXACTLY ONCE. Never retry.
- Always pass a plain text string — never a dict or JSON object.
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
