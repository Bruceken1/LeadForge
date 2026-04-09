"""
Researcher Agent — Lead Discovery with ICP-Filtered Results

FIXES vs previous version:
1. Added a filter_leads_by_icp tool that the researcher MUST call after
   scrape_google_maps. This is a deterministic Python function — no LLM
   involved — that discards leads whose industry doesn't match the ICP.
   This is the first line of defense against stale cross-industry results.

2. System prompt restructured: the workflow is now numbered and imperative
   so the LLM follows it step by step instead of skipping steps.

3. "RESEARCH REPORT" output replaced with a structured per-lead block that
   the qualifier and personalizer agents can parse unambiguously.

4. Explicit STOP after writing the report — no tool calls after the final
   text output.
"""
import httpx
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from agent.llm import get_smart_llm
from agent.tools.leadengine import scrape_google_maps, _API_URL, _headers
from agent.tools.research import scrape_website, extract_contacts_from_page

RESEARCHER_SYSTEM = """\
You are the Research Agent for LeadForge. You find, enrich, and filter leads
that match the campaign ICP (Ideal Customer Profile).

AVAILABLE TOOLS — call ONLY these:
  • scrape_google_maps(keyword, location, max_results)
  • filter_leads_by_icp(leads_text, icp_industry)   ← MANDATORY after every scrape
  • get_buy_signals(hours_back)
  • scrape_website(url)
  • extract_contacts_from_page(url)
  • search_business_news(company_name, city)
  • detect_pain_points(industry, city, review_count, description, rating)

There is NO report tool. Do NOT call generate_report, submit_report, or any
tool not listed above. Your final text output IS the report.

WORKFLOW — follow these steps in order:
1. Call get_buy_signals(48) to get priority leads.
2. Call scrape_google_maps(keyword=<ICP industry>, location=<ICP location>).
3. IMMEDIATELY call filter_leads_by_icp(leads_text=<full output from step 2>,
   icp_industry=<ICP industry>). This removes wrong-industry leads.
   Only proceed with leads that PASS the filter.
4. For each passing lead that has a website: call scrape_website(url), then
   extract_contacts_from_page(url) to find email addresses.
5. For leads with 50+ reviews: call search_business_news(company_name, city).
6. For each remaining lead: call detect_pain_points(...).
7. Write your RESEARCH REPORT as plain text (format below) and STOP.
   Do not call any more tools after writing the report.

ICP FILTER RULE:
- If filter_leads_by_icp returns 0 leads, write:
  "=== RESEARCH REPORT ===
  0 ICP-matching leads found. Reason: all scraped leads were wrong industry.
  === END RESEARCH REPORT ==="
  Then stop. Do not fabricate leads.

OUTPUT FORMAT:
=== RESEARCH REPORT ===
Total leads found: X
ICP-matching leads: Y
Leads with email: Z

Name: [name]
lead_id: [id]
City: [city]
Industry: [industry]
Rating: [rating] ([reviews] reviews)
Email: [email or 'not found']
Phone: [phone or 'not found']
Website: [url or 'none']
Description: [from scrape_website or Google Maps]
Recent news: [from search_business_news or 'none']
Buy signal: [true/false + type]
Pain points: [from detect_pain_points]
Decision maker: [from website About/Team or 'unknown']

[repeat block for each lead]
=== END RESEARCH REPORT ===

ANTI-FABRICATION:
- Only report data from tool results. Never invent fields.
- If a website is unreachable, note "website unreachable" — do not guess.
- If 0 leads pass the ICP filter, say so and stop.
"""


