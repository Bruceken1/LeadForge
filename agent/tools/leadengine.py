"""
LeadEngine Tools — wrap the LeadEngine Cloudflare Worker API as LangChain tools.

NOTE: All numeric id parameters are typed as `str` — Groq validates tool call
JSON against the schema strictly and rejects integer-declared params when the
LLM passes them as strings. We coerce with int() inside the function.
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
    try:
        return int(value), None
    except (ValueError, TypeError):
        return None, f"Invalid {name} '{value}' — must be a number."


@tool
def scrape_google_maps(keyword: str, location: str, max_results: int = 20) -> str:
    """
    Scrape Google Maps for local businesses by keyword and location.
    This triggers a FRESH scrape — results are new businesses found right now.
    Returns the scraped leads with id, name, phone, website, address, rating, review_count.
    The 'id' field is what you pass to enrich_lead_email and update_lead_status.
    Example: keyword='restaurants', location='Nairobi, Kenya'
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

    # Check for immediate synchronous response
    try:
        body = r.json()
        immediate = _parse_leads(body)
        if immediate:
            return (
                f"Scrape complete. Found {len(immediate)} leads for '{keyword}' in '{location}':\n"
                + _format_leads(immediate[:20])
            )
    except Exception:
        pass

    # Poll up to 60s for async scrape to complete
    for attempt in range(12):
        time.sleep(5)
        try:
            # Use scrape_id if returned, otherwise poll by status=new
            poll_r = httpx.get(
                f"{_API_URL}/api/leads",
                headers=_headers(),
                params={"status": "new", "limit": max_results, "keyword": keyword},
                timeout=15,
            )
            if poll_r.is_success:
                leads = _parse_leads(poll_r.json())
                if leads:
                    return (
                        f"Scrape complete. Found {len(leads)} leads for '{keyword}' in '{location}':\n"
                        + _format_leads(leads[:20])
                    )
        except httpx.RequestError:
            continue

    return (
        f"Scrape submitted for '{keyword}' in '{location}' but no leads returned after 60s. "
        f"The LeadEngine scraper may still be running — call get_leads(status='new') to check. "
        f"If still empty, proceed with whatever leads are available or report 0 leads found."
    )


def _format_leads(leads: list) -> str:
    """Format a lead list for easy reading by the LLM."""
    lines = []
    for lead in leads:
        lines.append(
            f"  - id={lead.get('id')} | {lead.get('name')} | {lead.get('industry','?')} | "
            f"{lead.get('city','?')} | rating={lead.get('rating','?')} | "
            f"reviews={lead.get('review_count', lead.get('reviews','?'))} | "
            f"email={lead.get('email') or 'none'} | phone={lead.get('phone') or 'none'} | "
            f"website={lead.get('website') or 'none'}"
        )
    return "\n".join(lines)


@tool
def get_leads(status: str = "new", search: str = "", limit: int = 50) -> str:
    """
    Retrieve leads already in the LeadEngine database.
    Use this ONLY to check leads that already exist — it does NOT trigger a new scrape.
    For fresh leads, call scrape_google_maps first.
    status: 'new' | 'contacted' | 'replied' | 'meeting' | 'closed' | 'bounced' | 'all'
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
        return (
            f"Found {len(leads)} leads (status={status}):\n"
            + _format_leads(leads[:20])
        )
    return f"Error fetching leads: HTTP {r.status_code} — {r.text[:200]}"


@tool
def update_lead_status(lead_id: str, status: str, notes: str = "") -> str:
    """
    Update a lead's CRM pipeline stage.
    lead_id: numeric id from scrape_google_maps or get_leads results.
    status: 'new' | 'contacted' | 'replied' | 'meeting' | 'closed' | 'bounced' | 'unsubscribed'
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."

    lid, err = _to_int(lead_id, "lead_id")
    if err:
        return err

    valid = {"new","contacted","replied","meeting","closed","bounced","unsubscribed"}
    if status not in valid:
        return f"Invalid status '{status}'. Must be one of: {', '.join(sorted(valid))}"

    body: dict = {"status": status}
    if notes:
        body["notes"] = notes

    try:
        r = httpx.patch(f"{_API_URL}/api/leads/{lid}", headers=_headers(), json=body, timeout=10)
    except httpx.RequestError as e:
        return f"Network error: {str(e)}"

    if r.is_success:
        return f"Lead {lid} updated to '{status}'" + (f" — {notes}" if notes else "")
    return f"Error: HTTP {r.status_code} — {r.text[:200]}"


@tool
def enrich_lead_email(lead_id: str) -> str:
    """
    Trigger email enrichment for a lead via Apollo.io + Hunter.io.
    lead_id: numeric id from scrape_google_maps or get_leads results.
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
        return f"Network error: {str(e)}"

    if r.is_success:
        lead = r.json()
        email = lead.get("email")
        status = lead.get("email_status", "unknown")
        if email:
            return f"Lead {lid}: email found → {email} (status: {status})"
        return f"Lead {lid}: no email found after enrichment (status: {status})."
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
    Only call AFTER qualifier approved AND personalizer generated content.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."
    if not recipient_email or "@" not in recipient_email:
        return f"Invalid email: '{recipient_email}'."
    if not subject or not body:
        return "Cannot send: subject or body is empty."

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
        return f"Email sent to {recipient_email}. Message ID: {msg_id}"
    err = r.text[:200]
    if r.status_code in (400, 422) and "bounce" in err.lower():
        return f"EMAIL BOUNCED for {recipient_email}: {err}"
    return f"Email failed for {recipient_email}: HTTP {r.status_code} — {err}"


@tool
def send_whatsapp_to_lead(phone: str, message: str) -> str:
    """
    Send a WhatsApp message via Twilio.
    Phone must include country code: +254712345678 (Kenya), +255712345678 (Tanzania).
    Only call AFTER personalizer generated the message content.
    """
    if not _API_URL:
        return "Error: LeadEngine tools not configured."
    if not phone:
        return "Cannot send: no phone number."
    if not message:
        return "Cannot send: message is empty."

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
        return f"WhatsApp sent to {phone}. SID: {sid}"
    return f"WhatsApp failed for {phone}: HTTP {r.status_code} — {r.text[:200]}"


@tool
def get_campaign_stats(campaign_id: Optional[str] = None) -> str:
    """
    Get campaign performance statistics.
    Omit campaign_id for overall stats.
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
        return f"Network error: {str(e)}"

    if r.is_success:
        data = r.json()
        if isinstance(data, dict):
            keys = ["sent", "opened", "replied", "bounced", "meetings", "total_leads", "qualified"]
            stats = " | ".join(f"{k}: {data[k]}" for k in keys if k in data)
            return stats or str(data)
        return str(data)
    return f"Error: HTTP {r.status_code} — {r.text[:200]}"
