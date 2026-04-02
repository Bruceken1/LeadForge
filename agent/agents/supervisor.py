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
You coordinate 4 agents in strict sequence. Each agent runs ONCE then you move on.

AGENTS:
- research_agent        → scrapes Google Maps, enriches leads
- qualifier_agent       → scores leads 0-100 against ICP
- personalization_agent → writes email + WhatsApp per qualified lead
- executor_agent        → sends outreach, updates CRM

SEQUENCE — follow exactly, no repeats:

STEP 1: Call research_agent ONCE with the keyword and location.
  Accept whatever leads it returns. Do NOT retry if the industry doesn't match —
  the scraper returns what Google Maps has. Move to step 2 immediately.

STEP 2: Call qualifier_agent ONCE with the full RESEARCH REPORT.
  Pass all leads even if the industry looks wrong — the qualifier will score them.

STEP 3: Call personalization_agent ONCE with all QUALIFIED leads from the
  QUALIFICATION SUMMARY. Include lead_id, name, email, phone, city, industry,
  rating, and description for each.

STEP 4: Call executor_agent ONCE with the complete outreach packages —
  lead_id, name, email, phone, email_subject, email_body, whatsapp_message.

STEP 5: Output a final CAMPAIGN SUMMARY with counts of leads found, qualified,
  emails sent, and WhatsApp messages sent.

RULES:
- Each agent is called EXACTLY ONCE. Never call the same agent twice.
- If research returns 0 leads: skip to CAMPAIGN SUMMARY with "0 leads found".
- If research returns leads from a different industry: pass them to the qualifier anyway.
- ICP score >=85 AND reviews >100 AND has email → flag HIGH_VALUE for human review.
- Never fabricate data. Use only what tool results return.
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
