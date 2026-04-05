"""
Qualifier Agent — Scores leads against the ICP using a deterministic rubric.
"""
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from agent.llm import get_fast_llm
from agent.tools.leadengine import update_lead_status

QUALIFIER_SYSTEM = """
You are the Qualifier Agent for LeadForge. You score every lead from the RESEARCH REPORT
against the ICP and decide QUALIFY or REJECT.

MANDATORY WORKFLOW:
1. For EVERY lead in the research report, call score_lead() with data from that report.
   You MUST call score_lead for each lead — never skip a lead.
2. For each QUALIFIED lead, call update_lead_status(lead_id=<integer>, status='new', notes='qualified').
3. For each REJECTED lead, call update_lead_status(lead_id=<integer>, status='new', notes='rejected').
4. Return the QUALIFICATION SUMMARY below.

OUTPUT FORMAT:

QUALIFICATION SUMMARY
---------------------
Total scored: X
Qualified: Y  →  [list names]
Rejected: Z   →  [list names]
High-value (score >=85, reviews>100, has email): [names or 'none']

QUALIFIED LEAD DETAILS (include for each qualified lead — needed by personalizer and executor):
[For each qualified lead:]
  lead_id: [integer — CRITICAL]
  Name: [name]
  Email: [email or 'none']
  Phone: [phone or 'none']
  City: [city]
  Industry: [industry]
  Rating: [rating]
  Score: [score]/100
  Description: [from research report]
  Pain points: [from research report]
  High-value: [yes/no]

When done, return your report text and stop. Do NOT call any handoff or transfer tool.

ANTI-FABRICATION RULES (MANDATORY):
- NEVER score a lead without calling score_lead(). The tool does the scoring — not you.
- NEVER qualify a lead that was not in the research report.
- NEVER fabricate a score. Use only the score returned by score_lead().
- The lead_id must be the exact integer from the research report.
"""


@tool
def score_lead(
    lead_name: str,
    industry: str,
    city: str,
    rating: float,
    review_count: int,
    has_email: str,
    has_phone: str,
    website_description: str,
    icp_industry: str,
    icp_location: str,
    campaign_goal: str,
) -> str:
    """
    Score a lead against the ICP using a deterministic rubric (0-100).
    Returns score, QUALIFIED/REJECTED decision, priority, HIGH_VALUE flag, and top reasons.

    has_email and has_phone accept "true"/"false" strings or bool — Groq sometimes
    sends Python True/False which breaks JSON schema validation. Accepting str fixes this.
    """
    def _b(v) -> bool:
        if isinstance(v, bool): return v
        return str(v).strip().lower() in ("true", "1", "yes")
    has_email = _b(has_email)
    has_phone = _b(has_phone)

    score = 0
    reasons = []

    # 1. Industry match (0-20)
    icp_ind = icp_industry.lower()
    lead_ind = industry.lower()
    if icp_ind in lead_ind or lead_ind in icp_ind:
        score += 20
        reasons.append(f"Industry match: '{industry}' ↔ '{icp_industry}' (+20)")
    elif any(w in lead_ind for w in icp_ind.split() if len(w) > 3):
        score += 10
        reasons.append(f"Partial industry match (+10)")
    else:
        reasons.append(f"Industry mismatch: '{industry}' vs '{icp_industry}' (+0)")

    # 2. Location match (0-20)
    icp_loc = icp_location.lower()
    city_l = city.lower()
    if city_l in icp_loc or any(city_l in c for c in icp_loc.replace(",", " ").split()):
        score += 20
        reasons.append(f"Location match: '{city}' in '{icp_location}' (+20)")
    else:
        reasons.append(f"Location mismatch: '{city}' vs '{icp_location}' (+0)")

    # 3. Reputation signals (0-20)
    if rating >= 4.0 and review_count >= 50:
        score += 20
        reasons.append(f"Strong: {rating}★, {review_count} reviews (+20)")
    elif rating >= 3.5 and review_count >= 20:
        score += 14
        reasons.append(f"Good: {rating}★, {review_count} reviews (+14)")
    elif rating >= 3.0 and review_count >= 5:
        score += 8
        reasons.append(f"Moderate: {rating}★, {review_count} reviews (+8)")
    else:
        score += 2
        reasons.append(f"Weak signals (+2)")

    # 4. Contact availability (0-20, penalty if none)
    if has_email and has_phone:
        score += 20
        reasons.append("Full contact: email + phone (+20)")
    elif has_email:
        score += 16
        reasons.append("Email available (+16)")
    elif has_phone:
        score += 10
        reasons.append("Phone only — WhatsApp possible (+10)")
    else:
        score -= 20
        reasons.append("No contact info — critical gap (-20)")

    # 5. Campaign relevance (0-20)
    desc = (website_description or "").lower()
    goal_kws = [w for w in campaign_goal.lower().split() if len(w) > 4]
    hits = sum(1 for kw in goal_kws if kw in desc)
    if hits >= 3:
        score += 20
        reasons.append(f"High relevance: {hits} keyword matches (+20)")
    elif hits >= 1:
        score += 12
        reasons.append(f"Moderate relevance: {hits} match(es) (+12)")
    elif website_description and len(website_description) > 30:
        score += 8
        reasons.append("Has description but low keyword overlap (+8)")
    else:
        score += 3
        reasons.append("Minimal description (+3)")

    score = max(0, min(100, score))

    if score >= 80:
        decision, priority = "QUALIFIED", "HIGH"
    elif score >= 60:
        decision, priority = "QUALIFIED", "MEDIUM"
    elif score >= 40:
        decision, priority = "QUALIFIED", "LOW"
    else:
        decision, priority = "REJECTED", "NONE"

    high_value = score >= 85 and review_count > 100 and has_email
    hv = "\n⭐ HIGH_VALUE — flag for human review" if high_value else ""

    return (
        f"SCORE: {score}/100 | {decision} | {priority}{hv}\n"
        f"Lead: {lead_name} ({industry}, {city})\n"
        f"Reasons:\n" + "\n".join(f"  {i+1}. {r}" for i, r in enumerate(reasons[:3])) + "\n"
        f"Contact: email={'yes' if has_email else 'no'}, phone={'yes' if has_phone else 'no'}"
    )


def create_qualifier_agent(llm=None):
    return create_react_agent(
        model=llm or get_fast_llm(),
        tools=[score_lead, update_lead_status],
        name="qualifier_agent",
        prompt=QUALIFIER_SYSTEM,
    )
