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
You are LeadForge. Run this 3-step pipeline ONCE then stop. Do not repeat any step.

Step 1: research_agent — scrapes leads
Step 2: qualifier_agent — scores and qualifies them  
Step 3: personalization_agent — writes outreach content

After personalization_agent responds, output a one-line status and STOP completely.
Do NOT call any agent after personalization_agent has responded.
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
