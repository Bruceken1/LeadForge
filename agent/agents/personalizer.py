"""
Personalization & Content Agent — Generates hyper-personalized outreach.
Uses research insights and local context to craft messages.
"""
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from agent.llm import get_smart_llm

PERSONALIZATION_SYSTEM = """
You are the Personalization Agent for LeadForge. You write outreach messages
for East African businesses that feel genuinely researched and human.

WORKFLOW:
1. Call get_local_context(city, industry) to load the East African business context.
2. Call generate_email_sequence(...) with all lead details — this returns a
   structured template you MUST expand into real, personalized content.
3. Return the FULL outreach package for EACH lead in this exact format:

=== OUTREACH: [Company Name] ===
EMAIL SUBJECT: [subject line]
EMAIL BODY:
[full email body]

WHATSAPP:
[whatsapp message]

FOLLOW-UP SUBJECT: [subject]
FOLLOW-UP BODY:
[follow-up email body]
===============================

RULES:
- NEVER use: "I hope this finds you well", "synergy", "leverage", "circle back"
- ALWAYS mention something specific about THEIR business (city, rating, industry)
- Email body: 80-120 words. One clear CTA. No buzzwords.
- WhatsApp: 60 words max. Casual, conversational. One question to invite response.
- Follow-up: 60-80 words. Different angle. Reference first outreach.
- Match formality to industry: law/healthcare = formal, restaurants/retail = casual
- For Kenyan/Tanzanian SMEs, starting WhatsApp with "Habari" is appreciated

After all leads are processed, output:
PERSONALIZATION SUMMARY: Generated outreach for X leads.
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
    Build a structured outreach brief for a lead.
    Returns a detailed brief the agent uses to write the actual messages —
    including suggested angles, tone guidance, and a CTA recommendation.
    """
    # Derive tone from industry
    formal_industries = ["law", "legal", "healthcare", "hospital", "clinic", "corporate", "finance", "bank"]
    is_formal = any(ind in industry.lower() for ind in formal_industries)
    tone = "formal and professional" if is_formal else "warm, casual and conversational"

    # Derive primary channel recommendation
    sme_industries = ["restaurant", "cafe", "hotel", "retail", "shop", "salon", "bar"]
    is_sme = any(ind in industry.lower() for ind in sme_industries)
    primary_channel = "WhatsApp first, then email" if is_sme else "Email first, then WhatsApp"

    # Rating-aware messaging angle
    if rating >= 4.2:
        angle = f"They have a strong {rating}★ reputation — lead with amplifying their visibility/growth"
    elif rating >= 3.5:
        angle = f"Solid {rating}★ rating — lead with helping them stand out in a competitive market"
    else:
        angle = "Avoid mentioning rating — focus entirely on the opportunity and value offered"

    # Pain points context
    pain_str = pain_points if pain_points else "standard SME pain points (online visibility, lead generation, efficiency)"

    # Success pattern context
    success_note = (
        f"Similar past success: {similar_success[:200]}" if similar_success
        else "No similar past success on record — write fresh"
    )

    swahili_opener = ""
    if city.lower() in ["mombasa", "dar es salaam", "zanzibar", "nairobi", "kisumu", "kampala"]:
        swahili_opener = 'Consider opening WhatsApp with "Habari [Name]" for a warm local touch.'

    return (
        f"OUTREACH BRIEF FOR: {company_name}\n"
        f"Industry: {industry} | City: {city} | Rating: {rating}★\n"
        f"Description: {description[:300] if description else 'Not available'}\n"
        f"Pain points to address: {pain_str}\n"
        f"Service to pitch: {service_offered}\n"
        f"Sender name: {sender_name}\n"
        f"Tone: {tone}\n"
        f"Primary channel: {primary_channel}\n"
        f"Messaging angle: {angle}\n"
        f"{swahili_opener}\n"
        f"CTA recommendation: Request a 15-min call or WhatsApp chat — low friction\n"
        f"{success_note}\n"
        f"\nNow write: (1) cold email subject + body, "
        f"(2) WhatsApp message, (3) follow-up email subject + body."
    )


