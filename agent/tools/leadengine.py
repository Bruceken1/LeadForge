"""
LeadEngine Tools — wrap your existing Cloudflare Worker API as LangChain tools.
Agents call these to interact with LeadEngine's data layer.
"""
import httpx
import time
from typing import Optional
from langchain_core.tools import tool


# These are injected at runtime from the AgentRunState
_API_URL   = ""
_API_TOKEN = ""
_ORG_ID    = ""


def configure_tools(api_url: str, token: str, org_id: str):
    global _API_URL, _API_TOKEN, _ORG_ID
    _API_URL   = api_url.rstrip("/")
    _API_TOKEN = token
    _ORG_ID    = org_id


def _headers():
    return {"Authorization": f"Bearer {_API_TOKEN}", "Content-Type": "application/json"}


@tool
def scrape_google_maps(keyword: str, location: str, max_results: int = 20) -> str:
    """
    Scrape Google Maps for local businesses by keyword and location.
    Returns a list of businesses with name, phone, website, address, rating.
    Use this to find new leads matching a keyword in a target city.
    Example: keyword='restaurants', location='Mombasa, Kenya'
    """
    # Start the scrape job
    r = httpx.post(
        f"{_API_URL}/api/scrape",
        headers=_headers(),
        json={"keyword": keyword, "location": location, "max": max_results},
        timeout=30,
    )

    if r.status_code not in (200, 202):
        return f"Error starting scrape: {r.status_code} — {r.text[:200]}"

    # Poll for leads — wait up to 45 seconds for scrape to complete
    for attempt in range(9):
        time.sleep(5)
        leads_r = httpx.get(
            f"{_API_URL}/api/leads",
            headers=_headers(),
            params={"status": "new", "limit": max_results},
            timeout=15,
        )
        if leads_r.is_success:
            data = leads_r.json()
            leads = data.get("leads", data) if isinstance(data, dict) else data
            if leads and len(leads) > 0:
                return f"Found {len(leads)} leads: {leads[:10]}"

    # Return whatever we have even if empty
    return f"Scrape completed but no leads found yet. Try get_leads() to check."


@tool
def get_leads(status: str = "new", search: str = "", limit: int = 50) -> str:
    """
    Retrieve leads from LeadEngine database.
    status: 'new' | 'contacted' | 'replied' | 'meeting' | 'closed' | 'all'
    Returns JSON list of leads with all fields.
    """
    r = httpx.get(
        f"{_API_URL}/api/leads",
        headers=_headers(),
        params={"status": status, "search": search, "limit": limit},
        timeout=15,
    )
    if r.is_success:
        data = r.json()
        leads = data.get("leads", data) if isinstance(data, dict) else data
        if not leads:
            return "No leads found in the database."
        return f"Found {len(leads)} leads: {leads[:10]}"
    return f"Error: {r.status_code}"


@tool
def update_lead_status(lead_id: int, status: str, notes: str = "") -> str:
    """
    Update a lead's CRM pipeline stage in LeadEngine.
    status must be one of: new, contacted, replied, meeting, closed, unsubscribed
    """
    body = {"status": status}
    if notes:
        body["notes"] = notes
    r = httpx.patch(
        f"{_API_URL}/api/leads/{lead_id}",
        headers=_headers(),
        json=body,
        timeout=10,
    )
    if r.is_success:
        return f"Lead {lead_id} status updated to '{status}'"
    return f"Error updating lead {lead_id}: {r.status_code}"


@tool
def enrich_lead_email(lead_id: int) -> str:
    """
    Trigger email enrichment for a specific lead using Apollo.io + Hunter.io.
    Searches the lead's website domain for decision-maker email addresses.
    Returns the found email or a status message.
    """
    r = httpx.post(
        f"{_API_URL}/api/leads/{lead_id}/enrich",
        headers=_headers(),
        timeout=20,
    )
    if r.is_success:
        lead = r.json()
        email = lead.get("email")
        return f"Enrichment complete. Email: {email or 'not found'}. Status: {lead.get('email_status')}"
    return f"Enrichment failed: {r.status_code}"


@tool
def send_email_to_lead(
    recipient_email: str,
    subject: str,
    body: str,
    sender_email: str,
    sender_name: str,
) -> str:
    """
    Send a cold outreach email to a lead via Resend.
    Only call this after the Personalization Agent has generated the content
    and the Qualifier Agent has approved the lead.
    """
    r = httpx.post(
        f"{_API_URL}/api/outreach/send-email",
        headers=_headers(),
        json={
            "to": recipient_email,
            "subject": subject,
            "body": body,
            "sender_email": sender_email,
            "sender_name": sender_name,
        },
        timeout=20,
    )
    if r.is_success:
        data = r.json()
        return f"Email sent. Message ID: {data.get('message_id')}"
    return f"Email send failed: {r.status_code} — {r.text[:200]}"


@tool
def send_whatsapp_to_lead(phone: str, message: str) -> str:
    """
    Send a WhatsApp message to a lead via Twilio.
    Phone should include country code e.g. +254712345678.
    Only call this after the Personalization Agent has generated the message.
    """
    r = httpx.post(
        f"{_API_URL}/api/outreach/send-whatsapp",
        headers=_headers(),
        json={"phone": phone, "message": message},
        timeout=20,
    )
    if r.is_success:
        data = r.json()
        return f"WhatsApp message sent. SID: {data.get('sid')}"
    return f"WhatsApp failed: {r.status_code} — {r.text[:200]}"


@tool
def get_campaign_stats(campaign_id: Optional[int] = None) -> str:
    """
    Get campaign performance statistics from LeadEngine.
    Returns sent count, opened count, replied count, bounced count.
    """
    url = f"{_API_URL}/api/campaigns/{campaign_id}" if campaign_id else f"{_API_URL}/api/stats"
    r = httpx.get(url, headers=_headers(), timeout=10)
    if r.is_success:
        return str(r.json())
    return f"Error: {r.status_code}"