@tool
def filter_leads_by_icp(leads_text: str, icp_industry: str) -> str:
    """
    Filter a leads text block from scrape_google_maps, keeping only leads
    whose industry matches the ICP industry. Discards stale results from
    previous scrapes of different industries.

    leads_text: full text output from scrape_google_maps
    icp_industry: the target industry string (e.g. "restaurants", "hotels")

    Returns the filtered leads text, or a message if none match.
    """
    if not leads_text or not icp_industry:
        return "filter_leads_by_icp: missing input — returning all leads unfiltered."

    icp_lower = icp_industry.lower().rstrip("s")  # "restaurants" → "restaurant"

    # Build synonyms for common industries
    synonyms: dict[str, list[str]] = {
        "restaurant": ["restaurant", "cafe", "eatery", "diner", "food", "bar", "grill",
                       "bistro", "fast food", "pizza", "burger"],
        "hotel": ["hotel", "lodge", "resort", "hostel", "accommodation", "inn", "motel"],
        "school": ["school", "college", "academy", "institute", "university", "kindergarten"],
        "hospital": ["hospital", "clinic", "health", "medical", "pharmacy", "dispensary"],
        "retail": ["retail", "shop", "store", "supermarket", "boutique", "market"],
        "logistics": ["logistics", "courier", "transport", "freight", "delivery"],
        "real estate": ["real estate", "property", "estate", "realty"],
    }

    allowed_terms = synonyms.get(icp_lower, [icp_lower])

    lines = leads_text.split("\n")
    kept_leads: list[str] = []
    current_lead: list[str] = []
    discarded = 0
    kept = 0

    for line in lines:
        stripped = line.strip()

        # Detect lead separator lines like "id=520 | Zen Garden | Restaurant | ..."
        if stripped.startswith("id="):
            if current_lead:
                lead_block = "\n".join(current_lead)
                # Check if industry field matches
                industry_val = ""
                for part in lead_block.split("|"):
                    part = part.strip()
                    # The format is: id=X | Name | Industry | City | ...
                for i, part in enumerate(lead_block.split("|")):
                    if i == 2:  # third pipe-separated token is industry
                        industry_val = part.strip().lower()
                        break

                if any(term in industry_val for term in allowed_terms):
                    kept_leads.append(lead_block)
                    kept += 1
                else:
                    discarded += 1
                current_lead = []
            current_lead.append(line)
        else:
            current_lead.append(line)

    # Process last lead
    if current_lead:
        lead_block = "\n".join(current_lead)
        industry_val = ""
        for i, part in enumerate(lead_block.split("|")):
            if i == 2:
                industry_val = part.strip().lower()
                break
        if any(term in industry_val for term in allowed_terms):
            kept_leads.append(lead_block)
            kept += 1
        else:
            discarded += 1

    if not kept_leads:
        return (
            f"ICP FILTER RESULT: 0 leads matched industry '{icp_industry}'. "
            f"{discarded} leads discarded (wrong industry). "
            f"Do NOT proceed to qualifier_agent. Stop and report 0 ICP-matching leads."
        )

    header = (
        f"ICP FILTER RESULT: {kept} leads matched '{icp_industry}' "
        f"({discarded} discarded as wrong industry).\n"
    )
    return header + "\n".join(kept_leads)


@tool
def get_buy_signals(hours_back: int = 48) -> str:
    """
    Fetch leads that have triggered buy signals in the last N hours.
    Returns leads sorted by priority_boost (highest first).
    """
    if not _API_URL:
        return "Buy signals: tools not configured — skipping."
    try:
        r = httpx.get(
            f"{_API_URL}/api/buy-signals",
            headers=_headers(),
            params={"hours_back": hours_back, "processed": False, "limit": 10},
            timeout=10,
        )
        if r.is_success:
            signals = r.json()
            if not signals:
                return f"No buy signals in the last {hours_back} hours."
            lines = [f"BUY SIGNALS — last {hours_back}h ({len(signals)} found):"]
            for s in signals[:10]:
                data = s.get("data") or {}
                lines.append(
                    f"  - [{s.get('signal_type','?')}] {data.get('name', 'Unknown')} "
                    f"in {data.get('city', '?')} | boost=+{s.get('priority_boost', 0)} "
                    f"| source={s.get('source','?')}"
                )
            return "\n".join(lines)
        return f"Buy signals API error: HTTP {r.status_code}"
    except httpx.RequestError as e:
        return f"Buy signals network error: {e}"


