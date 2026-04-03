"""
Personalization Agent — Writes real, personalized outreach content per lead.
"""
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from agent.llm import get_smart_llm

PERSONALIZATION_SYSTEM = """
You are the Personalization Agent for LeadForge. You write personalized outreach content
for East African businesses. You receive a list of QUALIFIED LEADS from the qualifier.

MANDATORY WORKFLOW for each qualified lead:
1. Call get_local_context(city, industry) to get cultural/business context.
2. Call generate_outreach_brief(company_name, city, industry, rating, description,
   pain_points, service_offered) to get a writing brief.
3. Using the brief, write the actual messages (do NOT just copy the brief).
4. Return the outreach package in the EXACT format below.

OUTPUT FORMAT — repeat this block for EVERY qualified lead:

=== OUTREACH PACKAGE ===
lead_id: [integer from qualifier — REQUIRED]
name: [company name]
email: [email address]
phone: [phone number or 'none']
EMAIL_SUBJECT: [subject line — max 60 chars]
EMAIL_BODY:
[80-120 word email. Professional. One specific observation about their business.
One clear CTA. No clichés. Signed with sender name.]
WHATSAPP:
[60 word max. Conversational. One open question. No sales pitch.]
FOLLOW_UP_SUBJECT: [subject]
FOLLOW_UP_BODY:
[60-80 words. Different angle from first email. Reference previous contact.]
=======================

RULES:
- NEVER use: "I hope this finds you well", "synergy", "leverage", "circle back", "game-changer"
- ALWAYS reference something specific from their business (rating, city, industry, description)
- Email: 80-120 words, one CTA, professional closing
- WhatsApp: max 60 words, casual, end with a question
- Law/healthcare/corporate = formal English; restaurants/retail/hotels = warm and casual
- Kenya/Tanzania: WhatsApp can start with "Habari" for local businesses
- After all leads done: output "PERSONALIZATION COMPLETE: X packages generated"

When done, return your report text and stop. Do NOT call any handoff or transfer tool.

ANTI-FABRICATION RULES (MANDATORY):
- NEVER invent a lead_id. Use only the integer id from the qualifier's output.
- NEVER fabricate an email address. Use only what the qualifier provided.
- If a lead has no email, still write the content but set email: 'not available'.
- Every message must reference something real about the business from the research/qualifier data.
"""


@tool
def generate_outreach_brief(
    company_name: str,
    city: str,
    industry: str,
    rating: float,
    description: str,
    pain_points: str,
    service_offered: str,
) -> str:
    """
    Generate a structured writing brief for personalizing outreach to a lead.
    Returns tone guidance, messaging angles, and CTA recommendations.
    """
    formal = any(w in industry.lower() for w in ["law", "legal", "healthcare", "hospital", "corporate", "finance"])
    sme = any(w in industry.lower() for w in ["restaurant", "cafe", "hotel", "retail", "shop", "salon"])

    tone = "formal and professional — no contractions, precise language" if formal else "warm and conversational — contractions OK"
    channel = "Email first (formal), then WhatsApp" if formal else "WhatsApp first (higher open rate), then email"

    if rating >= 4.2:
        angle = f"Their {rating}★ reputation is strong — lead with amplifying visibility and growth"
    elif rating >= 3.5:
        angle = f"Solid {rating}★ — lead with standing out in a competitive {industry} market"
    else:
        angle = "Focus on the opportunity and value — avoid mentioning rating"

    pain = pain_points if pain_points else "online visibility, lead generation, client acquisition"
    swahili = 'Consider opening WhatsApp with "Habari" for local warmth.' if city.lower() in ["nairobi", "mombasa", "kisumu", "kampala", "dar es salaam"] else ""

    return (
        f"BRIEF FOR: {company_name} | {industry} | {city} | {rating}★\n"
        f"Description: {description[:300] if description else 'not available'}\n"
        f"Pain points: {pain}\n"
        f"Service: {service_offered}\n"
        f"Tone: {tone}\n"
        f"Channel order: {channel}\n"
        f"Angle: {angle}\n"
        f"{swahili}\n"
        f"CTA: Request a 15-min call or WhatsApp chat — low friction\n"
        f"Now write: (1) email subject + body, (2) WhatsApp message, (3) follow-up subject + body."
    )


@tool
def get_local_context(city: str, industry: str) -> str:
    """
    Get East African business and cultural context for a city and industry.
    Use this before writing any outreach to ensure cultural fit.
    """
    city_ctx = {
        "nairobi": "Business hub, fast-paced, tech-savvy. CBD is formal; Westlands/Karen casual. Decision makers reachable on LinkedIn and WhatsApp.",
        "mombasa": "Coastal, tourism-heavy. Mix of Swahili and English. Relationship-first — small talk expected. WhatsApp dominant. 'Habari' well-received.",
        "kisumu": "Growing SME scene, Lake Victoria commerce. Warm and community-oriented. Owners hands-on and reachable.",
        "kampala": "Ugandan capital, entrepreneurial mix of formal/informal. English primary, Luganda greetings appreciated. Strong WhatsApp culture.",
        "dar es salaam": "Tanzanian hub. Swahili primary, English in formal business. Relationship-first — do not rush to pitch.",
        "kigali": "Rwanda capital, organised. Formal English. Tech-forward and entrepreneurial.",
    }
    ind_ctx = {
        "law": "Very formal, referral-based. Pain: client acquisition, online rep, document management. Use precise, professional language.",
        "legal": "Same as law — formal, referral-driven. Emphasize credibility and confidentiality.",
        "restaurant": "Owner-operated. Pain: visibility, delivery, reviews. Keep it personal and brief. No jargon.",
        "hotel": "Pain: direct bookings vs OTA, occupancy. Formal tone. Emphasize ROI.",
        "real estate": "Commission-driven. Pain: lead gen, listing visibility. Always looking for more clients.",
        "healthcare": "Trust and reputation critical. Formal tone. Focus on patient experience.",
        "retail": "Owner-operated. Pain: foot traffic, online presence. Direct, show quick wins.",
        "school": "Principal or bursar decides. Formal. Pain: parent comms, enrollment.",
    }
    city_lower = city.lower()
    ind_lower = industry.lower()
    c = next((v for k, v in city_ctx.items() if k in city_lower), "East African context: warm, relationship-first communication.")
    i = next((v for k, v in ind_ctx.items() if k in ind_lower), "SME — direct value proposition, moderate tone.")
    return f"CITY ({city}): {c}\nINDUSTRY ({industry}): {i}"


def create_personalization_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[generate_outreach_brief, get_local_context],
        name="personalization_agent",
        prompt=PERSONALIZATION_SYSTEM,
    )
