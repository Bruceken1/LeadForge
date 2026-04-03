"""
Qualifier Agent — Scores each lead against the ICP.
"""
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from agent.llm import get_fast_llm
from agent.tools.leadengine import update_lead_status

QUALIFIER_SYSTEM = """
You are the Qualifier Agent for LeadForge. Score each lead against the ICP.

Use score_lead for EVERY lead. Then call update_lead_status for each.

IMPORTANT — how to call score_lead:
- email_status: pass "yes" if the lead has an email address, "no" if not
- phone_status: pass "yes" if the lead has a phone number, "no" if not
- rating: pass the numeric rating as a string e.g. "4.9"
- review_count: pass the number of reviews as a string e.g. "190"

Return a QUALIFICATION SUMMARY:
---------------------
Total scored: X
Qualified: Y → [names]
Rejected: Z → [names]
High-value (score>=85, reviews>100, has email): [names if any]
"""


@tool
def score_lead(
    lead_name: str,
    industry: str,
    city: str,
    rating: str,
    review_count: str,
    email_status: str,
    phone_status: str,
    website_description: str,
    icp_industry: str,
    icp_location: str,
    campaign_goal: str,
) -> str:
    """
    Score a lead against the ICP criteria.
    email_status: 'yes' or 'no' — whether the lead has an email address.
    phone_status: 'yes' or 'no' — whether the lead has a phone number.
    rating: numeric rating as a string e.g. '4.9'.
    review_count: number of reviews as a string e.g. '190'.
    All other fields are plain strings.
    """
    try:
        r = float(rating)
    except (ValueError, TypeError):
        r = 0.0
    try:
        rc = int(review_count)
    except (ValueError, TypeError):
        rc = 0

    has_email = str(email_status).strip().lower() in ("yes", "true", "1")
    has_phone = str(phone_status).strip().lower() in ("yes", "true", "1")

    score = 0
    reasons = []

    # 1. Industry match (0-20)
    if icp_industry.lower() in industry.lower() or industry.lower() in icp_industry.lower():
        score += 20
        reasons.append(f"Industry match: '{industry}' ↔ '{icp_industry}' (+20)")
    elif any(w in industry.lower() for w in icp_industry.lower().split() if len(w) > 3):
        score += 10
        reasons.append(f"Partial industry match (+10)")
    else:
        reasons.append(f"Industry mismatch: '{industry}' vs '{icp_industry}' (+0)")

    # 2. Location match (0-20)
    if city.lower() in icp_location.lower() or icp_location.lower() in city.lower():
        score += 20
        reasons.append(f"Location match: '{city}' in '{icp_location}' (+20)")
    else:
        reasons.append(f"Location mismatch: '{city}' vs '{icp_location}' (+0)")

    # 3. Reputation (0-20)
    if r >= 4.0 and rc >= 50:
        score += 20
        reasons.append(f"Strong: {r}★, {rc} reviews (+20)")
    elif r >= 3.5 and rc >= 20:
        score += 14
        reasons.append(f"Good: {r}★, {rc} reviews (+14)")
    elif r >= 3.0 and rc >= 5:
        score += 8
        reasons.append(f"Moderate: {r}★, {rc} reviews (+8)")
    else:
        score += 2
        reasons.append(f"Weak: {r}★, {rc} reviews (+2)")

    # 4. Contact (0-20, penalty if none)
    if has_email and has_phone:
        score += 20
        reasons.append("Email + phone (+20)")
    elif has_email:
        score += 16
        reasons.append("Email only (+16)")
    elif has_phone:
        score += 10
        reasons.append("Phone only — WhatsApp possible (+10)")
    else:
        score -= 20
        reasons.append("No contact info (-20)")

    # 5. Relevance (0-20)
    desc = (website_description or "").lower()
    hits = sum(1 for w in campaign_goal.lower().split() if len(w) > 4 and w in desc)
    if hits >= 3:
        score += 20
        reasons.append(f"High relevance: {hits} keyword matches (+20)")
    elif hits >= 1:
        score += 12
        reasons.append(f"Moderate relevance (+12)")
    else:
        score += 3
        reasons.append("Low relevance (+3)")

    score = max(0, min(100, score))

    if score >= 80:
        decision, priority = "QUALIFIED", "HIGH"
    elif score >= 60:
        decision, priority = "QUALIFIED", "MEDIUM"
    elif score >= 40:
        decision, priority = "QUALIFIED", "LOW"
    else:
        decision, priority = "REJECTED", "NONE"

    high_value = score >= 85 and rc > 100 and has_email
    hv = "\n⭐ HIGH_VALUE — pause for human review" if high_value else ""

    reasons_str = "\n".join(f"  {i+1}. {r}" for i, r in enumerate(reasons[:3]))
    return (
        f"SCORE: {score}/100 | DECISION: {decision} | PRIORITY: {priority}{hv}\n"
        f"Lead: {lead_name} ({industry}, {city})\n"
        f"Reasons:\n{reasons_str}\n"
        f"Contact: email={'yes' if has_email else 'no'}, phone={'yes' if has_phone else 'no'}"
    )


def create_qualifier_agent(llm=None):
    return create_react_agent(
        model=llm or get_fast_llm(),
        tools=[score_lead, update_lead_status],
        name="qualifier_agent",
        prompt=QUALIFIER_SYSTEM,
    )
