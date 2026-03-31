"""
Personalization & Content Agent — Generates hyper-personalized outreach.
Uses research insights and RAG (similar past successes) to craft messages.
"""
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from agent.llm import get_smart_llm

PERSONALIZATION_SYSTEM = """
You are the Personalization Agent for LeadForge. You write outreach messages
for East African businesses that feel genuinely researched and human.

Given a lead's enriched profile (name, industry, city, website description,
pain points, recent news), write:

1. COLD EMAIL:
   - Subject: 8 words max, specific to their business
   - Body: 80-120 words. Opening must reference something specific (their rating,
     city, something from their website). One clear CTA. No buzzwords.
   - Sign-off: Include sender name

2. WHATSAPP MESSAGE:
   - 60 words max. Casual, conversational tone.
   - Can start with "Habari" (Swahili) for Kenya/Tanzania leads if appropriate.
   - No formal salutations. Direct value statement. One question to invite response.

3. FOLLOW-UP EMAIL (for step 2 of sequence):
   - Different angle from the first email.
   - Reference that you reached out before.
   - Share a brief relevant insight or statistic.
   - Shorter: 60-80 words.

CRITICAL RULES:
- NEVER use: "I hope this finds you well", "synergy", "leverage", "circle back"
- ALWAYS mention something specific about THEIR business
- East African businesses value relationship-building — be warm, not transactional
- If the lead is a restaurant in Mombasa, reference Mombasa specifically
- If they have a low rating (< 3.5), do NOT mention it — focus on opportunity
- Match the formality to the industry (law firms = formal, restaurants = casual)
"""


@tool
def generate_email_sequence(
    company_name: str,
    city: str,
    industry: str,
    rating: float,
    description: str,
    pain_points: str,
    sender_name: str,
    service_offered: str,
    similar_success: str = "",
) -> str:
    """
    Generate a full 2-step email sequence + WhatsApp message for a lead.
    Returns a structured dict with email_subject, email_body, follow_up_subject,
    follow_up_body, and whatsapp_body.
    The LLM will use this tool to structure its output.
    """
    return (
        f"Generate outreach for: {company_name} ({industry}) in {city}. "
        f"Rating: {rating}. Description: {description[:200]}. "
        f"Pain points: {pain_points}. "
        f"Sender: {sender_name}. Service: {service_offered}. "
        f"Past success context: {similar_success[:300] if similar_success else 'None available'}"
    )


@tool
def get_local_context(city: str, industry: str) -> str:
    """
    Get East African business context for a city and industry.
    Helps the agent write messages that resonate locally.
    """
    context = {
        "Nairobi": "Business hub, fast-paced, tech-savvy, formal in CBD, casual in Westlands/Karen.",
        "Mombasa": "Tourism and trade hub, coastal culture, mix of Swahili and English, relationship-oriented.",
        "Kisumu": "Growing city, vibrant SME scene, Lake Victoria commerce, warm and community-oriented.",
        "Kampala": "Ugandan capital, entrepreneurial, mix of formal and informal business culture.",
        "Dar es Salaam": "Tanzanian commercial hub, Swahili business culture, relationship-first.",
    }
    industry_ctx = {
        "restaurants": "Often family-owned, decision maker is usually the owner/manager, value word-of-mouth.",
        "hotels": "Occupancy and direct bookings are pain points, digital presence matters a lot.",
        "law firms": "Very formal, referral-based, partnership decisions are collective.",
        "real estate": "Commission-driven, always looking for leads and listings visibility.",
        "healthcare": "Patient trust and reputation are critical, regulatory context matters.",
    }
    city_ctx    = context.get(city, "East African business context applies.")
    ind_ctx     = industry_ctx.get(industry.lower(), "SME typical of East African market.")
    return f"City: {city_ctx} | Industry: {ind_ctx}"


def create_personalization_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[generate_email_sequence, get_local_context],
        name="personalization_agent",
        prompt=PERSONALIZATION_SYSTEM,
    )
