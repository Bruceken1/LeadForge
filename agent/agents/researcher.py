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

WORKFLOW (execute in order):
1. Call scrape_google_maps with the keyword and location from the campaign brief.
2. Call get_leads(status='new') to retrieve the leads that were just scraped.
3. For each lead that has a website, call scrape_website(url) to understand their business.
4. Call extract_contacts_from_page(url) on the same website to find hidden emails/phones.
5. If SERPAPI_KEY is available, call search_company_news(company_name, location) for recent mentions.
6. Call enrich_lead_email(lead_id) for any lead that still has no email after step 4.

After processing all leads, return a RESEARCH REPORT in this exact format:

=== RESEARCH REPORT ===
Total leads found: X
Leads with email: Y
Leads with website: Z

LEAD DETAILS:
For each lead:
  Name: [name]
  City: [city]
  Industry: [industry]
  Rating: [rating]★ ([review_count] reviews)
  Email: [email or 'not found']
  Phone: [phone or 'not found']
  Website: [url or 'none']
  Description: [2-sentence summary of what they do]
  Pain points: [3 likely pain points based on their business]
  Decision maker: [likely title e.g. 'Owner', 'General Manager', 'Practice Director']
  Recent news: [any relevant news or 'none found']
======================

Be efficient — if scraping a website fails, note it and continue. Never get stuck on one lead.
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
