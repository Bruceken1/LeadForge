"""
Qualifier Agent — Scores each lead against the ICP.
Rejects weak leads, flags high-value ones for human review.
"""
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from agent.llm import get_fast_llm
from agent.tools.leadengine import update_lead_status

QUALIFIER_SYSTEM = """
You are the Qualifier Agent for LeadForge. Your job is to score each lead
against the Ideal Customer Profile (ICP) provided and make a binary decision:
QUALIFY or REJECT.

ICP scoring criteria (each worth up to 20 points, total = 100):
1. Industry match (is the business in the target industry?)
2. Location match (is it in the target city/region?)
3. Size signals (Google rating + review count suggests active business)
4. Contact availability (do we have an email or phone?)
5. Relevance (based on website content, would they benefit from our services?)

Score calculation:
- 80-100: QUALIFIED — high priority, proceed immediately
- 60-79:  QUALIFIED — medium priority
- 40-59:  LOW PRIORITY — qualify but note low confidence
- 0-39:   REJECTED — not a fit, skip

Special flags:
- If score >= 85 AND reviews > 100 AND has email: flag as HIGH_VALUE for human review
- If "recent negative news" in research: add -15 penalty
- If no contact info at all (no email AND no phone): add -20 penalty

Always provide:
1. The score (0-100)
2. The 3 reasons that most influenced the score
3. Your decision: QUALIFIED / REJECTED
4. If HIGH_VALUE: a brief explanation of why this is a priority account

Be decisive. The goal is to protect the sender's email reputation by
only contacting businesses most likely to respond positively.
"""


@tool
def score_lead(
    lead_name: str,
    industry: str,
    city: str,
    rating: float,
    review_count: int,
    has_email: bool,
    has_phone: bool,
    website_description: str,
    icp_industry: str,
    icp_location: str,
    campaign_goal: str,
) -> str:
    """
    Score a lead against the ICP criteria.
    Returns a score (0-100), decision (QUALIFIED/REJECTED), and reasoning.
    """
    # This is a tool the LLM calls — the LLM does the actual reasoning
    return (
        f"Scoring lead: {lead_name} | Industry: {industry} | City: {city} | "
        f"Rating: {rating} ({review_count} reviews) | "
        f"Email: {has_email} | Phone: {has_phone} | "
        f"ICP target: {icp_industry} in {icp_location} | "
        f"Campaign goal: {campaign_goal}"
    )


def create_qualifier_agent(llm=None):
    return create_react_agent(
        model=llm or get_fast_llm(),
        tools=[score_lead, update_lead_status],
        name="qualifier_agent",
        prompt=QUALIFIER_SYSTEM,
    )
