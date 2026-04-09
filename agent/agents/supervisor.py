"""
Supervisor — builds the individual agents only.
Orchestration is done sequentially in api/main.py _background_run()
to avoid LLM-based routing loops.
"""
from agent.llm import get_fast_llm, get_smart_llm
from agent.agents.researcher import create_research_agent
from agent.agents.qualifier import create_qualifier_agent
from agent.agents.personalizer import create_personalization_agent


def build_supervisor_graph(checkpointer=None):
    """
    Returns a dict of compiled individual agents.
    The caller (api/main.py) runs them sequentially:
      research → qualifier → personalization
    This avoids LLM-based routing loops entirely.
    """
    return {
        "research":      create_research_agent(get_smart_llm()),
        "qualifier":     create_qualifier_agent(get_fast_llm()),
        "personalizer":  create_personalization_agent(get_smart_llm()),
    }
