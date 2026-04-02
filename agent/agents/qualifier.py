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

Use the score_lead tool for EVERY lead you receive. It returns a structured
score and decision based on real criteria — trust its output.
Then call update_lead_status to persist the result in the CRM.

After scoring all leads, return a structured summary:
QUALIFICATION SUMMARY
---------------------
Total scored: X
Qualified: Y  →  [name1, name2, ...]
Rejected: Z   →  [name3, ...]
High-value (score >=85, reviews>100, has email): [names if any]

Always produce this summary so the supervisor can route to the next step.

ANTI-FABRICATION RULES (MANDATORY — never break these):
- NEVER invent, assume, or fabricate any data. Every piece of information you use must come from a tool call result.
- NEVER write a summary, report, or status update before calling the required tools.
- If a tool returns an error, report the error exactly. Do not pretend it succeeded.
- If you do not have a required piece of data (e.g. email address, lead_id), call the appropriate tool to get it. Do not guess.
- A Message ID or SID in the tool response is proof of a real action. No ID = nothing happened.
- If you cannot complete a step because data is missing, say exactly what is missing and stop. Do not fabricate a workaround.
"""


@tool
def score_lead(
    lead_name: str,
    industry: str,
    city: str,
    rating: str,
    review_count: str,
    has_email: bool,
    has_phone: bool,
    website_description: str,
    icp_industry: str,
    icp_location: str,
    campaign_goal: str,
) -> str:
    """
    Score a lead against the ICP criteria using a deterministic rubric.
    Returns a score (0-100), QUALIFIED/REJECTED decision, priority tier,
    HIGH_VALUE flag, and the top 3 scoring reasons.
    rating and review_count accept strings or numbers — both work.
    """
    try:
        rating = float(rating)
    except (ValueError, TypeError):
        rating = 0.0
    try:
        review_count = int(review_count)
    except (ValueError, TypeError):
        review_count = 0
    score = 0
    reasons = []

    # 1. Industry match (0-20)
    icp_ind_lower = icp_industry.lower()
    lead_ind_lower = industry.lower()
    if icp_ind_lower in lead_ind_lower or lead_ind_lower in icp_ind_lower:
        score += 20
        reasons.append(f"Industry match: '{industry}' aligns with target '{icp_industry}' (+20)")
    elif any(word in lead_ind_lower for word in icp_ind_lower.split() if len(word) > 3):
        score += 10
        reasons.append(f"Partial industry match: '{industry}' partially matches '{icp_industry}' (+10)")
    else:
        reasons.append(f"Industry mismatch: '{industry}' vs target '{icp_industry}' (+0)")

    # 2. Location match (0-20)
    icp_loc_lower = icp_location.lower()
    city_lower = city.lower()
    icp_cities = [c.strip() for c in icp_loc_lower.replace(",", " ").split()]
    if city_lower in icp_loc_lower or any(city_lower in c for c in icp_cities):
        score += 20
        reasons.append(f"Location match: '{city}' is in target area '{icp_location}' (+20)")
    elif any(c in city_lower for c in icp_cities if len(c) > 3):
        score += 10
        reasons.append(f"Partial location match: '{city}' near '{icp_location}' (+10)")
    else:
        reasons.append(f"Location mismatch: '{city}' vs target '{icp_location}' (+0)")

    # 3. Size signals — rating + review count (0-20)
    if rating >= 4.0 and review_count >= 50:
        score += 20
        reasons.append(f"Strong reputation: {rating}★, {review_count} reviews (+20)")
    elif rating >= 3.5 and review_count >= 20:
        score += 14
        reasons.append(f"Good reputation: {rating}★, {review_count} reviews (+14)")
    elif rating >= 3.0 and review_count >= 5:
        score += 8
        reasons.append(f"Moderate reputation: {rating}★, {review_count} reviews (+8)")
    else:
        score += 2
        reasons.append(f"Weak signals: {rating}★, {review_count} reviews (+2)")

    # 4. Contact availability (0-20, penalty if none)
    if has_email and has_phone:
        score += 20
        reasons.append("Full contact info: email + phone (+20)")
    elif has_email:
        score += 16
        reasons.append("Email available (primary outreach channel) (+16)")
    elif has_phone:
        score += 10
        reasons.append("Phone only — WhatsApp outreach possible (+10)")
    else:
        score -= 20
        reasons.append("No contact info at all — critical gap (-20)")

    # 5. Relevance to campaign goal (0-20)
    desc_lower = (website_description or "").lower()
    goal_lower = campaign_goal.lower()
    goal_keywords = [w for w in goal_lower.split() if len(w) > 4]
    keyword_hits = sum(1 for kw in goal_keywords if kw in desc_lower)
    if keyword_hits >= 3:
        score += 20
        reasons.append(f"High campaign relevance: {keyword_hits} keyword matches in description (+20)")
    elif keyword_hits >= 1:
        score += 12
        reasons.append(f"Moderate relevance: {keyword_hits} keyword match(es) in description (+12)")
    elif website_description and len(website_description) > 30:
        score += 8
        reasons.append("Has website content but low keyword overlap with campaign goal (+8)")
    else:
        score += 3
        reasons.append("Minimal description — hard to assess relevance (+3)")

    score = max(0, min(100, score))

    # Decision
    if score >= 80:
        decision, priority = "QUALIFIED", "HIGH"
    elif score >= 60:
        decision, priority = "QUALIFIED", "MEDIUM"
    elif score >= 40:
        decision, priority = "QUALIFIED", "LOW"
    else:
        decision, priority = "REJECTED", "NONE"

    high_value = score >= 85 and review_count > 100 and has_email
    hv_note = "\n⭐ HIGH_VALUE — pause for human review before sending" if high_value else ""

    reason_str = "\n".join(f"  {i+1}. {r}" for i, r in enumerate(reasons[:3]))

    return (
        f"SCORE: {score}/100 | DECISION: {decision} | PRIORITY: {priority}{hv_note}\n"
        f"Lead: {lead_name} ({industry}, {city})\n"
        f"Top reasons:\n{reason_str}\n"
        f"Contact: email={'yes' if has_email else 'no'}, phone={'yes' if has_phone else 'no'}"
    )


def create_qualifier_agent(llm=None):
    return create_react_agent(
        model=llm or get_fast_llm(),
        tools=[score_lead, update_lead_status],
        name="qualifier_agent",
        prompt=QUALIFIER_SYSTEM,
    )
