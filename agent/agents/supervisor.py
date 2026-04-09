"""
Supervisor Agent — Orchestrator. 3-step pipeline only: research → qualify → personalize.
Execution is handled directly by main.py after the graph completes.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent


SUPERVISOR_SYSTEM = """\
You are LeadForge. Run this 3-step pipeline EXACTLY ONCE then stop.

STRICT ORDER — follow it exactly, no exceptions:
  Step 1: Call transfer_to_research_agent  → wait for the RESEARCH REPORT
  Step 2: Call transfer_to_qualifier_agent → wait for the QUALIFICATION SUMMARY
  Step 3: Call transfer_to_personalization_agent → wait for the OUTREACH PACKAGES

CRITICAL RULES:
- Transfer to each agent EXACTLY ONCE. Never call the same agent twice.
- After research_agent responds with a RESEARCH REPORT, move to qualifier_agent immediately.
- After qualifier_agent responds (even with partial results), move to personalization_agent.
- After personalization_agent responds, output one line: "Pipeline complete." and STOP.
- If any agent reports an error, skip to the next agent — do NOT retry.
- NEVER transfer back to research_agent after it has already responded.
- NEVER loop. If you have already called an agent, do not call it again.
"""


def build_supervisor_graph(checkpointer=None):
    workflow = create_supervisor(
        agents=[
            create_research_agent(get_smart_llm()),
            create_qualifier_agent(get_fast_llm()),
            create_personalization_agent(get_smart_llm()),
        ],
        model=get_smart_llm(),
        prompt=SUPERVISOR_SYSTEM,
        output_mode="last_message",
        add_handoff_back_messages=False,   # prevents full history re-injection that causes loops
    )
    return workflow.compile(checkpointer=checkpointer or MemorySaver())
