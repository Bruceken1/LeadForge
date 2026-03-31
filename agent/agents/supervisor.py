"""
Supervisor Agent — Orchestrator
Coordinates all 4 sub-agents via langgraph-supervisor.
Handles routing, error recovery, human-in-the-loop for high-value leads.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent
from agent.agents.executor import create_executor_agent

SUPERVISOR_SYSTEM = """
You are LeadForge — an autonomous SDR (Sales Development Representative) for East African businesses.
You coordinate 4 specialized agents to find, qualify, personalize and contact leads automatically.

YOUR AGENTS:
- research_agent    → scrapes Google Maps, browses websites, finds decision makers
- qualifier_agent   → scores each lead 0-100 against the ICP, approves or rejects
- personalization_agent → writes personalized email + WhatsApp for each qualified lead
- executor_agent    → sends the outreach and updates CRM pipeline stages

WORKFLOW (follow in order for each batch):
1. Call research_agent: "Scrape {industry} in {location}, max {max} leads, then enrich emails"
2. Call qualifier_agent: "Score and filter the leads against ICP: {icp}"
3. For each QUALIFIED lead, call personalization_agent: "Write outreach for {lead_name}, {city}, {description}"
4. For each personalized lead, call executor_agent: "Send email and WhatsApp to {lead_name}"
5. After batch completes, reflect: summarize results and suggest next steps.

DECISION RULES:
- ICP score >= 85 AND reviews > 100 AND has email → flag as HIGH_VALUE, ask executor_agent to pause for human review
- If an agent errors → try once more, then skip the lead with a log entry
- Send WhatsApp first for SMEs (restaurants, retail, hotels) — higher open rate in East Africa
- Send email first for formal businesses (law, healthcare, corporate)

STATUS UPDATES:
After each agent call, give a brief update: "[Agent] completed — X leads found/qualified/sent"
Keep updates concise so the user can follow progress in real time.

EAST AFRICA CONTEXT:
- Business culture is relationship-first — never aggressive sales language
- Nairobi: formal CBD, casual Westlands/Karen; Mombasa: coastal, Swahili-friendly
- WhatsApp is the primary business communication tool in Kenya and Tanzania
- Starting WhatsApp with "Habari" is acceptable and appreciated for local businesses
"""


def build_supervisor_graph(checkpointer=None):
    """
    Build and compile the 5-agent LangGraph supervisor.
    Uses MemorySaver by default (in-memory checkpointing for state persistence).
    For production, swap MemorySaver for AsyncPostgresSaver with your DB.
    """
    llm_fast  = get_fast_llm()
    llm_smart = get_smart_llm()

    research_node       = create_research_agent(llm_smart)
    qualifier_node      = create_qualifier_agent(llm_fast)
    personalizer_node   = create_personalization_agent(llm_smart)
    executor_node       = create_executor_agent(llm_fast)

    # langgraph-supervisor builds the supervisor + subagent graph automatically
    workflow = create_supervisor(
        agents=[
            research_node,
            qualifier_node,
            personalizer_node,
            executor_node,
        ],
        model=llm_smart,
        prompt=SUPERVISOR_SYSTEM,
        output_mode="last_message",   # stream final message only
        add_handoff_back_messages=True,
    )

    graph = workflow.compile(
        checkpointer=checkpointer or MemorySaver(),
    )
    return graph
