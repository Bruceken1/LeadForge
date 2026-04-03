"""
LeadEngine Tools — wrap the LeadEngine Cloudflare Worker API as LangChain tools.
"""
import httpx
import time
from typing import Optional
from langchain_core.tools import tool

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


def _parse_leads(data) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("leads", "results", "data", "items"):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []


@tool
def scrape_google_maps(keyword: str, location: str, max_results: int = 20) -> str:
    """
    Scrape Google Maps for local businesses by keyword and location.
    This triggers a background scrape job and waits up to 90 seconds for results.
    Returns leads with name, phone, website, address, rating, review count, and lead_id.
    ALWAYS call this first before get_leads().
    Example: keyword='law firms', location='Nairobi, Kenya'
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    # Record lead count BEFORE scrape so we can detect new leads
    try:
        before_r = httpx.get(
            f"{_API_URL}/api/leads",
            headers=_headers(),
            params={"status": "new", "limit": 200},
            timeout=15,
        )
        leads_before = len(_parse_leads(before_r.json())) if before_r.is_success else 0
    except Exception:
        leads_before = 0

    # Trigger the scrape job
    try:
        r = httpx.post(
            f"{_API_URL}/api/scrape",
            headers=_headers(),
            json={"keyword": keyword, "location": location, "max": max_results},
            timeout=30,
        )
    except httpx.RequestError as e:
        return f"Network error starting scrape: {str(e)}"

    if r.status_code not in (200, 202):
        return f"Error starting scrape: HTTP {r.status_code} — {r.text[:300]}"

    print(f"Scrape job started for '{keyword}' in '{location}'. Leads before: {leads_before}")

    # Poll for NEW leads — up to 90 seconds (18 × 5s)
    for attempt in range(18):
        time.sleep(5)
        try:
            leads_r = httpx.get(
                f"{_API_URL}/api/leads",
                headers=_headers(),
                params={"status": "new", "limit": max_results},
                timeout=15,
            )
        except httpx.RequestError as e:
            print(f"Polling attempt {attempt+1} error: {e}")
            continue

        if leads_r.is_success:
            leads = _parse_leads(leads_r.json())
            # Accept if we have more leads than before, OR if we have leads after waiting 30s
            new_count = len(leads)
            if new_count > leads_before or (attempt >= 5 and new_count > 0):
                print(f"Scrape complete: {new_count} leads found (was {leads_before})")
                # Return full lead details including lead_id for downstream agents
                lead_summaries = []
                for lead in leads[:max_results]:
                    lead_summaries.append({
                        "lead_id": lead.get("id"),
                        "name": lead.get("name"),
                        "email": lead.get("email"),
                        "phone": lead.get("phone"),
                        "website": lead.get("website"),
                        "address": lead.get("address"),
                        "city": lead.get("city"),
                        "industry": lead.get("industry"),
                        "rating": lead.get("rating"),
                        "reviews": lead.get("reviews"),
                        "status": lead.get("status"),
                    })
                return (
                    f"Scraped {new_count} leads for '{keyword}' in '{location}'.\n"
                    f"LEADS (include lead_id in all downstream calls):\n{lead_summaries}"
                )

    return (
        f"Scrape submitted for '{keyword}' in '{location}' but no new leads detected after 90s. "
        f"Call get_leads(status='new') to check if any arrived."
    )


@tool
def get_leads(status: str = "new", search: str = "", limit: int = 50) -> str:
    """
    Retrieve leads from the LeadEngine database.
    status: 'new' | 'contacted' | 'replied' | 'meeting' | 'closed' | 'bounced' | 'all'
    Returns leads with all fields including lead_id (integer) needed for other tools.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    params: dict = {"status": status, "limit": limit}
    if search:
        params["search"] = search

    try:
        r = httpx.get(f"{_API_URL}/api/leads", headers=_headers(), params=params, timeout=15)
    except httpx.RequestError as e:
        return f"Network error fetching leads: {str(e)}"

    if r.is_success:
        leads = _parse_leads(r.json())
        if not leads:
            return f"No leads found with status='{status}'."
        summaries = [{
            "lead_id": l.get("id"),
            "name": l.get("name"),
            "email": l.get("email"),
            "phone": l.get("phone"),
            "website": l.get("website"),
            "city": l.get("city"),
            "industry": l.get("industry"),
            "rating": l.get("rating"),
            "reviews": l.get("reviews"),
        } for l in leads]
        return f"Found {len(summaries)} leads (status={status}):\n{summaries}"

    return f"Error fetching leads: HTTP {r.status_code} — {r.text[:200]}"


