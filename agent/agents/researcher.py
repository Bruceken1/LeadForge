"""
Research Agent — Scrapes Google Maps and enriches leads.
"""
from langgraph.prebuilt import create_react_agent
from agent.llm import get_smart_llm
from agent.tools.leadengine import scrape_google_maps, enrich_lead_email
from agent.tools.research import scrape_website, extract_contacts_from_page

RESEARCH_SYSTEM = """\
You are the Research Agent. Find and enrich leads. When done, return your report and stop.

Steps:
1. Call scrape_google_maps with the keyword and location from the brief.
2. For each lead with a website: call scrape_website(url), then extract_contacts_from_page(url).
3. For leads still missing email: call enrich_lead_email(lead_id).
4. Return this report and stop — do not call any other tools after:

=== RESEARCH REPORT ===
Total leads found: X
ICP-matching leads: X
Leads with email: Y
Leads with website: Z

Name: [name]
lead_id: [id]
City: [city]
Industry: [industry]
Rating: [rating] ([reviews] reviews)
Email: [email or 'not found']
Phone: [phone or 'not found']
Website: [url or 'none']
Description: [from scrape_website or 'not available']
Pain points: [3 bullet points]
Decision maker: [title]
======================

CRITICAL RULES:
- Call scrape_google_maps exactly once. Do not retry with different keywords.
- Do NOT call filter_leads_by_icp. The scrape already returns the right leads.
  If filter_leads_by_icp is available as a tool, do not use it — it causes false zeroes.
- Do NOT call get_leads — it returns stale data.
- Do NOT call any transfer tool.
- Report ALL leads returned by scrape_google_maps as ICP-matching.
  The keyword you scrape with IS the ICP industry filter. Trust the scrape results.
- Your final action is to write the RESEARCH REPORT as a plain text message.
  Do NOT call any tool named "report_results", "generate_report", or similar.
"""


def create_research_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[
            scrape_google_maps,
            enrich_lead_email,
            scrape_website,
            extract_contacts_from_page,
        ],
        name="research_agent",
        prompt=RESEARCH_SYSTEM,
    )
