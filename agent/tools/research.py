"""
Research Tools — website scraping and company intelligence.
Used by the Research Agent to go deeper than Google Maps data.
"""
import httpx
import re
from langchain_core.tools import tool


@tool
def scrape_website(url: str) -> str:
    """
    Fetch and extract text content from a company website.
    Use this to understand what a business does, their services,
    team, and any visible contact information.
    Returns the first 3000 characters of extracted text.
    """
    if not url.startswith("http"):
        url = f"https://{url}"
    try:
        r = httpx.get(
            url,
            follow_redirects=True,
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (research bot)"},
        )
        # Very basic HTML → text extraction (no BeautifulSoup to keep deps light)
        text = r.text
        text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>",  " ", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:3000] if text else "Could not extract content from website."
    except Exception as e:
        return f"Could not fetch website: {str(e)}"


@tool
def search_company_news(company_name: str, location: str = "Kenya") -> str:
    """
    Search for recent news or social media mentions about a company.
    Uses SerpApi Google News to find recent articles.
    Returns up to 5 recent results.
    """
    import os
    serpapi_key = os.environ.get("SERPAPI_KEY", "")
    if not serpapi_key:
        return "SerpApi key not configured — skipping news search."

    try:
        r = httpx.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google_news",
                "q": f"{company_name} {location}",
                "gl": "ke",
                "hl": "en",
                "api_key": serpapi_key,
            },
            timeout=10,
        )
        if r.is_success:
            results = r.json().get("news_results", [])[:5]
            if not results:
                return f"No recent news found for {company_name}."
            snippets = [f"- {a.get('title', '')}: {a.get('snippet', '')}" for a in results]
            return "\n".join(snippets)
    except Exception as e:
        return f"News search error: {str(e)}"
    return "No results."


@tool
def extract_contacts_from_page(url: str) -> str:
    """
    Extract email addresses and phone numbers visible on a website.
    Useful for finding contact info not in Google Maps.
    """
    if not url.startswith("http"):
        url = f"https://{url}"
    try:
        r = httpx.get(url, follow_redirects=True, timeout=10,
                      headers={"User-Agent": "Mozilla/5.0"})
        text = r.text
        emails = list(set(re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)))
        phones = list(set(re.findall(r"(?:\+254|0)[7]\d{8}", text)))
        return f"Emails found: {emails[:5]} | Phones found: {phones[:5]}"
    except Exception as e:
        return f"Contact extraction error: {str(e)}"
