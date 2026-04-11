"""
LeadEngine Tools.
NOTE: All numeric id params typed as str — Groq rejects int/bool schema types
when the LLM passes them as strings. Coerce inside the function.
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


def _fmt(leads: list) -> str:
    rows = []
    for l in leads:
        rows.append(
            f"id={l.get('id')} | {l.get('name')} | {l.get('industry','?')} | "
            f"{l.get('city','?')} | {l.get('rating','?')}★ ({l.get('review_count', l.get('reviews','?'))} reviews) | "
            f"email={l.get('email') or 'none'} | phone={l.get('phone') or 'none'} | "
            f"website={l.get('website') or 'none'}"
        )
    return "\n".join(rows)


def _to_int(v, name):
    try:
        return int(v), None
    except (ValueError, TypeError):
        return None, f"Invalid {name} '{v}'"


@tool
def scrape_google_maps(keyword: str, location: str, max_results: int = 20) -> str:
    """
    Trigger a Google Maps scrape for businesses matching keyword and location.
    Waits up to 90 seconds for results. Returns all leads found with id, name,
    industry, city, rating, review_count, email, phone, website.
    Call this ONCE. Do not retry with different keywords.
    Do NOT call filter_leads_by_icp after this — all returned leads are already ICP-matched.
    """
    if not _API_URL:
        return "Error: tools not configured."

    # Trigger scrape
    try:
        r = httpx.post(
            f"{_API_URL}/api/scrape",
            headers=_headers(),
            json={"keyword": keyword, "location": location, "max": max_results},
            timeout=30,
        )
    except httpx.RequestError as e:
        return f"Network error: {e}"

    if r.status_code not in (200, 202):
        return f"Scrape error: HTTP {r.status_code} — {r.text[:200]}"

    # Check for immediate results
    try:
        leads = _parse_leads(r.json())
        if leads:
            return f"Found {len(leads)} leads:\n{_fmt(leads[:20])}"
    except Exception:
        pass

    # Poll all leads — avoid missing leads due to status filter
    for _ in range(18):
        time.sleep(5)
        try:
            poll = httpx.get(
                f"{_API_URL}/api/leads",
                headers=_headers(),
                params={"status": "all", "limit": max_results},
                timeout=15,
            )
            if poll.is_success:
                leads = _parse_leads(poll.json())
                if leads:
                    return f"Found {len(leads)} leads:\n{_fmt(leads[:20])}"
        except httpx.RequestError:
            continue

    return "Scrape complete but no leads returned. Proceed with 0 leads."


@tool
def enrich_lead_email(lead_id: str) -> str:
    """
    Enrich a lead's email via Apollo/Hunter. lead_id: numeric id from scrape results.
    """
    if not _API_URL:
        return "Error: tools not configured."
    lid, err = _to_int(lead_id, "lead_id")
    if err:
        return err
    try:
        r = httpx.post(f"{_API_URL}/api/leads/{lid}/enrich", headers=_headers(), timeout=20)
    except httpx.RequestError as e:
        return f"Network error: {e}"
    if r.is_success:
        d = r.json()
        email = d.get("email")
        return f"Lead {lid}: email={'found: ' + email if email else 'not found'}"
    return f"Enrichment failed: HTTP {r.status_code}"


@tool
def update_lead_status(lead_id: str, status: str, notes: str = "") -> str:
    """
    Update a lead's CRM status.
    lead_id: numeric id. status: new|contacted|replied|meeting|closed|bounced|unsubscribed
    """
    if not _API_URL:
        return "Error: tools not configured."
    lid, err = _to_int(lead_id, "lead_id")
    if err:
        return err
    valid = {"new","contacted","replied","meeting","closed","bounced","unsubscribed"}
    if status not in valid:
        return f"Invalid status '{status}'"
    body: dict = {"status": status}
    if notes:
        body["notes"] = notes
    try:
        r = httpx.patch(f"{_API_URL}/api/leads/{lid}", headers=_headers(), json=body, timeout=10)
    except httpx.RequestError as e:
        return f"Network error: {e}"
    return f"Lead {lid} → '{status}'" if r.is_success else f"Error: HTTP {r.status_code}"


@tool
def send_email_to_lead(
    recipient_email: str,
    subject: str,
    body: str,
    sender_email: str,
    sender_name: str,
) -> str:
    """Send outreach email via Resend. All fields required."""
    if not _API_URL:
        return "Error: tools not configured."
    if not recipient_email or "@" not in recipient_email:
        return f"Invalid email: '{recipient_email}'"
    if not subject or not body:
        return "Missing subject or body."
    try:
        r = httpx.post(
            f"{_API_URL}/api/outreach/send-email",
            headers=_headers(),
            json={"to": recipient_email, "subject": subject, "body": body,
                  "sender_email": sender_email, "sender_name": sender_name},
            timeout=20,
        )
    except httpx.RequestError as e:
        return f"Network error: {e}"
    if r.is_success:
        d = r.json()
        return f"Email sent to {recipient_email}. ID: {d.get('message_id') or d.get('id')}"
    return f"Send failed: HTTP {r.status_code} — {r.text[:150]}"


@tool
def send_whatsapp_to_lead(phone: str, message: str) -> str:
    """Send WhatsApp via Twilio. Phone must include country code e.g. +254712345678."""
    if not _API_URL:
        return "Error: tools not configured."
    if not phone:
        return "No phone number."
    if not message:
        return "No message."
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
        return f"Network error: {e}"
    if r.is_success:
        d = r.json()
        return f"WhatsApp sent to {phone}. SID: {d.get('sid') or d.get('message_sid')}"
    return f"WhatsApp failed: HTTP {r.status_code} — {r.text[:150]}"


@tool
def get_campaign_stats(campaign_id: Optional[str] = None) -> str:
    """Get campaign stats. Omit campaign_id for overall stats."""
    if not _API_URL:
        return "Error: tools not configured."
    url = f"{_API_URL}/api/stats"
    if campaign_id:
        cid, err = _to_int(campaign_id, "campaign_id")
        if err:
            return err
        url = f"{_API_URL}/api/campaigns/{cid}"
    try:
        r = httpx.get(url, headers=_headers(), timeout=10)
    except httpx.RequestError as e:
        return f"Network error: {e}"
    if r.is_success:
        d = r.json()
        if isinstance(d, dict):
            keys = ["sent","opened","replied","bounced","meetings","total_leads","qualified"]
            s = " | ".join(f"{k}: {d[k]}" for k in keys if k in d)
            return s or str(d)
        return str(d)
    return f"Error: HTTP {r.status_code}"