@tool
def get_local_context(city: str, industry: str) -> str:
    """
    Get East African business context for a city and industry.
    Returns tone, cultural, and communication guidance for the target market.
    """
    city_context = {
        "nairobi": (
            "Business hub, fast-paced, tech-savvy. CBD is formal; Westlands/Karen/Kilimani "
            "are more casual and startup-friendly. Decision makers are often accessible on LinkedIn and WhatsApp."
        ),
        "mombasa": (
            "Tourism and trade hub, coastal culture. Mix of Swahili and English in business. "
            "Relationship-oriented — small talk before business is expected. "
            "WhatsApp is the dominant channel. 'Habari' (Swahili greeting) is well-received."
        ),
        "kisumu": (
            "Growing city, vibrant SME scene, Lake Victoria commerce. "
            "Warm and community-oriented culture. Owners are usually hands-on and reachable."
        ),
        "kampala": (
            "Ugandan capital, entrepreneurial, mix of formal and informal business culture. "
            "English is primary, Luganda greetings appreciated. Strong WhatsApp culture."
        ),
        "dar es salaam": (
            "Tanzanian commercial hub. Swahili is primary, English used in formal business. "
            "Relationship-first culture — do not rush to the pitch. Patient, warm tone required."
        ),
        "zanzibar": (
            "Tourism-heavy economy, hospitality and retail dominant. "
            "Swahili culture, relaxed pace, very relationship-oriented."
        ),
        "kigali": (
            "Rwanda's capital, clean and organized business environment. "
            "Formal English communication expected. Tech-forward, entrepreneurial."
        ),
    }

    industry_context = {
        "restaurants": (
            "Usually family-owned or owner-operated. Decision maker = owner or manager. "
            "Pain points: online visibility, delivery partnerships, review management, slow seasons. "
            "Value word-of-mouth. Avoid jargon. Keep it personal and brief."
        ),
        "hotels": (
            "Pain points: direct bookings vs OTA commission, occupancy fluctuations, digital marketing. "
            "Decision maker = GM or owner. Formal tone. Emphasize ROI and occupancy rate improvement."
        ),
        "law": (
            "Very formal, referral-based. Partnership decisions are collective. "
            "Pain points: client acquisition, online reputation, document management. "
            "Use precise, professional language. Avoid any sales-y phrases."
        ),
        "legal": (
            "Same as law firms — formal, referral-driven. Emphasize credibility and confidentiality."
        ),
        "real estate": (
            "Commission-driven. Pain points: lead generation, listing visibility, CRM. "
            "Decision maker = director or senior agent. Always looking for more listings and buyers."
        ),
        "healthcare": (
            "Patient trust and reputation are critical. Regulatory context matters. "
            "Decision maker = practice owner or administrator. Formal tone. Focus on patient experience."
        ),
        "retail": (
            "Owner-operated usually. Pain points: foot traffic, online presence, inventory. "
            "Decision maker = shop owner. Casual, direct tone. Show quick wins."
        ),
        "school": (
            "Decision maker = principal or bursar. Formal tone. "
            "Pain points: parent communication, enrollment, administration efficiency."
        ),
        "ngo": (
            "Mission-driven. Pain points: donor communication, volunteer management, reporting. "
            "Emphasize impact and efficiency gains over revenue."
        ),
    }

    city_lower = city.lower()
    industry_lower = industry.lower()

    city_ctx = next(
        (v for k, v in city_context.items() if k in city_lower),
        "East African business context applies — warm, relationship-first communication recommended."
    )
    industry_ctx = next(
        (v for k, v in industry_context.items() if k in industry_lower),
        "SME typical of East African market — direct value proposition, casual-to-moderate tone."
    )

    return f"CITY CONTEXT ({city}):\n{city_ctx}\n\nINDUSTRY CONTEXT ({industry}):\n{industry_ctx}"


def create_personalization_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[generate_email_sequence, get_local_context],
        name="personalization_agent",
        prompt=PERSONALIZATION_SYSTEM,
    )
