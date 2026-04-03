"""
Supervisor Agent — Orchestrator
Coordinates research → qualify → personalize → execute in strict order.
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
You have 4 specialist agents. Execute them in STRICT ORDER — one at a time.

AGENTS:
- research_agent        → scrapes Google Maps, enriches leads, returns RESEARCH REPORT
- qualifier_agent       → scores leads against ICP, returns QUALIFICATION SUMMARY
- personalization_agent → writes email + WhatsApp per qualified lead, returns OUTREACH PACKAGES
- executor_agent        → calls send tools for real, returns EXECUTION REPORT with Message IDs

STRICT WORKFLOW — follow exactly, do not skip, do not repeat:
STEP 1: Call research_agent ONCE with: industry, location, max_leads from the campaign brief.
         Wait for RESEARCH REPORT before proceeding.
STEP 2: Call qualifier_agent ONCE with the full RESEARCH REPORT.
         Wait for QUALIFICATION SUMMARY before proceeding.
STEP 3: Call personalization_agent ONCE with the QUALIFIED leads list from step 2.
         Include for each lead: lead_id, name, email, phone, city, industry, rating, description.
         Wait for OUTREACH PACKAGES before proceeding.
STEP 4: Call executor_agent ONCE with ALL of the following for each qualified lead:
         - lead_id (integer — from research report)
         - name
         - email
         - phone
         - email_subject (from personalizer)
         - email_body (from personalizer)
         - whatsapp_message (from personalizer)
         Wait for EXECUTION REPORT with real Message IDs before proceeding.
STEP 5: Output a final campaign summary and STOP. Do not call any agent again.

DECISION RULES:
- ICP score >=85 AND reviews >100 AND has email → mark HIGH_VALUE in executor brief
- If an agent errors → retry once, then skip that lead and continue
- After step 4 is complete, output summary and finish — do not loop back to step 1

ANTI-FABRICATION RULES (MANDATORY):
- NEVER invent data. Every piece of information must come from an agent's actual response.
- NEVER call an agent a second time for the same step.
- NEVER skip to the summary without completing all 4 steps.
- NEVER assume an agent succeeded — wait for its explicit report.
"""


def build_supervisor_graph(checkpointer=None):
    llm_fast  = get_fast_llm()
    llm_smart = get_smart_llm()

    research_node     = create_research_agent(llm_smart)
    qualifier_node    = create_qualifier_agent(llm_fast)
    personalizer_node = create_personalization_agent(llm_smart)
    executor_node     = create_executor_agent(llm_fast)

    try:
        workflow = create_supervisor(
            agents=[research_node, qualifier_node, personalizer_node, executor_node],
            model=llm_smart,
            prompt=SUPERVISOR_SYSTEM,
            output_mode="last_message",
            add_handoff_back_messages=True,
        )
    except TypeError:
        workflow = create_supervisor(
            agents=[research_node, qualifier_node, personalizer_node, executor_node],
            model=llm_smart,
            system_prompt=SUPERVISOR_SYSTEM,
        )

    return workflow.compile(checkpointer=checkpointer or MemorySaver())
