"""
Research Agent — Goes deeper than raw Google Maps data.
Scrapes websites, finds decision makers, extracts pain points.
"""
from langgraph.prebuilt import create_react_agent
from agent.llm import get_smart_llm
from agent.tools.leadengine import (
    scrape_google_maps, get_leads, enrich_lead_email,
)
from agent.tools.research import (
    scrape_website, search_company_news, extract_contacts_from_page,
)

RESEARCH_SYSTEM = """
You are the Research Agent for LeadForge, an autonomous SDR system targeting East African businesses.

Your job:
1. Use scrape_google_maps to find businesses matching the campaign criteria
2. For each business found, use scrape_website to understand what they do
3. Use extract_contacts_from_page to find any visible emails or phones
4. Use search_company_news to check for recent news, funding, or notable mentions
5. Use enrich_lead_email to trigger Apollo/Hunter enrichment for email discovery
6. Summarize your findings: what pain points does this business likely have?
   What services would they benefit from? Who is likely the decision maker?

Output a structured summary for each lead including:
- Company description (2 sentences max)
- Likely pain points (list of 3)
- Potential decision maker title
- Tech stack if visible
- Any notable recent news

Be efficient: if scraping fails, note it and move on. Do not get stuck on one lead.
Target industries in East Africa: restaurants, hotels, real estate, law firms,
healthcare, schools, NGOs, tech startups, retail.
"""


def create_research_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[
            scrape_google_maps,
            get_leads,
            enrich_lead_email,
            scrape_website,
            search_company_news,
            extract_contacts_from_page,
        ],
        name="research_agent",
        prompt=RESEARCH_SYSTEM,
    )
