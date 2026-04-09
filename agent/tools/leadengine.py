"""
LeadEngine Tools.
NOTE: All numeric id params typed as str — Groq rejects int/bool schema types
when the LLM passes them as strings. Coerce inside the function.

FIX: scrape_google_maps poll now passes ?keyword= to the LeadEngine API
so only leads matching the current search are returned, not stale results
from previous scrapes of different industries sitting in the shared DB.
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
    _API_URL   = (api_url or "").strip().rstrip("/")
    _API_TOKEN = (token or "").strip()
    _ORG_ID    = (org_id or "").strip()


def _headers():
    token = _API_TOKEN.strip() if _API_TOKEN else ""
    if not token:
        raise ValueError(
            "LEADENGINE_TOKEN is not set. "
            "Pass leadengine_token in the run request or set LEADENGINE_TOKEN env var."
        )
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


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
            f"{l.get('city','?')} | {l.get('rating','?')}★ "
            f"({l.get('review_count', l.get('reviews','?'))} reviews) | "
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
    Waits up to 90 seconds for results. Returns leads with id, name, industry,
    city, rating, review_count, email, phone, website.
    Call this ONCE per run. Do not retry with different keywords.
    """
    if not _API_URL:
        return "Error: tools not configured."

    try:
        r = httpx.post(
            f"{_API_URL}/api/scrape",
            headers=_headers(),
            json={"keyword": keyword, "location": location, "max": max_results},
            timeout=30,
        )
    except (httpx.RequestError, ValueError) as e:
        return f"Error: {e}"

    if r.status_code not in (200, 202):
        return f"Scrape error: HTTP {r.status_code} — {r.text[:200]}"

    # Check for immediate results in the scrape response body
    try:
        leads = _parse_leads(r.json())
        if leads:
            return f"Found {len(leads)} leads:\n{_fmt(leads[:20])}"
    except Exception:
        pass

    # Poll for results. Pass keyword as a search param so we get only the
    # leads from this specific scrape, not stale leads from old scrapes.
    for _ in range(18):
        time.sleep(5)
        try:
            # Attempt with keyword filter first
            poll = httpx.get(
                f"{_API_URL}/api/leads",
                headers=_headers(),
                params={"status": "new", "keyword": keyword,
                        "limit": max_results, "search": keyword},
                timeout=15,
            )
            if poll.is_success:
                leads = _parse_leads(poll.json())
                if leads:
                    return f"Found {len(leads)} leads:\n{_fmt(leads[:20])}"
        except (httpx.RequestError, ValueError):
            continue

    # Final fallback: plain list (researcher will filter with filter_leads_by_icp)
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
                return (
                    f"Found {len(leads)} leads (unfiltered — "
                    f"use filter_leads_by_icp to remove wrong-industry results):\n"
                    f"{_fmt(leads[:20])}"
                )
    except (httpx.RequestError, ValueError):
        pass

    return "Scrape complete but no leads returned. Proceed with 0 leads."


@tool
def enrich_lead_email(lead_id: str) -> str:
    """
    Enrich a lead's email via Apollo/Hunter.
    lead_id: numeric id from scrape results.
    """
    if not _API_URL:
        return "Error: tools not configured."
    lid, err = _to_int(lead_id, "lead_id")
    if err:
        return err
    try:
        r = httpx.post(f"{_API_URL}/api/leads/{lid}/enrich",
                       headers=_headers(), timeout=20)
    except (httpx.RequestError, ValueError) as e:
        return f"Network error: {e}"
    if r.is_success:
        email = r.json().get("email")
        return f"Lead {lid}: email={'found: ' + email if email else 'not found'}"
    return f"Enrichment failed: HTTP {r.status_code}"


@tool
def update_lead_status(lead_id: str, status: str, notes: str = "") -> str:
    """
    Update a lead's CRM status.
    lead_id: numeric id.
    status: new|contacted|replied|meeting|closed|bounced|unsubscribed
    """
    if not _API_URL:
        return "Error: tools not configured."
    lid, err = _to_int(lead_id, "lead_id")
    if err:
        return err
    valid = {"new", "contacted", "replied", "meeting",
             "closed", "bounced", "unsubscribed"}
    if status not in valid:
        return f"Invalid status '{status}'"
    body: dict = {"status": status}
    if notes:
        body["notes"] = notes
    try:
        r = httpx.patch(f"{_API_URL}/api/leads/{lid}",
                        headers=_headers(), json=body, timeout=10)
    except (httpx.RequestError, ValueError) as e:
        return f"Network error: {e}"
    return (f"Lead {lid} → '{status}'" if r.is_success
            else f"Error: HTTP {r.status_code}")


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
    except (httpx.RequestError, ValueError) as e:
        return f"Network error: {e}"
    if r.is_success:
        d = r.json()
        return f"Email sent to {recipient_email}. ID: {d.get('message_id') or d.get('id')}"
    return f"Send failed: HTTP {r.status_code} — {r.text[:150]}"


@tool
def send_whatsapp_to_lead(phone: str, message: str) -> str:
    """
    Send a WhatsApp message. Uses WA_API_URL if set, else falls back to
    LeadEngine Cloudflare Worker.
    """
    import os
    if not phone:
        return "No phone number."
    if not message:
        return "No message."

    phone = phone.strip().replace(" ", "")
    if not phone.startswith("+"):
        phone = "+" + phone

    wa_api_url = os.environ.get("WA_API_URL", "").rstrip("/")
    wa_api_key = os.environ.get("WA_API_KEY", "")

    if wa_api_url and wa_api_key:
        headers = {
            "Authorization": f"Bearer {wa_api_key}",
            "Content-Type": "application/json",
            "X-Org-Id": _ORG_ID,
        }
        payload = {
            "to": phone,
            "template": {
                "language": {"code": "en_US"},
                "components": [{
                    "type": "body",
                    "parameters": [{"type": "text", "text": message[:1024]}]
                }]
            }
        }
        try:
            r = httpx.post(f"{wa_api_url}/messages/template",
                           headers=headers, json=payload, timeout=20)
            if r.is_success:
                msg_id = (r.json().get("data") or {}).get("messageId", "unknown")
                return f"WhatsApp sent to {phone}. messageId: {msg_id}"
            return f"WhatsApp failed for {phone}: HTTP {r.status_code} — {r.text[:300]}"
        except (httpx.RequestError, ValueError) as e:
            return f"Network error sending WhatsApp to {phone}: {e}"

    if not _API_URL:
        return "Error: neither WA_API_URL nor LeadEngine is configured."
    try:
        r = httpx.post(
            f"{_API_URL}/api/outreach/send-whatsapp",
            headers=_headers(),
            json={"phone": phone, "message": message},
            timeout=20,
        )
    except (httpx.RequestError, ValueError) as e:
        return f"Network error sending WhatsApp to {phone}: {e}"
    if r.is_success:
        data = r.json()
        sid = data.get("sid") or data.get("message_sid", "unknown")
        return f"WhatsApp sent to {phone}. SID: {sid}"
    return f"WhatsApp failed for {phone}: HTTP {r.status_code} — {r.text[:150]}"


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
    except (httpx.RequestError, ValueError) as e:
        return f"Network error: {e}"
    if r.is_success:
        d = r.json()
        if isinstance(d, dict):
            keys = ["sent", "opened", "replied", "bounced",
                    "meetings", "total_leads", "qualified"]
            s = " | ".join(f"{k}: {d[k]}" for k in keys if k in d)
            return s or str(d)
        return str(d)
    return f"Error: HTTP {r.status_code}"