@tool
def update_lead_status(lead_id: int, status: str, notes: str = "") -> str:
    """
    Update a lead's CRM pipeline stage.
    lead_id: integer ID from get_leads or scrape_google_maps results.
    status: new | contacted | replied | meeting | closed | bounced | unsubscribed
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    try:
        lead_id = int(lead_id)
    except (ValueError, TypeError):
        return f"Invalid lead_id '{lead_id}' — must be an integer from lead results."

    valid = {"new", "contacted", "replied", "meeting", "closed", "bounced", "unsubscribed"}
    if status not in valid:
        return f"Invalid status '{status}'. Must be one of: {', '.join(sorted(valid))}"

    body: dict = {"status": status}
    if notes:
        body["notes"] = notes

    try:
        r = httpx.patch(f"{_API_URL}/api/leads/{lead_id}", headers=_headers(), json=body, timeout=10)
    except httpx.RequestError as e:
        return f"Network error updating lead {lead_id}: {str(e)}"

    if r.is_success:
        return f"Lead {lead_id} updated to '{status}'" + (f" — {notes}" if notes else "")
    return f"Error updating lead {lead_id}: HTTP {r.status_code} — {r.text[:200]}"


@tool
def enrich_lead_email(lead_id: int) -> str:
    """
    Trigger email enrichment for a lead using Apollo.io + Hunter.io.
    lead_id: integer ID from lead results. Finds email from the lead's website domain.
    Call this for any lead that has a website but no email.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    try:
        lead_id = int(lead_id)
    except (ValueError, TypeError):
        return f"Invalid lead_id '{lead_id}' — must be an integer."

    try:
        r = httpx.post(f"{_API_URL}/api/leads/{lead_id}/enrich", headers=_headers(), timeout=20)
    except httpx.RequestError as e:
        return f"Network error enriching lead {lead_id}: {str(e)}"

    if r.is_success:
        lead = r.json()
        email = lead.get("email")
        status = lead.get("email_status", "unknown")
        if email:
            return f"Lead {lead_id} enriched. Email: {email} (status: {status})"
        return f"Lead {lead_id} enriched. No email found (status: {status})."
    return f"Enrichment failed for lead {lead_id}: HTTP {r.status_code} — {r.text[:200]}"


@tool
def send_email_to_lead(
    recipient_email: str,
    subject: str,
    body: str,
    sender_email: str,
    sender_name: str,
) -> str:
    """
    Send a cold outreach email via Resend.
    ALL parameters are required. recipient_email must be a real email address.
    Returns a Message ID on success — this is proof the email was sent.
    If no Message ID is returned, the email was NOT sent.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."
    if not recipient_email or "@" not in recipient_email:
        return f"Cannot send: invalid email '{recipient_email}'."
    if not subject:
        return "Cannot send: email subject is empty."
    if not body:
        return "Cannot send: email body is empty."
    if not sender_email or "@" not in sender_email:
        return "Cannot send: sender_email is missing or invalid."

    try:
        r = httpx.post(
            f"{_API_URL}/api/outreach/send-email",
            headers=_headers(),
            json={"to": recipient_email, "subject": subject, "body": body,
                  "sender_email": sender_email, "sender_name": sender_name},
            timeout=20,
        )
    except httpx.RequestError as e:
        return f"Network error sending to {recipient_email}: {str(e)}"

    if r.is_success:
        data = r.json()
        msg_id = data.get("message_id") or data.get("id", "unknown")
        return f"EMAIL SENT to {recipient_email}. Subject: '{subject}'. Message ID: {msg_id}"
    err = r.text[:300]
    if r.status_code in (400, 422) and "bounce" in err.lower():
        return f"EMAIL BOUNCED for {recipient_email}: {err}"
    return f"Email failed for {recipient_email}: HTTP {r.status_code} — {err}"


@tool
def send_whatsapp_to_lead(phone: str, message: str) -> str:
    """
    Send a WhatsApp message via Twilio.
    phone must include country code e.g. +254712345678.
    Returns a Message SID on success — this is proof the message was sent.
    If no SID is returned, the message was NOT sent.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."
    if not phone:
        return "Cannot send WhatsApp: phone number is missing."
    if not message:
        return "Cannot send WhatsApp: message is empty."

    phone = phone.strip()
    if not phone.startswith("+"):
        phone = "+" + phone

    try:
        r = httpx.post(
            f"{_API_URL}/api/outreach/send-whatsapp",
            headers=_headers(),
            json={"phone": phone, "message": message},
            timeout=20,
        )
    except httpx.RequestError as e:
        return f"Network error sending WhatsApp to {phone}: {str(e)}"

    if r.is_success:
        data = r.json()
        sid = data.get("sid") or data.get("message_sid", "unknown")
        return f"WHATSAPP SENT to {phone}. Message SID: {sid}"
    return f"WhatsApp failed for {phone}: HTTP {r.status_code} — {r.text[:200]}"


@tool
def get_campaign_stats(campaign_id: Optional[int] = None) -> str:
    """
    Get campaign performance stats from LeadEngine.
    Returns sent, opened, replied, bounced counts.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    url = f"{_API_URL}/api/campaigns/{campaign_id}" if campaign_id else f"{_API_URL}/api/stats"
    try:
        r = httpx.get(url, headers=_headers(), timeout=10)
    except httpx.RequestError as e:
        return f"Network error fetching stats: {str(e)}"

    if r.is_success:
        data = r.json()
        if isinstance(data, dict):
            keys = ["sent", "opened", "replied", "bounced", "meetings", "total_leads", "qualified"]
            s = " | ".join(f"{k}: {data[k]}" for k in keys if k in data)
            return s if s else str(data)
        return str(data)
    return f"Error fetching stats: HTTP {r.status_code} — {r.text[:200]}"