@tool
def search_business_news(company_name: str, city: str) -> str:
    """
    Search for recent news about a business: funding, expansion, awards,
    new locations, leadership changes, product launches. Requires SERPAPI_KEY.
    """
    import os
    serpapi_key = os.environ.get("SERPAPI_KEY", "")
    if not serpapi_key:
        return "News search skipped — SERPAPI_KEY not configured."
    try:
        r = httpx.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google_news",
                "q": f"{company_name} {city}",
                "gl": "ke", "hl": "en",
                "api_key": serpapi_key,
            },
            timeout=10,
        )
        if r.is_success:
            results = r.json().get("news_results", [])[:5]
            if not results:
                return f"No recent news found for {company_name}."
            buy_keywords = {"funding", "expansion", "opened", "awarded", "launch",
                            "investment", "raised", "new location", "acquired"}
            lines = [f"NEWS for {company_name} ({city}):"]
            for a in results:
                title   = a.get("title", "")
                snippet = a.get("snippet", "")
                date    = a.get("date", "")
                tag     = " [BUY SIGNAL]" if any(
                    kw in (title + snippet).lower() for kw in buy_keywords
                ) else ""
                lines.append(f"  - {title} ({date}){tag}: {snippet[:120]}")
            return "\n".join(lines)
        return f"News search error: HTTP {r.status_code}"
    except Exception as e:
        return f"News search error: {e}"


@tool
def detect_pain_points(industry: str, city: str, review_count: int,
                        description: str, rating: float) -> str:
    """
    Infer the top 3 pain points for a business based on industry, location,
    review count, and description. Used to personalise outreach.
    """
    pain_map = {
        "restaurant": [
            "managing online orders and delivery platforms",
            "attracting customers during off-peak hours",
            "building a loyal customer base beyond walk-ins",
        ],
        "cafe": [
            "standing out in a crowded coffee market",
            "driving repeat visits and loyalty",
            "managing peak-hour staffing",
        ],
        "hotel": [
            "competing with Airbnb and booking platforms",
            "maximising occupancy during low season",
            "managing online reputation and reviews",
        ],
        "retail": [
            "competing with online stores and Jumia",
            "managing inventory and stock levels",
            "driving foot traffic and repeat purchases",
        ],
        "healthcare": [
            "patient appointment scheduling and no-shows",
            "managing patient communication",
            "standing out in an increasingly competitive market",
        ],
        "logistics": [
            "route optimisation and fuel costs",
            "real-time shipment tracking",
            "driver management and accountability",
        ],
        "school": [
            "student enrollment and retention",
            "parent communication and engagement",
            "fee collection and financial management",
        ],
    }

    ind_lower = industry.lower()
    matched = None
    for key, pains in pain_map.items():
        if key in ind_lower:
            matched = pains[:]
            break

    if not matched:
        matched = [
            "generating consistent new customer leads",
            "building an online presence and credibility",
            "managing customer relationships efficiently",
        ]

    if rating < 3.5:
        matched = matched[:2] + ["improving online reputation and customer reviews"]
    if review_count < 20:
        matched = matched[:2] + ["getting more Google reviews and visibility"]

    return (
        f"PAIN POINTS for {industry} in {city}:\n"
        + "\n".join(f"  {i+1}. {p}" for i, p in enumerate(matched[:3]))
    )


def create_research_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[
            scrape_google_maps,
            filter_leads_by_icp,
            get_buy_signals,
            scrape_website,
            extract_contacts_from_page,
            search_business_news,
            detect_pain_points,
        ],
        name="research_agent",
        prompt=RESEARCHER_SYSTEM,
    )
