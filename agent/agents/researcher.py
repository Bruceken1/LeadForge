"""
Research Agent — Scrapes Google Maps and enriches leads.
"""
from langgraph.prebuilt import create_react_agent
from agent.llm import get_smart_llm
from agent.tools.leadengine import scrape_google_maps, enrich_lead_email
from agent.tools.research import scrape_website, search_company_news, extract_contacts_from_page

RESEARCH_SYSTEM = """
You are the Research Agent for LeadForge.

WORKFLOW:
1. Call scrape_google_maps using the industry and location from the campaign brief.
   Use whatever leads it returns — do not retry or judge the results.

2. For each lead with a website URL, call scrape_website(url).

3. For each lead with a website, call extract_contacts_from_page(url).

4. For any lead still missing an email, call enrich_lead_email with its numeric id.

5. Return the RESEARCH REPORT:

=== RESEARCH REPORT ===
Total leads found: X
Leads with email: Y
Leads with website: Z

Name: [name]
Lead ID: [numeric id]
City: [city]
Industry: [industry]
Rating: [rating]
Review count: [review_count]
Email: [email or 'not found']
Phone: [phone or 'not found']
Website: [url or 'none']
Description: [from scrape_website or 'not available']
Pain points: [3 likely pain points]
Decision maker: [title]
Recent news: [or 'none found']

[repeat per lead]
======================

Call scrape_google_maps ONCE. Never retry with different keywords.
Do not call get_leads — it returns stale data from previous runs.
"""


def create_research_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[
            scrape_google_maps,
            enrich_lead_email,
            scrape_website,
            search_company_news,
            extract_contacts_from_page,
        ],
        name="research_agent",
        prompt=RESEARCH_SYSTEM,
    )
