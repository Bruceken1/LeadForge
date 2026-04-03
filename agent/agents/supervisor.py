"""
Supervisor Agent — Orchestrator.
Simple 4-step pipeline: research → qualify → personalize → execute.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph_supervisor import create_supervisor

from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent
from agent.agents.executor import create_executor_agent

SUPERVISOR_SYSTEM = """\
You are LeadForge, an autonomous SDR. Run this 4-step pipeline once and stop.

Step 1: research_agent — finds leads
Step 2: qualifier_agent — scores them
Step 3: personalization_agent — writes outreach
Step 4: executor_agent — sends messages

Rules:
- Call each agent ONCE in order. Never call any agent a second time.
- Whatever research_agent returns is final — accept it and move to qualifier_agent immediately.
- After executor_agent responds, write a brief summary and stop.
"""


def build_supervisor_graph(checkpointer=None):
    workflow = create_supervisor(
        agents=[
            create_research_agent(get_smart_llm()),
            create_qualifier_agent(get_fast_llm()),
            create_personalization_agent(get_smart_llm()),
            create_executor_agent(get_fast_llm()),
        ],
        model=get_smart_llm(),
        prompt=SUPERVISOR_SYSTEM,
        output_mode="last_message",
        add_handoff_back_messages=True,
    )
    return workflow.compile(checkpointer=checkpointer or MemorySaver())
