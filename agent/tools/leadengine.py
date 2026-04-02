"""
LeadEngine Tools — wrap the LeadEngine Cloudflare Worker API as LangChain tools.

IMPORTANT: All lead_id / campaign_id parameters are typed as `str` (not int).
Groq validates tool call JSON against the schema strictly before invoking the
function — if the schema says `integer` but the LLM sends "1" (a string),
Groq raises a 400 validation error before the Python code ever runs.
Typing as `str` and coercing with int() inside the function avoids this.
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


def _to_int(value, name: str):
    """Coerce value to int, returning (int, None) or (None, error_str)."""
    try:
        return int(value), None
    except (ValueError, TypeError):
        return None, f"Invalid {name} '{value}' — must be a number from get_leads results."


@tool
def scrape_google_maps(keyword: str, location: str, max_results: int = 20) -> str:
    """
    Scrape Google Maps for local businesses by keyword and location.
    Returns a list of businesses with name, phone, website, address, rating, and review count.
    Use this as the FIRST step to find new leads for a campaign.
    Example: keyword='law firms', location='Nairobi, Kenya'
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

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

    try:
        immediate_leads = _parse_leads(r.json())
        if immediate_leads:
            return f"Scraped {len(immediate_leads)} leads for '{keyword}' in '{location}': {immediate_leads[:10]}"
    except Exception:
        pass

    for attempt in range(12):
        time.sleep(5)
        try:
            leads_r = httpx.get(
                f"{_API_URL}/api/leads",
                headers=_headers(),
                params={"status": "new", "limit": max_results},
                timeout=15,
            )
            if leads_r.is_success:
                leads = _parse_leads(leads_r.json())
                if leads:
                    return f"Scraped {len(leads)} leads for '{keyword}' in '{location}': {leads[:10]}"
        except httpx.RequestError:
            continue

    return (
        f"Scrape job submitted for '{keyword}' in '{location}' but no leads returned yet. "
        f"Call get_leads(status='new') to retrieve results."
    )


@tool
def get_leads(status: str = "new", search: str = "", limit: int = 50) -> str:
    """
    Retrieve leads from the LeadEngine database.
    status: 'new' | 'contacted' | 'replied' | 'meeting' | 'closed' | 'bounced' | 'all'
    Returns a list of leads with all fields (id, name, email, phone, website, rating, etc.)
    The id field from each lead is what you pass to enrich_lead_email and update_lead_status.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    params = {"status": status, "limit": limit}
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
        return f"Found {len(leads)} leads (status={status}): {leads[:10]}"

    return f"Error fetching leads: HTTP {r.status_code} — {r.text[:200]}"


@tool
def update_lead_status(lead_id: str, status: str, notes: str = "") -> str:
    """
    Update a lead's CRM pipeline stage in LeadEngine.
    lead_id: the numeric id from get_leads results — pass it as a string or number, both work.
    status: 'new' | 'contacted' | 'replied' | 'meeting' | 'closed' | 'bounced' | 'unsubscribed'
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    lid, err = _to_int(lead_id, "lead_id")
    if err:
        return err

    valid_statuses = {"new", "contacted", "replied", "meeting", "closed", "bounced", "unsubscribed"}
    if status not in valid_statuses:
        return f"Invalid status '{status}'. Must be one of: {', '.join(sorted(valid_statuses))}"

    body: dict = {"status": status}
    if notes:
        body["notes"] = notes

    try:
        r = httpx.patch(f"{_API_URL}/api/leads/{lid}", headers=_headers(), json=body, timeout=10)
    except httpx.RequestError as e:
        return f"Network error updating lead {lid}: {str(e)}"

    if r.is_success:
        return f"Lead {lid} status updated to '{status}'" + (f" — notes: {notes}" if notes else "")
    return f"Error updating lead {lid}: HTTP {r.status_code} — {r.text[:200]}"


@tool
def enrich_lead_email(lead_id: str) -> str:
    """
    Trigger email enrichment for a lead using Apollo.io + Hunter.io.
    Searches the lead's website domain for decision-maker email addresses.
    lead_id: the numeric id from get_leads results — pass it as a string or number, both work.
    Call this for any lead that has a website but no email yet.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    lid, err = _to_int(lead_id, "lead_id")
    if err:
        return err

    try:
        r = httpx.post(f"{_API_URL}/api/leads/{lid}/enrich", headers=_headers(), timeout=20)
    except httpx.RequestError as e:
        return f"Network error enriching lead {lid}: {str(e)}"

    if r.is_success:
        lead = r.json()
        email = lead.get("email")
        status = lead.get("email_status", "unknown")
        if email:
            return f"Enrichment complete for lead {lid}. Email found: {email} (status: {status})"
        return f"Enrichment complete for lead {lid}. No email found (status: {status})."
    return f"Enrichment failed for lead {lid}: HTTP {r.status_code} — {r.text[:200]}"


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
    Only call this AFTER the qualifier has approved the lead AND the personalizer has generated content.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."
    if not recipient_email or "@" not in recipient_email:
        return f"Invalid recipient email: '{recipient_email}'. Cannot send."
    if not subject or not body:
        return "Cannot send email: subject or body is empty. Generate content first."

    try:
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
    except httpx.RequestError as e:
        return f"Network error sending email to {recipient_email}: {str(e)}"

    if r.is_success:
        data = r.json()
        msg_id = data.get("message_id") or data.get("id", "unknown")
        return f"Email sent to {recipient_email}. Subject: '{subject}'. Message ID: {msg_id}"
    err = r.text[:200]
    if r.status_code in (400, 422) and "bounce" in err.lower():
        return f"EMAIL BOUNCED for {recipient_email}: {err}"
    return f"Email send failed for {recipient_email}: HTTP {r.status_code} — {err}"


@tool
def send_whatsapp_to_lead(phone: str, message: str) -> str:
    """
    Send a WhatsApp message to a lead via Twilio.
    Phone must include country code, e.g. +254712345678 (Kenya) or +255712345678 (Tanzania).
    Only call this AFTER the personalizer has generated the WhatsApp message content.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."
    if not phone:
        return "Cannot send WhatsApp: no phone number provided."
    if not message:
        return "Cannot send WhatsApp: message content is empty. Generate content first."

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
        return f"WhatsApp sent to {phone}. Message SID: {sid}"
    return f"WhatsApp failed for {phone}: HTTP {r.status_code} — {r.text[:200]}"


@tool
def get_campaign_stats(campaign_id: Optional[str] = None) -> str:
    """
    Get campaign performance statistics from LeadEngine.
    Returns counts for: sent, opened, replied, bounced, and meetings booked.
    campaign_id: optional — omit to get overall stats.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    if campaign_id is not None:
        cid, err = _to_int(campaign_id, "campaign_id")
        if err:
            return err
        url = f"{_API_URL}/api/campaigns/{cid}"
    else:
        url = f"{_API_URL}/api/stats"

    try:
        r = httpx.get(url, headers=_headers(), timeout=10)
    except httpx.RequestError as e:
        return f"Network error fetching stats: {str(e)}"

    if r.is_success:
        data = r.json()
        if isinstance(data, dict):
            stats_keys = ["sent", "opened", "replied", "bounced", "meetings", "total_leads", "qualified"]
            stats_str = " | ".join(f"{k}: {data[k]}" for k in stats_keys if k in data)
            return stats_str if stats_str else str(data)
        return str(data)
    return f"Error fetching stats: HTTP {r.status_code} — {r.text[:200]}"
