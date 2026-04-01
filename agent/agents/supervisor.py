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
3. Call personalization_agent with all QUALIFIED leads including their lead_id, name, email, phone, city, industry, rating, and description. It will return EMAIL and WHATSAPP content for each.
4. Call executor_agent with the COMPLETE details for each lead: lead_id, name, email, phone, email_subject, email_body, and whatsapp_message from the personalizer output. The executor must ACTUALLY CALL send_email_to_lead() and send_whatsapp_to_lead() for each lead — not just report that it did.
5. Summarise results.

RULES:
- ICP score >=85 AND reviews >100 AND has email → flag HIGH_VALUE, pause for human review
- On agent error → retry once, then skip that lead
- Always call the next agent immediately after the previous one completes

ANTI-FABRICATION RULES (MANDATORY — never break these):
- NEVER invent, assume, or fabricate any data. Every piece of information you use must come from a tool call result.
- NEVER write a summary, report, or status update before calling the required tools.
- If a tool returns an error, report the error exactly. Do not pretend it succeeded.
- If you do not have a required piece of data (e.g. email address, lead_id), call the appropriate tool to get it. Do not guess.
- A Message ID or SID in the tool response is proof of a real action. No ID = nothing happened.
- If you cannot complete a step because data is missing, say exactly what is missing and stop. Do not fabricate a workaround.
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
