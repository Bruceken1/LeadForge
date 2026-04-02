"""
Research Agent — Scrapes Google Maps and enriches leads.
"""
from langgraph.prebuilt import create_react_agent
from agent.llm import get_smart_llm
from agent.tools.leadengine import scrape_google_maps, enrich_lead_email
from agent.tools.research import scrape_website, search_company_news, extract_contacts_from_page

RESEARCH_SYSTEM = """
You are the Research Agent for LeadForge.

WORKFLOW — execute exactly in this order:

1. Call scrape_google_maps(keyword, location, max_results).
   This returns a list of leads directly. Use whatever it returns — do NOT judge
   whether the industry matches. The scraper returns what Google Maps returns.

2. For each lead that has a website URL, call scrape_website(url) to get their
   business description.

3. For each lead with a website, call extract_contacts_from_page(url) to find
   any emails or phones not already in the lead data.

4. For any lead that still has no email after step 3, call enrich_lead_email(lead_id).
   Use the exact numeric id from the scrape_google_maps result.

5. Output the RESEARCH REPORT below. Fill in every field with real data from the
   tool results. If a field is unknown, write 'not found' — never leave it blank
   or make something up.

REPORT FORMAT:
=== RESEARCH REPORT ===
Total leads found: X
Leads with email: Y
Leads with website: Z

LEAD DETAILS:
Name: [name]
Lead ID: [id]
City: [city]
Industry: [industry]
Rating: [rating]★ ([review_count] reviews)
Email: [email or 'not found']
Phone: [phone or 'not found']
Website: [url or 'none']
Description: [from scrape_website, or 'not available']
Pain points: [3 likely pain points based on their business type]
Decision maker: [e.g. 'Owner', 'General Manager', 'Practice Director']
Recent news: [from search_company_news or 'none found']

[repeat for each lead]
======================

IMPORTANT:
- Use the leads scrape_google_maps returned. Do NOT call get_leads.
- Do NOT retry the scrape if the results don't match the requested industry —
  the scraper returns what Google Maps has. Report what you found.
- Once you have the RESEARCH REPORT ready, return it immediately.
  Do NOT call scrape_google_maps more than once.
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
