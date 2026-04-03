"""
Supervisor Agent — Orchestrator.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent
from agent.agents.executor import create_executor_agent

SUPERVISOR_SYSTEM = """\
You are LeadForge, an autonomous SDR. Run this 4-step pipeline EXACTLY ONCE then stop.

Step 1: research_agent
Step 2: qualifier_agent
Step 3: personalization_agent
Step 4: executor_agent

After executor_agent finishes, output a one-paragraph summary and STOP.
Do NOT call any agent again after the summary. The pipeline runs once and ends.
HIGH_VALUE leads are handled by executor_agent — do not restart the pipeline for them.
"""


def build_supervisor_graph(checkpointer=None):
    workflow = create_supervisor(
        agents=[
            create_research_agent(get_smart_llm()),
            create_qualifier_agent(get_fast_llm()),
            create_personalization_agent(get_smart_llm()),
            create_executor_agent(get_smart_llm()),   # upgraded from fast to smart
        ],
        model=get_smart_llm(),
        prompt=SUPERVISOR_SYSTEM,
        output_mode="last_message",
        add_handoff_back_messages=True,
    )
    return workflow.compile(checkpointer=checkpointer or MemorySaver())
